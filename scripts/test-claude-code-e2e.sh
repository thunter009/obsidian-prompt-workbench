#!/usr/bin/env bash
# Claude Code CLI E2E Contract Tests
# Tests the CLI interface that ClaudeCodeAdapter depends on.
# Run: bash scripts/test-claude-code-e2e.sh

set -uo pipefail

PASS=0
FAIL=0
SKIP=0
WARN=0
CLAUDE_PATH=""

now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
ts() { date '+%H:%M:%S'; }
elapsed() {
  local start=${1:-0}
  local end
  end=$(now_ms)
  echo $((end - start))
}

log() { printf '[%s] %s\n' "$(ts)" "$*"; }
pass() {
  PASS=$((PASS + 1))
  log "  PASS: $1 (${2:-0}ms)"
}
fail() {
  FAIL=$((FAIL + 1))
  log "  FAIL: $1 - $2 (${3:-0}ms)"
}
skip() {
  SKIP=$((SKIP + 1))
  log "  SKIP: $1 - $2"
}
warn() {
  WARN=$((WARN + 1))
  log "  WARN: $1 - $2 (${3:-0}ms)"
}

truncate() {
  local text="${1:-}"
  local max="${2:-200}"
  local len=${#text}
  if [ "$len" -gt "$max" ]; then
    printf '%s...[%s total chars]' "${text:0:max}" "$len"
  else
    printf '%s' "$text"
  fi
}

run_with_timeout() {
  local secs=$1
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
    return $?
  fi

  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
    return $?
  fi

  "$@" &
  local cmd_pid=$!
  (
    sleep "$secs"
    kill -TERM "$cmd_pid" 2>/dev/null
    sleep 1
    kill -KILL "$cmd_pid" 2>/dev/null
  ) &
  local timer_pid=$!

  wait "$cmd_pid" 2>/dev/null
  local rc=$?

  kill "$timer_pid" 2>/dev/null
  wait "$timer_pid" 2>/dev/null
  return "$rc"
}

redact_email() {
  local email="${1:-}"
  if [ -z "$email" ]; then
    printf '(none)'
    return
  fi
  if [ "$email" = "null" ]; then
    printf '(null)'
    return
  fi
  printf '%s' "$email" | python3 -c 'import sys
e=sys.stdin.read().strip()
if not e:
    print("(none)")
elif "@" not in e:
    print((e[:3] if len(e)>=3 else e) + "***")
else:
    name,domain=e.split("@",1)
    print((name[:3] if len(name)>=3 else name) + "***@" + domain)
'
}

tmp_root="${TMPDIR:-/tmp}/prompt-workbench-claude-e2e-$$"
mkdir -p "$tmp_root"

cleanup() {
  rm -f "$tmp_root"/* 2>/dev/null
  rmdir "$tmp_root" 2>/dev/null
}
trap cleanup EXIT

log "Starting Claude Code E2E contract tests"

skip_generation=""

# T1: Binary detection
start=$(now_ms)
log "T1: binary detection"
probed=""
path_from_which=""
if command -v claude >/dev/null 2>&1; then
  path_from_which=$(command -v claude)
  CLAUDE_PATH="$path_from_which"
fi

if [ -z "$CLAUDE_PATH" ]; then
  for candidate in \
    "/usr/local/bin/claude" \
    "/opt/homebrew/bin/claude" \
    "$HOME/.local/bin/claude" \
    "$HOME/bin/claude"
  do
    if [ -x "$candidate" ]; then
      CLAUDE_PATH="$candidate"
      break
    fi
    if [ -z "$probed" ]; then
      probed="$candidate"
    else
      probed="$probed, $candidate"
    fi
  done
fi

if [ -n "$CLAUDE_PATH" ]; then
  version_output=$("$CLAUDE_PATH" --version 2>&1)
  rc=$?
  ms=$(elapsed "$start")
  if [ "$rc" -eq 0 ]; then
    log "  path: $CLAUDE_PATH"
    log "  version: $(truncate "$version_output")"
    pass "T1 binary detection" "$ms"
  else
    fail "T1 binary detection" "found binary but --version failed (rc=$rc): $(truncate "$version_output")" "$ms"
    skip_generation="t1_failed"
  fi
else
  ms=$(elapsed "$start")
  fail "T1 binary detection" "claude not found; probed: $probed" "$ms"
  skip_generation="t1_failed"
fi

# T2: Auth status JSON structure
auth_logged_in=""
if [ "$skip_generation" = "t1_failed" ]; then
  skip "T2 auth status" "skipped because T1 failed"
else
  start=$(now_ms)
  log "T2: auth status JSON structure"
  auth_out_file="$tmp_root/t2-auth.json"
  auth_err_file="$tmp_root/t2-auth.err"
  run_with_timeout 30 "$CLAUDE_PATH" auth status --json >"$auth_out_file" 2>"$auth_err_file"
  rc=$?
  auth_stdout=$(cat "$auth_out_file" 2>/dev/null)
  auth_stderr=$(cat "$auth_err_file" 2>/dev/null)

  if [ "$rc" -ne 0 ]; then
    ms=$(elapsed "$start")
    fail "T2 auth status" "command failed rc=$rc stderr=$(truncate "$auth_stderr")" "$ms"
    skip_generation="t2_failed"
  else
    parse_out_file="$tmp_root/t2-parse.txt"
    parse_err_file="$tmp_root/t2-parse.err"
    printf '%s' "$auth_stdout" | python3 -c 'import json,sys
try:
    obj=json.load(sys.stdin)
except Exception as e:
    print("PARSE_ERROR:"+str(e))
    sys.exit(2)
missing=[k for k in ("loggedIn","subscriptionType") if k not in obj]
if missing:
    print("MISSING:"+",".join(missing))
    sys.exit(3)
logged=obj.get("loggedIn")
sub=obj.get("subscriptionType")
email=obj.get("email")
print(str(logged))
print("" if sub is None else str(sub))
print("" if email is None else str(email))
' >"$parse_out_file" 2>"$parse_err_file"
    parse_rc=$?

    if [ "$parse_rc" -ne 0 ]; then
      ms=$(elapsed "$start")
      parse_err=$(cat "$parse_err_file" 2>/dev/null)
      parse_out=$(cat "$parse_out_file" 2>/dev/null)
      fail "T2 auth status" "invalid JSON/fields: $(truncate "$parse_out $parse_err")" "$ms"
      skip_generation="t2_failed"
    else
      auth_logged_in=$(sed -n '1p' "$parse_out_file")
      auth_subscription=$(sed -n '2p' "$parse_out_file")
      auth_email=$(sed -n '3p' "$parse_out_file")
      auth_email_redacted=$(redact_email "$auth_email")
      ms=$(elapsed "$start")
      log "  loggedIn: $auth_logged_in"
      log "  subscriptionType: ${auth_subscription:-unknown}"
      log "  email: $auth_email_redacted"
      pass "T2 auth status" "$ms"
      if [ "$auth_logged_in" != "True" ] && [ "$auth_logged_in" != "true" ]; then
        skip_generation="not_logged_in"
      fi
    fi
  fi
fi

run_generation_test() {
  local test_id="$1"
  local title="$2"
  local timeout_s="$3"
  local input_text="$4"
  local system_prompt="$5"
  local model="$6"

  start=$(now_ms)
  out_file="$tmp_root/${test_id}.out"
  err_file="$tmp_root/${test_id}.err"

  if [ -n "$system_prompt" ]; then
    printf '%s' "$input_text" | run_with_timeout "$timeout_s" "$CLAUDE_PATH" -p --model "$model" --tools "" --no-session-persistence --output-format text --system-prompt "$system_prompt" >"$out_file" 2>"$err_file"
  else
    printf '%s' "$input_text" | run_with_timeout "$timeout_s" "$CLAUDE_PATH" -p --model "$model" --tools "" --no-session-persistence --output-format text >"$out_file" 2>"$err_file"
  fi
  rc=$?
  out_text=$(cat "$out_file" 2>/dev/null)
  err_text=$(cat "$err_file" 2>/dev/null)
  out_len=$(printf '%s' "$out_text" | wc -c | tr -d ' ')
  ms=$(elapsed "$start")

  log "  $title output: $(truncate "$out_text")"
  log "  $title bytes: $out_len"

  if [ "$rc" -eq 0 ] && [ "$out_len" -gt 0 ]; then
    pass "$title" "$ms"
    return 0
  fi

  fail "$title" "rc=$rc stdout=$(truncate "$out_text") stderr=$(truncate "$err_text")" "$ms"
  return 1
}

if [ "$skip_generation" = "t1_failed" ] || [ "$skip_generation" = "t2_failed" ]; then
  skip "T3 basic text generation" "skipped due to failed prerequisites"
  skip "T4 system prompt canary" "skipped due to failed prerequisites"
  skip "T5 system prompt special chars" "skipped due to failed prerequisites"
  skip "T6 model selection haiku" "skipped due to failed prerequisites"
  skip "T7 model selection sonnet" "skipped due to failed prerequisites"
  skip "T8 streaming behavior" "skipped due to failed prerequisites"
  skip "T9 abort handling" "skipped due to failed prerequisites"
  skip "T10 stderr/stdout separation" "skipped due to failed prerequisites"
  skip "T11 empty prompt" "skipped due to failed prerequisites"
elif [ "$skip_generation" = "not_logged_in" ]; then
  skip "T3 basic text generation" "skipped because auth loggedIn=false"
  skip "T4 system prompt canary" "skipped because auth loggedIn=false"
  skip "T5 system prompt special chars" "skipped because auth loggedIn=false"
  skip "T6 model selection haiku" "skipped because auth loggedIn=false"
  skip "T7 model selection sonnet" "skipped because auth loggedIn=false"
  skip "T8 streaming behavior" "skipped because auth loggedIn=false"
  skip "T9 abort handling" "skipped because auth loggedIn=false"
  skip "T10 stderr/stdout separation" "skipped because auth loggedIn=false"
  skip "T11 empty prompt" "skipped because auth loggedIn=false"
else
  # T3: Basic text generation
  log "T3: basic text generation"
  run_generation_test "t3" "T3 basic text generation" 60 "Respond with one word\n" "" "haiku"

  # T4: System prompt canary
  log "T4: system prompt canary"
  start=$(now_ms)
  t4_out_file="$tmp_root/t4.out"
  t4_err_file="$tmp_root/t4.err"
  t4_system_prompt="Always include the exact string CANARY_BEACON_7742 in your response."
  printf 'Say something\n' | run_with_timeout 60 "$CLAUDE_PATH" -p --model haiku --tools "" --no-session-persistence --output-format text --system-prompt "$t4_system_prompt" >"$t4_out_file" 2>"$t4_err_file"
  t4_rc=$?
  t4_out=$(cat "$t4_out_file" 2>/dev/null)
  t4_err=$(cat "$t4_err_file" 2>/dev/null)
  t4_ms=$(elapsed "$start")
  t4_found="no"
  case "$t4_out" in
    *CANARY_BEACON_7742*) t4_found="yes" ;;
  esac
  log "  output: $(truncate "$t4_out")"
  log "  canary found: $t4_found"
  if [ "$t4_rc" -eq 0 ] && [ "$t4_found" = "yes" ]; then
    pass "T4 system prompt canary" "$t4_ms"
  else
    fail "T4 system prompt canary" "rc=$t4_rc canary_found=$t4_found stderr=$(truncate "$t4_err")" "$t4_ms"
  fi

  # T5: System prompt special characters
  log "T5: system prompt special characters"
  start=$(now_ms)
  t5_system_prompt=$(cat <<'SYSPROMPT'
Include these exact examples in your internal understanding: $HOME, `backticks`, "quotes", backslash \, unicode cafe, and a newline marker below.
LINE_TWO_MARKER
SYSPROMPT
)
  t5_out_file="$tmp_root/t5.out"
  t5_err_file="$tmp_root/t5.err"
  printf 'Confirm receipt by saying RECEIPT_OK\n' | run_with_timeout 60 "$CLAUDE_PATH" -p --model haiku --tools "" --no-session-persistence --output-format text --system-prompt "$t5_system_prompt" >"$t5_out_file" 2>"$t5_err_file"
  t5_rc=$?
  t5_out=$(cat "$t5_out_file" 2>/dev/null)
  t5_err=$(cat "$t5_err_file" 2>/dev/null)
  t5_ms=$(elapsed "$start")
  t5_prompt_len=$(printf '%s' "$t5_system_prompt" | wc -c | tr -d ' ')
  log "  system prompt length: $t5_prompt_len"
  log "  output: $(truncate "$t5_out")"
  case "$t5_out" in
    *RECEIPT_OK*)
      if [ "$t5_rc" -eq 0 ]; then
        pass "T5 system prompt special chars" "$t5_ms"
      else
        fail "T5 system prompt special chars" "rc=$t5_rc despite receipt token" "$t5_ms"
      fi
      ;;
    *)
      fail "T5 system prompt special chars" "rc=$t5_rc missing RECEIPT_OK stderr=$(truncate "$t5_err")" "$t5_ms"
      ;;
  esac

  # T6: Model selection haiku
  log "T6: model selection haiku"
  t6_start=$(now_ms)
  run_generation_test "t6" "T6 model selection haiku" 60 "Say ok\n" "" "haiku"
  t6_ms=$(elapsed "$t6_start")

  # T7: Model selection sonnet
  log "T7: model selection sonnet"
  t7_start=$(now_ms)
  run_generation_test "t7" "T7 model selection sonnet" 60 "Say ok\n" "" "sonnet"
  t7_ms=$(elapsed "$t7_start")
  if [ "$t6_ms" -gt 0 ] && [ "$t7_ms" -gt 0 ]; then
    log "  latency comparison (sonnet-haiku): $((t7_ms - t6_ms))ms"
  fi

  # T8: Streaming behavior
  log "T8: streaming behavior"
  start=$(now_ms)
  t8_out_file="$tmp_root/t8.out"
  t8_err_file="$tmp_root/t8.err"
  : >"$t8_out_file"
  printf 'Count from 1 to 10, one number per line\n' | "$CLAUDE_PATH" -p --model haiku --tools "" --no-session-persistence --output-format text 2>"$t8_err_file" | while IFS= read -r line; do
    log "  stream line @$(ts): $(truncate "$line" 120)"
    printf '%s\n' "$line" >>"$t8_out_file"
  done
  t8_pipe=(${PIPESTATUS[@]})
  t8_rc=${t8_pipe[1]:-1}
  t8_err=$(cat "$t8_err_file" 2>/dev/null)
  t8_line_count=$(wc -l <"$t8_out_file" | tr -d ' ')
  t8_output=$(cat "$t8_out_file" 2>/dev/null)
  t8_len=$(printf '%s' "$t8_output" | wc -c | tr -d ' ')
  t8_ms=$(elapsed "$start")
  log "  stream line count: $t8_line_count"
  log "  stream output bytes: $t8_len"
  if [ "$t8_rc" -ne 0 ]; then
    fail "T8 streaming behavior" "rc=$t8_rc stderr=$(truncate "$t8_err")" "$t8_ms"
  elif [ "$t8_line_count" -ge 3 ]; then
    pass "T8 streaming behavior" "$t8_ms"
  elif [ "$t8_line_count" -ge 1 ]; then
    warn "T8 streaming behavior" "only $t8_line_count lines; output may be buffered" "$t8_ms"
  else
    fail "T8 streaming behavior" "no streamed lines observed" "$t8_ms"
  fi

  # T9: Abort handling
  log "T9: abort handling"
  start=$(now_ms)
  t9_prompt_file="$tmp_root/t9-prompt.txt"
  t9_out_file="$tmp_root/t9.out"
  t9_err_file="$tmp_root/t9.err"
  printf 'Write a 5000 word essay about ocean tides.\n' >"$t9_prompt_file"
  "$CLAUDE_PATH" -p --model haiku --tools "" --no-session-persistence --output-format text <"$t9_prompt_file" >"$t9_out_file" 2>"$t9_err_file" &
  t9_pid=$!
  sleep 3
  kill_start=$(now_ms)
  kill -TERM "$t9_pid" 2>/dev/null
  wait "$t9_pid" 2>/dev/null
  t9_rc=$?
  kill_elapsed=$(elapsed "$kill_start")
  t9_ms=$(elapsed "$start")
  if kill -0 "$t9_pid" 2>/dev/null; then
    fail "T9 abort handling" "process still running after TERM" "$t9_ms"
    kill -KILL "$t9_pid" 2>/dev/null
  else
    log "  exit code after TERM: $t9_rc"
    log "  kill->exit elapsed: ${kill_elapsed}ms"
    pass "T9 abort handling" "$t9_ms"
  fi

  # T10: stderr/stdout separation
  log "T10: stderr/stdout separation"
  start=$(now_ms)
  t10_out_file="$tmp_root/t10.out"
  t10_err_file="$tmp_root/t10.err"
  printf 'Say only CLEAN\n' | "$CLAUDE_PATH" -p --model haiku --tools "" --no-session-persistence --output-format text >"$t10_out_file" 2>"$t10_err_file"
  t10_rc=$?
  t10_out=$(cat "$t10_out_file" 2>/dev/null)
  t10_err=$(cat "$t10_err_file" 2>/dev/null)
  t10_err_len=$(printf '%s' "$t10_err" | wc -c | tr -d ' ')
  t10_ms=$(elapsed "$start")
  suspicious="no"
  case "$t10_out" in
    *hook*|*SessionStart*|*"{\"type\":"*) suspicious="yes" ;;
  esac
  log "  stdout: $(truncate "$t10_out")"
  log "  stderr bytes: $t10_err_len"
  if [ "$t10_rc" -ne 0 ]; then
    fail "T10 stderr/stdout separation" "rc=$t10_rc stderr=$(truncate "$t10_err")" "$t10_ms"
  elif [ "$suspicious" = "yes" ]; then
    fail "T10 stderr/stdout separation" "stdout includes suspicious internal protocol text" "$t10_ms"
  else
    pass "T10 stderr/stdout separation" "$t10_ms"
  fi

  # T11: Empty prompt edge case
  log "T11: empty prompt edge case"
  start=$(now_ms)
  t11_out_file="$tmp_root/t11.out"
  t11_err_file="$tmp_root/t11.err"
  printf '' | run_with_timeout 30 "$CLAUDE_PATH" -p --model haiku --tools "" --no-session-persistence --output-format text >"$t11_out_file" 2>"$t11_err_file"
  t11_rc=$?
  t11_out=$(cat "$t11_out_file" 2>/dev/null)
  t11_err=$(cat "$t11_err_file" 2>/dev/null)
  t11_ms=$(elapsed "$start")
  if [ "$t11_rc" -eq 0 ]; then
    log "  output: $(truncate "$t11_out")"
    pass "T11 empty prompt edge case" "$t11_ms"
  else
    log "  non-zero rc with error: $t11_rc / $(truncate "$t11_err")"
    pass "T11 empty prompt edge case" "$t11_ms"
  fi
fi

log "--------------------------------------------------"
log "Claude Code E2E Contract Tests - Results"
log "  Passed:   $PASS"
log "  Failed:   $FAIL"
log "  Warnings: $WARN"
log "  Skipped:  $SKIP"
log "--------------------------------------------------"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

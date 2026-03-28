---
shaping: true
---

# Claude Code LLM Provider — Shaping

## Source

> I wanna use my Claude Code Mac subscription via OAuth for the AI provider.
> How can I do that once I select the anthropic value in the dropdown?

Investigation revealed:
- Anthropic Messages API **rejects** OAuth tokens (`sk-ant-oat01-*`) — separate billing by design
- `claude -p` (print mode) is a documented, sanctioned way to use Max subscription programmatically
- OAuth token lives in macOS Keychain under `"Claude Code-credentials"`, read automatically by CLI
- Streaming works via stdout; `--output-format text` gives plain text chunks

---

## Problem

The plugin's "Anthropic" provider requires a separate API key from console.anthropic.com — separate billing from the Max/Pro subscription the user already pays for. There's no way to use the subscription you're already paying for.

## Outcome

Select "Claude Code" from the provider dropdown, pick a model, and immediately use your existing subscription for prompt improvement — zero API keys, zero extra billing, zero configuration.

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Use existing Claude subscription for prompt improvement | Core goal |
| R1 | Zero credential configuration in plugin settings | Must-have |
| R2 | Streaming response (tokens appear as generated) | Must-have |
| R3 | User can select model (haiku/sonnet/opus) | Must-have |
| R4 | Clear feedback when Claude Code not installed/authenticated | Must-have |
| R5 | Works within Obsidian's Electron/Node.js sandbox | Must-have |
| R6 | No ToS violations — uses Claude Code as intended | Must-have |
| R7 | System prompt support (meta-prompt + strategy prompts) | Must-have |
| R8 | Abortable requests (user can cancel mid-stream) | Must-have |

---

## CURRENT: Direct HTTP to Anthropic API

| Part | Mechanism |
|------|-----------|
| **CUR1** | `AnthropicAdapter` makes `fetch()` to `api.anthropic.com/v1/messages` |
| **CUR2** | Auth via `x-api-key` header with user-provided API key |
| **CUR3** | Streaming via SSE (`stream: true`), parsed in adapter |
| **CUR4** | Settings UI: password field for API key, text field for base URL |
| **CUR5** | `createLLMAdapter()` factory dispatches on `provider` string |

---

## A: Spawn `claude -p` subprocess

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | New `ClaudeCodeAdapter` implementing `LLMAdapter` interface | |
| **A2** | Spawns `child_process.spawn('claude', ['-p', '--model', model, '--system-prompt', systemPrompt, '--no-session-persistence', '--tools', '', '--output-format', 'text'])` | |
| **A3** | Pipes user prompt to stdin, yields stdout chunks as `AsyncIterable<string>` | |
| **A4** | Abort via `child.kill()` on signal | |
| **A5** | Auth check: spawn `claude auth status --json` on settings page, display result | |
| **A6** | Settings UI: no API key field — just model selector + auth status indicator | |
| **A7** | Add `'claude-code'` to `LLMProvider` union, update factory | |

## B: Read OAuth token from Keychain, call API directly

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **B1** | Read macOS Keychain via `security find-generic-password -s "Claude Code-credentials" -w` | |
| **B2** | Parse JSON, extract `claudeAiOauth.accessToken` | |
| **B3** | Call Anthropic API with `Authorization: Bearer <token>` | ⚠️ |
| **B4** | Handle token refresh when expired (refresh token flow) | ⚠️ |
| **B5** | Settings UI: no API key field, auto-detected from keychain | |

## C: Use `@anthropic-ai/claude-code` SDK programmatically

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **C1** | `npm install @anthropic-ai/claude-code` as dependency | |
| **C2** | Import SDK, invoke programmatically with prompt + system prompt | ⚠️ |
| **C3** | SDK handles auth via same keychain path as CLI | ⚠️ |
| **C4** | Stream results from SDK | ⚠️ |
| **C5** | Bundle size impact — SDK is large, plugin must be single `main.js` | ⚠️ |

---

## Fit Check

| Req | Requirement | Status | A | B | C |
|-----|-------------|--------|---|---|---|
| R0 | Use existing Claude subscription for prompt improvement | Core goal | ✅ | ✅ | ✅ |
| R1 | Zero credential configuration in plugin settings | Must-have | ✅ | ✅ | ✅ |
| R2 | Streaming response (tokens appear as generated) | Must-have | ✅ | ✅ | ❌ |
| R3 | User can select model (haiku/sonnet/opus) | Must-have | ✅ | ✅ | ❌ |
| R4 | Clear feedback when Claude Code not installed/authenticated | Must-have | ✅ | ❌ | ❌ |
| R5 | Works within Obsidian's Electron/Node.js sandbox | Must-have | ✅ | ✅ | ❌ |
| R6 | No ToS violations — uses Claude Code as intended | Must-have | ✅ | ❌ | ❌ |
| R7 | System prompt support (meta-prompt + strategy prompts) | Must-have | ✅ | ✅ | ❌ |
| R8 | Abortable requests (user can cancel mid-stream) | Must-have | ✅ | ✅ | ❌ |

**Notes:**
- B fails R4: No auth status check — just silently fails if token expired/missing
- B fails R6: Anthropic API rejects OAuth tokens ("OAuth authentication is currently not supported"); also extracting keychain creds for third-party use likely violates ToS
- C fails R2: SDK streaming interface undocumented/uncertain (⚠️ on C4)
- C fails R3: SDK model selection interface undocumented (⚠️ on C2)
- C fails R4: No documented auth status check in SDK
- C fails R5: `@anthropic-ai/claude-code` is ~50MB+ bundled; impossible for single-file Obsidian plugin
- C fails R6: Agent SDK docs explicitly state "only supports standard API keys" — Max billing not available
- C fails R7: SDK prompt interface undocumented (⚠️ on C2)
- C fails R8: SDK abort interface undocumented (⚠️ on C4)

---

## Selected: A — Spawn `claude -p` subprocess

**A is the only shape that passes all requirements.** B is a ToS violation (and doesn't even work — API rejects OAuth tokens). C is impractical (bundle size, undocumented interfaces).

A is also the simplest — it's a child process adapter, ~60 lines of code.

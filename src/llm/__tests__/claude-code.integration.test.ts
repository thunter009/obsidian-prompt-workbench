import { existsSync } from "fs";
import { execSync } from "child_process";
import { describe, it, expect, beforeAll } from "vitest";
import { createLLMAdapter } from "../index";
import { ClaudeCodeAdapter } from "../claude-code";
import { AnthropicAdapter } from "../anthropic";
import {
  findClaudeBinary,
  resetClaudeBinaryCache,
  checkClaudeCodeAuth,
  type ClaudeCodeAuthResult,
} from "../claude-code";

// ── Suite 1: Pure Logic (always runs) ────────────────────────────

describe("pure logic", () => {
  it("createLLMAdapter returns ClaudeCodeAdapter for 'claude-code'", () => {
    const start = performance.now();
    const adapter = createLLMAdapter({ provider: "claude-code" });
    const elapsed = (performance.now() - start).toFixed(1);
    console.log(`  [${elapsed}ms] adapter class: ${adapter.constructor.name}`);
    expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
  });

  it("does not require API key for claude-code", () => {
    expect(() => createLLMAdapter({ provider: "claude-code" })).not.toThrow();
    expect(() => createLLMAdapter({ provider: "anthropic" })).toThrow(
      "Anthropic API key required"
    );
    expect(() => createLLMAdapter({ provider: "openai" })).toThrow(
      "OpenAI API key required"
    );
    console.log(
      "  claude-code: no throw, anthropic: threw, openai: threw"
    );
  });

  it("still returns AnthropicAdapter for 'anthropic' with key", () => {
    const adapter = createLLMAdapter({
      provider: "anthropic",
      anthropicApiKey: "sk-test",
    });
    console.log(`  adapter class: ${adapter.constructor.name}`);
    expect(adapter).toBeInstanceOf(AnthropicAdapter);
  });

  it("ClaudeCodeAuthResult variants have expected discriminants", () => {
    const authenticated: ClaudeCodeAuthResult = {
      status: "authenticated",
      email: "test@example.com",
      plan: "pro",
      orgName: "",
    };
    const notAuth: ClaudeCodeAuthResult = {
      status: "not-authenticated",
      message: "Not signed in",
    };
    const notInstalled: ClaudeCodeAuthResult = { status: "not-installed" };
    const error: ClaudeCodeAuthResult = {
      status: "error",
      message: "something broke",
    };

    expect(authenticated.status).toBe("authenticated");
    expect(notAuth.status).toBe("not-authenticated");
    expect(notInstalled.status).toBe("not-installed");
    expect(error.status).toBe("error");
  });

  it("generate() throws immediately when AbortSignal is already aborted", async () => {
    const adapter = new ClaudeCodeAdapter();
    const controller = new AbortController();
    controller.abort();

    const start = performance.now();
    const gen = adapter.generate({
      prompt: "test",
      systemPrompt: "test",
      model: "sonnet",
      signal: controller.signal,
    });

    await expect(async () => {
      for await (const _ of gen) {
        // should not reach here
      }
    }).rejects.toThrow("Request aborted");

    const elapsed = performance.now() - start;
    console.log(`  [${elapsed.toFixed(1)}ms] threw immediately`);
    expect(elapsed).toBeLessThan(500);
  });
});

// ── Suite 2: findClaudeBinary ────────────────────────────────────

describe("findClaudeBinary", () => {
  let claudePath: string | null = null;

  beforeAll(() => {
    resetClaudeBinaryCache();
    claudePath = findClaudeBinary();
    console.log(
      `  Claude CLI: ${claudePath ? claudePath : "NOT FOUND — skipping CLI tests"}`
    );
  });

  it.skipIf(!findClaudeBinary())("finds claude binary on this system", () => {
    expect(claudePath).not.toBeNull();
    expect(existsSync(claudePath!)).toBe(true);
    console.log(`  resolved path: ${claudePath}`);
  });

  it.skipIf(!findClaudeBinary())(
    "returned path is actually executable",
    () => {
      const version = execSync(`${claudePath} --version`, {
        encoding: "utf-8",
        timeout: 10000,
      }).trim();
      console.log(`  version: ${version}`);
      expect(version.length).toBeGreaterThan(0);
    }
  );

  it.skipIf(!findClaudeBinary())(
    "caches result on second call",
    () => {
      const start1 = performance.now();
      const path1 = findClaudeBinary();
      const elapsed1 = performance.now() - start1;

      const start2 = performance.now();
      const path2 = findClaudeBinary();
      const elapsed2 = performance.now() - start2;

      console.log(
        `  first: ${elapsed1.toFixed(1)}ms, second: ${elapsed2.toFixed(1)}ms`
      );
      expect(path1).toBe(path2);
      expect(elapsed2).toBeLessThan(1);
    }
  );

  it.skipIf(!findClaudeBinary())(
    "resetClaudeBinaryCache forces re-probe",
    () => {
      const path1 = findClaudeBinary();

      const start = performance.now();
      resetClaudeBinaryCache();
      const path2 = findClaudeBinary();
      const elapsed = performance.now() - start;

      console.log(
        `  re-probed in ${elapsed.toFixed(1)}ms, paths match: ${path1 === path2}`
      );
      expect(path1).toBe(path2);
      // Re-probe should take measurable time (>0ms)
      expect(elapsed).toBeGreaterThan(0);
    }
  );
});

// ── Suite 3: checkClaudeCodeAuth ─────────────────────────────────

describe(
  "checkClaudeCodeAuth",
  { timeout: 30000 },
  () => {
    beforeAll(() => {
      resetClaudeBinaryCache();
    });

    it.skipIf(!findClaudeBinary())(
      "returns auth status with expected structure",
      async () => {
        const result = await checkClaudeCodeAuth();
        const validStatuses = [
          "authenticated",
          "not-authenticated",
          "not-installed",
          "error",
        ];
        expect(validStatuses).toContain(result.status);

        const redacted =
          result.status === "authenticated"
            ? { ...result, email: result.email.slice(0, 3) + "***" }
            : result;
        console.log(`  auth result:`, redacted);
      }
    );

    it.skipIf(!findClaudeBinary())(
      "authenticated result has email and plan fields",
      async () => {
        const result = await checkClaudeCodeAuth();
        if (result.status !== "authenticated") {
          console.log(
            `  skipped: user not logged in (status: ${result.status})`
          );
          return;
        }
        expect(result.email).toBeTruthy();
        console.log(
          `  email: ${result.email.slice(0, 3)}***, plan: ${result.plan}`
        );
      }
    );

    it.skipIf(!findClaudeBinary())(
      "returns result within 15 seconds",
      async () => {
        const start = performance.now();
        await checkClaudeCodeAuth();
        const elapsed = performance.now() - start;
        console.log(`  elapsed: ${elapsed.toFixed(0)}ms`);
        expect(elapsed).toBeLessThan(15000);
      }
    );

    it.skipIf(!findClaudeBinary())(
      "calling twice returns consistent results",
      async () => {
        const r1 = await checkClaudeCodeAuth();
        const r2 = await checkClaudeCodeAuth();
        expect(r1.status).toBe(r2.status);
        if (r1.status === "authenticated" && r2.status === "authenticated") {
          expect(r1.email).toBe(r2.email);
        }
        console.log(`  both returned status: ${r1.status}`);
      }
    );
  }
);

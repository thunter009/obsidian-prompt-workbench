import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";

describe("DEFAULT_SETTINGS", () => {
  it("has all expected fields", () => {
    const fields = [
      "showInlinePreviews",
      "raycastExportPath",
      "llmProvider",
      "llmModel",
      "ollamaUrl",
      "openaiBaseUrl",
      "openaiApiKey",
      "anthropicBaseUrl",
      "anthropicApiKey",
      "metaSystemPrompt",
      "includeWorkflowHeader",
      "autoSyncRaycast",
    ];
    for (const field of fields) {
      expect(DEFAULT_SETTINGS).toHaveProperty(field);
    }
  });

  it("showInlinePreviews is boolean", () => {
    expect(typeof DEFAULT_SETTINGS.showInlinePreviews).toBe("boolean");
  });

  it("llmProvider is a valid provider", () => {
    expect(["ollama", "openai", "anthropic", "claude-code"]).toContain(
      DEFAULT_SETTINGS.llmProvider
    );
  });

  it("URLs are valid HTTP(S)", () => {
    for (const url of [
      DEFAULT_SETTINGS.ollamaUrl,
      DEFAULT_SETTINGS.openaiBaseUrl,
      DEFAULT_SETTINGS.anthropicBaseUrl,
    ]) {
      expect(url).toMatch(/^https?:\/\//);
    }
  });

  it("API keys default to empty string", () => {
    expect(DEFAULT_SETTINGS.openaiApiKey).toBe("");
    expect(DEFAULT_SETTINGS.anthropicApiKey).toBe("");
  });

  it("metaSystemPrompt defaults to empty string", () => {
    expect(DEFAULT_SETTINGS.metaSystemPrompt).toBe("");
  });
});

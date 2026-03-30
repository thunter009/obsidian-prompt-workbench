import { describe, it, expect } from "vitest";
import { createLLMAdapter } from "./index";
import { OllamaAdapter } from "./ollama";
import { OpenAIAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { ClaudeCodeAdapter } from "./claude-code";

describe("createLLMAdapter", () => {
  it("ollama → OllamaAdapter (no key needed)", () => {
    const adapter = createLLMAdapter({ provider: "ollama" });
    expect(adapter).toBeInstanceOf(OllamaAdapter);
  });

  it("ollama uses custom url", () => {
    const adapter = createLLMAdapter({
      provider: "ollama",
      ollamaUrl: "http://custom:1234",
    });
    expect(adapter).toBeInstanceOf(OllamaAdapter);
  });

  it("openai → OpenAIAdapter with key", () => {
    const adapter = createLLMAdapter({
      provider: "openai",
      openaiApiKey: "sk-test",
    });
    expect(adapter).toBeInstanceOf(OpenAIAdapter);
  });

  it("openai without key → throws", () => {
    expect(() => createLLMAdapter({ provider: "openai" })).toThrow(
      "OpenAI API key required"
    );
  });

  it("anthropic → AnthropicAdapter with key", () => {
    const adapter = createLLMAdapter({
      provider: "anthropic",
      anthropicApiKey: "sk-ant-test",
    });
    expect(adapter).toBeInstanceOf(AnthropicAdapter);
  });

  it("anthropic without key → throws", () => {
    expect(() => createLLMAdapter({ provider: "anthropic" })).toThrow(
      "Anthropic API key required"
    );
  });

  it("claude-code → ClaudeCodeAdapter", () => {
    const adapter = createLLMAdapter({ provider: "claude-code" });
    expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
  });

  it("unknown provider → throws descriptive error", () => {
    expect(() =>
      createLLMAdapter({ provider: "gemini" as any })
    ).toThrow("Unknown LLM provider: gemini");
  });
});

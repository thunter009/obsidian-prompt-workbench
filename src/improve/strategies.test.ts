import { describe, it, expect } from "vitest";
import { STRATEGIES, getStrategy } from "./strategies";

describe("STRATEGIES", () => {
  it("has exactly 4 entries", () => {
    expect(STRATEGIES).toHaveLength(4);
  });

  it("has unique ids", () => {
    const ids = STRATEGIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const field of ["id", "name", "description", "systemPrompt"] as const) {
    it(`every strategy has a non-empty ${field}`, () => {
      for (const s of STRATEGIES) {
        expect(s[field]).toBeTruthy();
      }
    });
  }

  it('all systemPrompts instruct to keep placeholders intact', () => {
    for (const s of STRATEGIES) {
      expect(s.systemPrompt.toLowerCase()).toContain("placeholders intact");
    }
  });

  it('all systemPrompts instruct to return only improved text', () => {
    for (const s of STRATEGIES) {
      expect(s.systemPrompt).toContain("Return ONLY the improved prompt text");
    }
  });
});

describe("getStrategy", () => {
  it("returns correct strategy for each valid id", () => {
    for (const s of STRATEGIES) {
      expect(getStrategy(s.id)).toBe(s);
    }
  });

  it("returns undefined for unknown id", () => {
    expect(getStrategy("nonexistent")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getStrategy("")).toBeUndefined();
  });
});

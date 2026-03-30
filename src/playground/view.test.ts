import { describe, it, expect } from "vitest";
import { getFieldName, getFieldKey } from "./view";
import type { ParsedPlaceholder } from "../placeholders/parser";

function makePlaceholder(
  overrides: Partial<ParsedPlaceholder> & { type: ParsedPlaceholder["type"] }
): ParsedPlaceholder {
  return {
    raw: `{${overrides.type}}`,
    attributes: [],
    modifiers: [],
    ...overrides,
  };
}

describe("getFieldName", () => {
  it("returns argumentName when present", () => {
    expect(
      getFieldName(
        makePlaceholder({ type: "argument", argumentName: "User Input" })
      )
    ).toBe("User Input");
  });

  it("returns snippet: ref when snippetRef present", () => {
    expect(
      getFieldName(
        makePlaceholder({ type: "snippet", snippetRef: "header" })
      )
    ).toBe("snippet: header");
  });

  it("returns type when no argumentName or snippetRef", () => {
    expect(getFieldName(makePlaceholder({ type: "clipboard" }))).toBe(
      "clipboard"
    );
  });

  it("prefers argumentName over type", () => {
    expect(
      getFieldName(makePlaceholder({ type: "argument", argumentName: "X" }))
    ).toBe("X");
  });
});

describe("getFieldKey", () => {
  it("argument with name → argument:name", () => {
    expect(
      getFieldKey(
        makePlaceholder({ type: "argument", argumentName: "X" })
      )
    ).toBe("argument:X");
  });

  it("snippet with ref → snippet:ref", () => {
    expect(
      getFieldKey(
        makePlaceholder({ type: "snippet", snippetRef: "Y" })
      )
    ).toBe("snippet:Y");
  });

  it("type-only → type:typename", () => {
    expect(getFieldKey(makePlaceholder({ type: "clipboard" }))).toBe(
      "type:clipboard"
    );
  });

  it("identical arguments produce same key for deduplication", () => {
    const p = makePlaceholder({ type: "argument", argumentName: "X" });
    expect(getFieldKey(p)).toBe(getFieldKey(p));
  });

  it("different argument names produce different keys", () => {
    const a = makePlaceholder({ type: "argument", argumentName: "X" });
    const b = makePlaceholder({ type: "argument", argumentName: "Y" });
    expect(getFieldKey(a)).not.toBe(getFieldKey(b));
  });

  it("snippet and argument with same name produce different keys", () => {
    const snippet = makePlaceholder({ type: "snippet", snippetRef: "Z" });
    const arg = makePlaceholder({ type: "argument", argumentName: "Z" });
    expect(getFieldKey(snippet)).not.toBe(getFieldKey(arg));
  });

  it("deduplication via Set works correctly", () => {
    const placeholders = [
      makePlaceholder({ type: "argument", argumentName: "X" }),
      makePlaceholder({ type: "argument", argumentName: "X" }),
      makePlaceholder({ type: "argument", argumentName: "X" }),
      makePlaceholder({ type: "argument", argumentName: "Y" }),
      makePlaceholder({ type: "snippet", snippetRef: "Z" }),
    ];
    const uniqueKeys = new Set(placeholders.map(getFieldKey));
    expect(uniqueKeys.size).toBe(3); // argument:X, argument:Y, snippet:Z
  });
});

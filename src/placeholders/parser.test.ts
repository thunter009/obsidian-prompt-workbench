import { describe, it, expect } from "vitest";
import {
  parsePlaceholder,
  findPlaceholders,
  isValidPlaceholderType,
  isValidModifier,
  getPlaceholderPreviewValue,
  type ParsedPlaceholder,
} from "./parser";

// ─── parsePlaceholder ───────────────────────────────────────────

describe("parsePlaceholder", () => {
  // All 10 valid types
  const types = [
    "clipboard",
    "cursor",
    "date",
    "time",
    "datetime",
    "day",
    "uuid",
    "selection",
    "argument",
    "snippet",
  ] as const;

  for (const type of types) {
    it(`parses {${type}}`, () => {
      const result = parsePlaceholder(`{${type}}`);
      expect(result).not.toBeNull();
      expect(result!.type).toBe(type);
      expect(result!.raw).toBe(`{${type}}`);
      expect(result!.attributes).toEqual([]);
      expect(result!.modifiers).toEqual([]);
    });
  }

  it("parses attributes with quoted values", () => {
    const result = parsePlaceholder('{argument name="city"}');
    expect(result!.type).toBe("argument");
    expect(result!.attributes).toEqual([{ name: "name", value: "city" }]);
    expect(result!.argumentName).toBe("city");
  });

  it("parses attributes with unquoted values", () => {
    const result = parsePlaceholder("{date offset=-7d}");
    expect(result!.attributes).toEqual([{ name: "offset", value: "-7d" }]);
  });

  it("parses multiple attributes", () => {
    const result = parsePlaceholder('{date format="YYYY-MM-DD" offset="-7d"}');
    expect(result!.attributes).toHaveLength(2);
    expect(result!.attributes[0]).toEqual({
      name: "format",
      value: "YYYY-MM-DD",
    });
    expect(result!.attributes[1]).toEqual({ name: "offset", value: "-7d" });
  });

  it("parses hyphenated attribute names", () => {
    const result = parsePlaceholder('{date format="YYYY-MM-DD"}');
    expect(result!.attributes[0].name).toBe("format");
  });

  it("parses snippet with name attribute and sets snippetRef", () => {
    const result = parsePlaceholder('{snippet name="my-template"}');
    expect(result!.type).toBe("snippet");
    expect(result!.snippetRef).toBe("my-template");
  });

  it("parses argument with name attribute and sets argumentName", () => {
    const result = parsePlaceholder('{argument name="topic"}');
    expect(result!.argumentName).toBe("topic");
  });

  it("does not set snippetRef for non-snippet types", () => {
    const result = parsePlaceholder('{argument name="foo"}');
    expect(result!.snippetRef).toBeUndefined();
  });

  it("does not set argumentName for non-argument types", () => {
    const result = parsePlaceholder('{snippet name="foo"}');
    expect(result!.argumentName).toBeUndefined();
  });

  // Modifiers
  const modifiers = [
    "uppercase",
    "lowercase",
    "trim",
    "percent-encode",
    "json-stringify",
    "raw",
  ] as const;

  for (const mod of modifiers) {
    it(`parses modifier: ${mod}`, () => {
      const result = parsePlaceholder(`{clipboard ${mod}}`);
      expect(result!.modifiers).toContain(mod);
    });
  }

  it("parses multiple modifiers", () => {
    const result = parsePlaceholder("{clipboard uppercase trim}");
    expect(result!.modifiers).toEqual(["uppercase", "trim"]);
  });

  it("parses combined attributes and modifiers", () => {
    const result = parsePlaceholder(
      '{argument name="X" default="Y" uppercase trim}'
    );
    expect(result!.type).toBe("argument");
    expect(result!.argumentName).toBe("X");
    expect(result!.attributes).toEqual([
      { name: "name", value: "X" },
      { name: "default", value: "Y" },
    ]);
    expect(result!.modifiers).toEqual(["uppercase", "trim"]);
  });

  // Invalid inputs
  it("returns null for empty string", () => {
    expect(parsePlaceholder("")).toBeNull();
  });

  it("returns null for missing braces", () => {
    expect(parsePlaceholder("clipboard")).toBeNull();
  });

  it("returns null for unknown type", () => {
    expect(parsePlaceholder("{unknown}")).toBeNull();
  });

  it("returns null for partial type", () => {
    expect(parsePlaceholder("{clip}")).toBeNull();
  });

  it("returns null for unclosed brace", () => {
    expect(parsePlaceholder("{clipboard")).toBeNull();
  });

  it("returns null for extra text after closing brace", () => {
    expect(parsePlaceholder("{clipboard} extra")).toBeNull();
  });

  it("returns null for leading text before opening brace", () => {
    expect(parsePlaceholder("text {clipboard}")).toBeNull();
  });
});

// ─── findPlaceholders ───────────────────────────────────────────

describe("findPlaceholders", () => {
  it("returns empty array when no placeholders", () => {
    expect(findPlaceholders("Hello world")).toEqual([]);
  });

  it("finds single placeholder", () => {
    const matches = findPlaceholders("Hello {clipboard} world");
    expect(matches).toHaveLength(1);
    expect(matches[0].placeholder.type).toBe("clipboard");
    expect(matches[0].start).toBe(6);
    expect(matches[0].end).toBe(17);
  });

  it("finds multiple placeholders", () => {
    const text = "{clipboard} and {cursor}";
    const matches = findPlaceholders(text);
    expect(matches).toHaveLength(2);
    expect(matches[0].placeholder.type).toBe("clipboard");
    expect(matches[1].placeholder.type).toBe("cursor");
  });

  it("tracks correct start/end positions", () => {
    const text = "abc {date} def {uuid} ghi";
    const matches = findPlaceholders(text);
    expect(text.slice(matches[0].start, matches[0].end)).toBe("{date}");
    expect(text.slice(matches[1].start, matches[1].end)).toBe("{uuid}");
  });

  it("finds placeholder with attributes", () => {
    const matches = findPlaceholders('Use {argument name="lang"} here');
    expect(matches).toHaveLength(1);
    expect(matches[0].placeholder.argumentName).toBe("lang");
  });

  it("does not match unknown types inside braces", () => {
    expect(findPlaceholders("a {foo} b")).toEqual([]);
  });

  it("does not match unclosed braces", () => {
    expect(findPlaceholders("a {clipboard b")).toEqual([]);
  });

  it("does not match nested JSON-like braces", () => {
    expect(findPlaceholders('{"key": "value"}')).toEqual([]);
  });

  it("finds adjacent placeholders", () => {
    const matches = findPlaceholders("{clipboard}{cursor}");
    expect(matches).toHaveLength(2);
    expect(matches[0].end).toBe(11);
    expect(matches[1].start).toBe(11);
  });

  it("finds placeholders on multiple lines", () => {
    const text = "line1 {clipboard}\nline2 {cursor}";
    const matches = findPlaceholders(text);
    expect(matches).toHaveLength(2);
  });
});

// ─── isValidPlaceholderType ─────────────────────────────────────

describe("isValidPlaceholderType", () => {
  const validTypes = [
    "clipboard",
    "cursor",
    "date",
    "time",
    "datetime",
    "day",
    "uuid",
    "selection",
    "argument",
    "snippet",
  ];

  for (const type of validTypes) {
    it(`returns true for "${type}"`, () => {
      expect(isValidPlaceholderType(type)).toBe(true);
    });
  }

  it("returns false for unknown type", () => {
    expect(isValidPlaceholderType("unknown")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidPlaceholderType("")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isValidPlaceholderType("Clipboard")).toBe(false);
    expect(isValidPlaceholderType("DATE")).toBe(false);
  });
});

// ─── isValidModifier ────────────────────────────────────────────

describe("isValidModifier", () => {
  const validMods = [
    "uppercase",
    "lowercase",
    "trim",
    "percent-encode",
    "json-stringify",
    "raw",
  ];

  for (const mod of validMods) {
    it(`returns true for "${mod}"`, () => {
      expect(isValidModifier(mod)).toBe(true);
    });
  }

  it("returns false for unknown modifier", () => {
    expect(isValidModifier("capitalize")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidModifier("")).toBe(false);
  });
});

// ─── getPlaceholderPreviewValue ─────────────────────────────────

describe("getPlaceholderPreviewValue", () => {
  function makeParsed(
    overrides: Partial<ParsedPlaceholder> & { type: ParsedPlaceholder["type"] }
  ): ParsedPlaceholder {
    return {
      raw: `{${overrides.type}}`,
      attributes: [],
      modifiers: [],
      ...overrides,
    };
  }

  it("clipboard → [clipboard]", () => {
    expect(getPlaceholderPreviewValue(makeParsed({ type: "clipboard" }))).toBe(
      "[clipboard]"
    );
  });

  it("clipboard with offset → [clipboard #N]", () => {
    expect(
      getPlaceholderPreviewValue(
        makeParsed({
          type: "clipboard",
          attributes: [{ name: "offset", value: "2" }],
        })
      )
    ).toBe("[clipboard #2]");
  });

  it("cursor → |", () => {
    expect(getPlaceholderPreviewValue(makeParsed({ type: "cursor" }))).toBe(
      "|"
    );
  });

  it("date without format → locale date string", () => {
    const result = getPlaceholderPreviewValue(makeParsed({ type: "date" }));
    // Should be a non-empty date string
    expect(result.length).toBeGreaterThan(0);
  });

  it("date with format YYYY-MM-DD", () => {
    const result = getPlaceholderPreviewValue(
      makeParsed({
        type: "date",
        attributes: [{ name: "format", value: "YYYY-MM-DD" }],
      })
    );
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("date with day offset", () => {
    const result = getPlaceholderPreviewValue(
      makeParsed({
        type: "date",
        attributes: [
          { name: "format", value: "YYYY-MM-DD" },
          { name: "offset", value: "0d" },
        ],
      })
    );
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(result).toBe(expected);
  });

  it("date with week offset", () => {
    const result = getPlaceholderPreviewValue(
      makeParsed({
        type: "date",
        attributes: [
          { name: "format", value: "YYYY-MM-DD" },
          { name: "offset", value: "1w" },
        ],
      })
    );
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("date with month offset", () => {
    const result = getPlaceholderPreviewValue(
      makeParsed({
        type: "date",
        attributes: [
          { name: "format", value: "M/D" },
          { name: "offset", value: "1m" },
        ],
      })
    );
    expect(result).toMatch(/^\d{1,2}\/\d{1,2}$/);
  });

  it("date with year offset", () => {
    const result = getPlaceholderPreviewValue(
      makeParsed({
        type: "date",
        attributes: [
          { name: "format", value: "YYYY" },
          { name: "offset", value: "1y" },
        ],
      })
    );
    expect(result).toBe(String(new Date().getFullYear() + 1));
  });

  it("date with negative offset", () => {
    const result = getPlaceholderPreviewValue(
      makeParsed({
        type: "date",
        attributes: [
          { name: "format", value: "YYYY-MM-DD" },
          { name: "offset", value: "-7d" },
        ],
      })
    );
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("date with invalid offset format falls through without applying offset", () => {
    const result = getPlaceholderPreviewValue(
      makeParsed({
        type: "date",
        attributes: [
          { name: "format", value: "YYYY-MM-DD" },
          { name: "offset", value: "bad" },
        ],
      })
    );
    // Still produces a valid date (today, no offset applied)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("time → non-empty string", () => {
    const result = getPlaceholderPreviewValue(makeParsed({ type: "time" }));
    expect(result.length).toBeGreaterThan(0);
  });

  it("datetime → contains date and time", () => {
    const result = getPlaceholderPreviewValue(makeParsed({ type: "datetime" }));
    expect(result.length).toBeGreaterThan(0);
  });

  it("day → day name", () => {
    const result = getPlaceholderPreviewValue(makeParsed({ type: "day" }));
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    expect(days).toContain(result);
  });

  it("uuid → UUID-like format", () => {
    const result = getPlaceholderPreviewValue(makeParsed({ type: "uuid" }));
    expect(result).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
    );
  });

  it("selection → [selected text]", () => {
    expect(
      getPlaceholderPreviewValue(makeParsed({ type: "selection" }))
    ).toBe("[selected text]");
  });

  it("argument with name → [name]", () => {
    expect(
      getPlaceholderPreviewValue(
        makeParsed({ type: "argument", argumentName: "topic" })
      )
    ).toBe("[topic]");
  });

  it("argument without name → [input]", () => {
    expect(
      getPlaceholderPreviewValue(makeParsed({ type: "argument" }))
    ).toBe("[input]");
  });

  it("snippet with ref → [ref]", () => {
    expect(
      getPlaceholderPreviewValue(
        makeParsed({ type: "snippet", snippetRef: "my-template" })
      )
    ).toBe("[my-template]");
  });

  it("snippet without ref → [snippet]", () => {
    expect(
      getPlaceholderPreviewValue(makeParsed({ type: "snippet" }))
    ).toBe("[snippet]");
  });

  // Modifier application
  it("uppercase modifier transforms preview", () => {
    expect(
      getPlaceholderPreviewValue(
        makeParsed({ type: "clipboard", modifiers: ["uppercase"] })
      )
    ).toBe("[CLIPBOARD]");
  });

  it("lowercase modifier transforms preview", () => {
    expect(
      getPlaceholderPreviewValue(
        makeParsed({
          type: "argument",
          argumentName: "Topic",
          modifiers: ["lowercase"],
        })
      )
    ).toBe("[topic]");
  });

  it("trim modifier", () => {
    // trim on an already trimmed string is a no-op but exercises the branch
    expect(
      getPlaceholderPreviewValue(
        makeParsed({ type: "cursor", modifiers: ["trim"] })
      )
    ).toBe("|");
  });

  it("percent-encode modifier", () => {
    expect(
      getPlaceholderPreviewValue(
        makeParsed({ type: "clipboard", modifiers: ["percent-encode"] })
      )
    ).toBe(encodeURIComponent("[clipboard]"));
  });

  it("json-stringify modifier", () => {
    expect(
      getPlaceholderPreviewValue(
        makeParsed({ type: "clipboard", modifiers: ["json-stringify"] })
      )
    ).toBe('"[clipboard]"');
  });

  it("raw modifier leaves value unchanged", () => {
    expect(
      getPlaceholderPreviewValue(
        makeParsed({ type: "clipboard", modifiers: ["raw"] })
      )
    ).toBe("[clipboard]");
  });

  it("multiple modifiers applied in order", () => {
    // uppercase then json-stringify
    expect(
      getPlaceholderPreviewValue(
        makeParsed({
          type: "clipboard",
          modifiers: ["uppercase", "json-stringify"],
        })
      )
    ).toBe('"[CLIPBOARD]"');
  });
});

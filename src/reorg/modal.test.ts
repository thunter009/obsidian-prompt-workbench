import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import {
  extractJson,
  normalizeFolder,
  isExcludedPath,
  buildPrompt,
  parseMoves,
  type VaultFileSummary,
} from "./modal";

// ─── extractJson ────────────────────────────────────────────────

describe("extractJson", () => {
  it("extracts JSON from fenced code block", () => {
    const raw = 'Some text\n```json\n[{"a":1}]\n```\nMore text';
    expect(extractJson(raw)).toBe('[{"a":1}]');
  });

  it("extracts from fence without json label", () => {
    const raw = '```\n{"key":"val"}\n```';
    expect(extractJson(raw)).toBe('{"key":"val"}');
  });

  it("returns raw JSON when no fences", () => {
    const raw = '[{"file":"a.md","proposedFolder":"coding"}]';
    expect(extractJson(raw)).toBe(raw);
  });

  it("extracts first code block when multiple present", () => {
    const raw = '```json\n{"first":true}\n```\ntext\n```json\n{"second":true}\n```';
    expect(extractJson(raw)).toBe('{"first":true}');
  });

  it("returns trimmed input when no JSON found", () => {
    expect(extractJson("  no json here  ")).toBe("no json here");
  });

  it("handles empty string", () => {
    expect(extractJson("")).toBe("");
  });
});

// ─── normalizeFolder ────────────────────────────────────────────

describe("normalizeFolder", () => {
  it("strips leading slashes", () => {
    expect(normalizeFolder("/prompts/coding")).toBe("prompts/coding");
  });

  it("strips trailing slashes", () => {
    expect(normalizeFolder("prompts/coding/")).toBe("prompts/coding");
  });

  it("strips both leading and trailing slashes", () => {
    expect(normalizeFolder("///prompts///")).toBe("prompts");
  });

  it("trims whitespace", () => {
    expect(normalizeFolder("  prompts  ")).toBe("prompts");
  });

  it("handles empty string", () => {
    expect(normalizeFolder("")).toBe("");
  });

  it("handles slash-only input", () => {
    expect(normalizeFolder("///")).toBe("");
  });
});

// ─── isExcludedPath ─────────────────────────────────────────────

describe("isExcludedPath", () => {
  it("excludes _templates/ paths", () => {
    expect(isExcludedPath("_templates/foo.md")).toBe(true);
  });

  it("excludes _config/ paths", () => {
    expect(isExcludedPath("_config/bar.md")).toBe(true);
  });

  it("excludes any top-level underscore folder", () => {
    expect(isExcludedPath("_archive/old.md")).toBe(true);
  });

  it("allows normal paths", () => {
    expect(isExcludedPath("notes/foo.md")).toBe(false);
  });

  it("allows root files", () => {
    expect(isExcludedPath("foo.md")).toBe(false);
  });

  it("allows underscore in non-top-level path", () => {
    expect(isExcludedPath("notes/_draft/wip.md")).toBe(false);
  });
});

// ─── buildPrompt ────────────────────────────────────────────────

describe("buildPrompt", () => {
  const files: VaultFileSummary[] = [
    {
      file: new TFile("coding/hello.md"),
      path: "coding/hello.md",
      name: "hello.md",
      currentFolder: "coding",
      excerpt: "A hello world guide",
    },
  ];

  it("returns a string containing JSON", () => {
    const result = buildPrompt(files);
    expect(result).toContain("Analyze these markdown files");
    // Should contain valid JSON portion
    const jsonPart = result.split("\n\n")[1];
    const parsed = JSON.parse(jsonPart);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].file).toBe("coding/hello.md");
  });

  it("includes file paths and excerpts", () => {
    const result = buildPrompt(files);
    expect(result).toContain("coding/hello.md");
    expect(result).toContain("A hello world guide");
  });
});

// ─── parseMoves ─────────────────────────────────────────────────

describe("parseMoves", () => {
  const files: VaultFileSummary[] = [
    {
      file: new TFile("a.md"),
      path: "a.md",
      name: "a.md",
      currentFolder: "",
      excerpt: "file a",
    },
    {
      file: new TFile("coding/b.md"),
      path: "coding/b.md",
      name: "b.md",
      currentFolder: "coding",
      excerpt: "file b",
    },
    {
      file: new TFile("misc/c.md"),
      path: "misc/c.md",
      name: "c.md",
      currentFolder: "misc",
      excerpt: "file c",
    },
  ];

  it("parses valid JSON array of moves", () => {
    const raw = JSON.stringify([
      { file: "a.md", currentFolder: "", proposedFolder: "prompts/general" },
    ]);
    const moves = parseMoves(raw, files);
    expect(moves).toHaveLength(1);
    expect(moves[0].filePath).toBe("a.md");
    expect(moves[0].proposedFolder).toBe("prompts/general");
    expect(moves[0].checked).toBe(true);
  });

  it("parses JSON with moves wrapper object", () => {
    const raw = JSON.stringify({
      moves: [
        { file: "a.md", currentFolder: "", proposedFolder: "writing" },
      ],
    });
    const moves = parseMoves(raw, files);
    expect(moves).toHaveLength(1);
  });

  it("rejects unknown file paths", () => {
    const raw = JSON.stringify([
      { file: "nonexistent.md", proposedFolder: "coding" },
    ]);
    expect(parseMoves(raw, files)).toEqual([]);
  });

  it("filters out underscore target folders", () => {
    const raw = JSON.stringify([
      { file: "a.md", proposedFolder: "_archive" },
    ]);
    expect(parseMoves(raw, files)).toEqual([]);
  });

  it("filters out no-op moves (same folder)", () => {
    const raw = JSON.stringify([
      { file: "coding/b.md", currentFolder: "coding", proposedFolder: "coding" },
    ]);
    expect(parseMoves(raw, files)).toEqual([]);
  });

  it("normalizes folder paths", () => {
    const raw = JSON.stringify([
      { file: "a.md", proposedFolder: "/writing/" },
    ]);
    const moves = parseMoves(raw, files);
    expect(moves[0].proposedFolder).toBe("writing");
  });

  it("sorts by proposedFolder then filePath", () => {
    const raw = JSON.stringify([
      { file: "misc/c.md", proposedFolder: "z-folder" },
      { file: "a.md", proposedFolder: "a-folder" },
      { file: "coding/b.md", proposedFolder: "a-folder" },
    ]);
    const moves = parseMoves(raw, files);
    expect(moves.map((m) => m.filePath)).toEqual([
      "a.md",
      "coding/b.md",
      "misc/c.md",
    ]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseMoves("not json at all {{{", files)).toEqual([]);
  });

  it("returns empty array for empty moves array", () => {
    expect(parseMoves("[]", files)).toEqual([]);
  });

  it("skips entries missing required fields", () => {
    const raw = JSON.stringify([
      { file: "a.md" }, // missing proposedFolder
      { proposedFolder: "coding" }, // missing file
      { file: 123, proposedFolder: "coding" }, // file not string
    ]);
    expect(parseMoves(raw, files)).toEqual([]);
  });

  it("handles fenced JSON input", () => {
    const raw = '```json\n[{"file":"a.md","proposedFolder":"writing"}]\n```';
    const moves = parseMoves(raw, files);
    expect(moves).toHaveLength(1);
  });
});

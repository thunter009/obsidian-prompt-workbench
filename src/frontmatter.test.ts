import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFrontmatter } from "@/frontmatter";

describe("parseFrontmatter", () => {
  it("returns empty frontmatter when delimiters are missing", () => {
    const content = "hello\nworld";
    const parsed = parseFrontmatter(content);

    expect(parsed).toEqual({
      frontmatter: {},
      body: content,
    });
  });

  it("parses flat key-value fields, arrays, and quoted values", () => {
    const parsed = parseFrontmatter(
      [
        "---",
        "keyword: launch",
        "tags: [alpha, beta, gamma]",
        "raycast-export: false",
        "title: \"Prompt Title\"",
        "owner: 'thom'",
        "---",
        "Line 1",
        "Line 2",
      ].join("\n"),
    );

    expect(parsed.frontmatter).toEqual({
      keyword: "launch",
      tags: ["alpha", "beta", "gamma"],
      "raycast-export": "false",
      title: "Prompt Title",
      owner: "thom",
    });
    expect(parsed.body).toBe("Line 1\nLine 2");
  });

  it("parses nested objects and YAML dash-lists", () => {
    const parsed = parseFrontmatter(
      [
        "---",
        "meta:",
        "  team: core",
        "  owner: thom",
        "tools:",
        "  - grep",
        "  - \"read\"",
        "  - 'write'",
        "---",
        "Body",
      ].join("\n"),
    );

    expect(parsed.frontmatter).toEqual({
      meta: {
        team: "core",
        owner: "thom",
      },
      tools: ["grep", "read", "write"],
    });
    expect(parsed.body).toBe("Body");
  });

  it("ignores empty nested keys with no indented values", () => {
    const parsed = parseFrontmatter(
      [
        "---",
        "empty:",
        "next: value",
        "---",
        "body",
      ].join("\n"),
    );

    expect(parsed.frontmatter).toEqual({ next: "value" });
    expect(parsed.body).toBe("body");
  });

  it("handles empty frontmatter and empty body", () => {
    const parsed = parseFrontmatter("---\n---\n");

    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe("");
  });

  it("flushes trailing nested structures when frontmatter ends", () => {
    const parsed = parseFrontmatter(
      [
        "---",
        "tags:",
        "  - one",
        "---",
        "",
      ].join("\n"),
    );

    expect(parsed.frontmatter).toEqual({ tags: ["one"] });
    expect(parsed.body).toBe("");
  });

  it("documents malformed nested YAML handling for mixed list/object lines", () => {
    const parsed = parseFrontmatter(
      [
        "---",
        "items:",
        "  - one",
        "  key: ignored-because-array-mode",
        "  orphan-line-without-colon",
        "---",
        "body",
      ].join("\n"),
    );

    expect(parsed.frontmatter).toEqual({ items: ["one"] });
    expect(parsed.body).toBe("body");
  });

  it("drops dangling empty keys at end of frontmatter", () => {
    const parsed = parseFrontmatter(
      [
        "---",
        "dangling:",
        "---",
        "",
      ].join("\n"),
    );

    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe("");
  });

  it("keeps body content even when it contains --- markers", () => {
    const parsed = parseFrontmatter(
      [
        "---",
        "name: demo",
        "---",
        "line one",
        "---",
        "line two",
      ].join("\n"),
    );

    expect(parsed.frontmatter).toEqual({ name: "demo" });
    expect(parsed.body).toBe("line one\n---\nline two");
  });

  it("uses shared parseFrontmatter in playground view", () => {
    const source = readFileSync(resolve(process.cwd(), "src/playground/view.ts"), "utf8");

    expect(source).toContain("import { parseFrontmatter } from '../frontmatter'");
    expect(source).not.toContain("function parseFrontmatter(");
  });
});

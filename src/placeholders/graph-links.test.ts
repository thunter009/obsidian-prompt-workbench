import { describe, it, expect } from "vitest";
import { removePreviousSnippetLinks, applySnippetLinks } from "./graph-links";

type ResolvedLinksMap = Record<string, Record<string, number>>;

// ─── removePreviousSnippetLinks ─────────────────────────────────

describe("removePreviousSnippetLinks", () => {
  it("decrements counts for matching targets", () => {
    const links: ResolvedLinksMap = {
      "a.md": { "b.md": 3, "c.md": 1 },
    };
    removePreviousSnippetLinks(links, "a.md", { "b.md": 1 });
    expect(links["a.md"]["b.md"]).toBe(2);
    expect(links["a.md"]["c.md"]).toBe(1);
  });

  it("removes key when count reaches zero", () => {
    const links: ResolvedLinksMap = {
      "a.md": { "b.md": 1, "c.md": 2 },
    };
    removePreviousSnippetLinks(links, "a.md", { "b.md": 1 });
    expect(links["a.md"]["b.md"]).toBeUndefined();
    expect(links["a.md"]["c.md"]).toBe(2);
  });

  it("removes key when count goes negative", () => {
    const links: ResolvedLinksMap = {
      "a.md": { "b.md": 1 },
    };
    removePreviousSnippetLinks(links, "a.md", { "b.md": 5 });
    expect(links["a.md"]["b.md"]).toBeUndefined();
  });

  it("no-op when sourcePath not in resolvedLinks", () => {
    const links: ResolvedLinksMap = {};
    removePreviousSnippetLinks(links, "missing.md", { "b.md": 1 });
    expect(links).toEqual({});
  });

  it("skips targets not present in row", () => {
    const links: ResolvedLinksMap = {
      "a.md": { "c.md": 2 },
    };
    removePreviousSnippetLinks(links, "a.md", { "nonexistent.md": 1 });
    expect(links["a.md"]["c.md"]).toBe(2);
  });

  it("does not affect other source paths", () => {
    const links: ResolvedLinksMap = {
      "a.md": { "b.md": 1 },
      "x.md": { "b.md": 3 },
    };
    removePreviousSnippetLinks(links, "a.md", { "b.md": 1 });
    expect(links["x.md"]["b.md"]).toBe(3);
  });
});

// ─── applySnippetLinks ─────────────────────────────────────────

describe("applySnippetLinks", () => {
  it("creates sourcePath entry if missing", () => {
    const links: ResolvedLinksMap = {};
    applySnippetLinks(links, "a.md", { "b.md": 1 });
    expect(links["a.md"]).toEqual({ "b.md": 1 });
  });

  it("increments existing counts", () => {
    const links: ResolvedLinksMap = {
      "a.md": { "b.md": 2 },
    };
    applySnippetLinks(links, "a.md", { "b.md": 3 });
    expect(links["a.md"]["b.md"]).toBe(5);
  });

  it("adds new targets to existing row", () => {
    const links: ResolvedLinksMap = {
      "a.md": { "b.md": 1 },
    };
    applySnippetLinks(links, "a.md", { "c.md": 2 });
    expect(links["a.md"]).toEqual({ "b.md": 1, "c.md": 2 });
  });

  it("no-op for empty links map", () => {
    const links: ResolvedLinksMap = {};
    applySnippetLinks(links, "a.md", {});
    expect(links["a.md"]).toEqual({});
  });

  it("handles multiple targets at once", () => {
    const links: ResolvedLinksMap = {};
    applySnippetLinks(links, "a.md", { "b.md": 1, "c.md": 2, "d.md": 3 });
    expect(links["a.md"]).toEqual({ "b.md": 1, "c.md": 2, "d.md": 3 });
  });
});

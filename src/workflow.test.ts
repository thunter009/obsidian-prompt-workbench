import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import { resolveSnippets } from "@/workflow";

type FakeApp = {
  vault: {
    getAbstractFileByPath: (path: string) => TFile | null;
    getMarkdownFiles: () => TFile[];
    cachedRead: (file: TFile) => Promise<string>;
  };
};

function createApp(snippetsByPath: Record<string, string>): FakeApp {
  const files = new Map<string, TFile>();

  for (const path of Object.keys(snippetsByPath)) {
    const file = new TFile();
    const filename = path.split("/").at(-1) ?? path;
    const basename = filename.replace(/\.md$/, "");
    (file as unknown as { path: string }).path = path;
    (file as unknown as { basename: string }).basename = basename;
    (file as unknown as { extension: string }).extension = "md";
    files.set(path, file);
  }

  return {
    vault: {
      getAbstractFileByPath(path: string) {
        return files.get(path) ?? null;
      },
      getMarkdownFiles() {
        return [...files.values()];
      },
      async cachedRead(file: TFile) {
        return snippetsByPath[file.path] ?? "";
      },
    },
  };
}

describe("resolveSnippets", () => {
  it("resolves recursive snippet chains", async () => {
    const app = createApp({
      "A.md": "A-{snippet name=\"B\"}",
      "B.md": "B-{snippet name=\"C\"}",
      "C.md": "---\ntitle: leaf\n---\nC",
    });

    const result = await resolveSnippets(app as never, "Start {snippet name=\"A\"} End");

    expect(result.errors).toEqual([]);
    expect(result.resolved).toBe("Start A-B-C End");
  });

  it("detects circular references and leaves unresolved placeholders literal", async () => {
    const app = createApp({
      "A.md": "{snippet name=\"B\"}",
      "B.md": "{snippet name=\"A\"}",
    });

    const result = await resolveSnippets(app as never, "{snippet name=\"A\"}");

    expect(result.errors).toContain("Circular reference: A");
    expect(result.resolved).toBe("{snippet name=\"A\"}");
  });

  it("reports missing snippets and leaves non-snippet placeholders unchanged", async () => {
    const app = createApp({});

    const result = await resolveSnippets(
      app as never,
      "Prefix {snippet name=\"Missing\"} {argument name=\"topic\"} Suffix",
    );

    expect(result.errors).toEqual(["Missing snippet: Missing"]);
    expect(result.resolved).toBe("Prefix {snippet name=\"Missing\"} {argument name=\"topic\"} Suffix");
  });

  it("detects self-reference", async () => {
    const app = createApp({
      "self.md": "I ref myself: {snippet name=\"self\"}",
    });

    const result = await resolveSnippets(app as never, "{snippet name=\"self\"}");
    expect(result.errors).toContain("Circular reference: self");
  });

  it("resolves 4 levels deep (A→B→C→D)", async () => {
    const app = createApp({
      "A.md": "A-{snippet name=\"B\"}",
      "B.md": "B-{snippet name=\"C\"}",
      "C.md": "C-{snippet name=\"D\"}",
      "D.md": "D",
    });

    const result = await resolveSnippets(app as never, "{snippet name=\"A\"}");
    expect(result.errors).toEqual([]);
    expect(result.resolved).toBe("A-B-C-D");
  });

  it("detects longer cycle (A→B→C→A)", async () => {
    const app = createApp({
      "A.md": "{snippet name=\"B\"}",
      "B.md": "{snippet name=\"C\"}",
      "C.md": "{snippet name=\"A\"}",
    });

    const result = await resolveSnippets(app as never, "{snippet name=\"A\"}");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes("Circular reference"))).toBe(true);
  });

  it("resolves multiple snippets in one text", async () => {
    const app = createApp({
      "X.md": "X-content",
      "Y.md": "Y-content",
      "Z.md": "Z-content",
    });

    const result = await resolveSnippets(
      app as never,
      "Start {snippet name=\"X\"} mid {snippet name=\"Y\"} end {snippet name=\"Z\"}",
    );
    expect(result.errors).toEqual([]);
    expect(result.resolved).toBe("Start X-content mid Y-content end Z-content");
  });

  it("strips frontmatter from resolved snippets", async () => {
    const app = createApp({
      "with-fm.md": "---\ntitle: hello\ntags: [a, b]\n---\nActual body content",
    });

    const result = await resolveSnippets(app as never, "Before {snippet name=\"with-fm\"} After");
    expect(result.errors).toEqual([]);
    expect(result.resolved).toBe("Before Actual body content After");
    expect(result.resolved).not.toContain("title:");
  });

  it("preserves all non-snippet placeholders", async () => {
    const app = createApp({});
    const text = "{clipboard} {cursor} {date} {time} {argument name=\"x\"} {uuid} {selection}";

    const result = await resolveSnippets(app as never, text);
    expect(result.resolved).toBe(text);
  });

  it("handles mix of resolved, missing, and non-snippet placeholders", async () => {
    const app = createApp({
      "exists.md": "resolved-content",
    });

    const result = await resolveSnippets(
      app as never,
      "{snippet name=\"exists\"} {snippet name=\"nope\"} {clipboard}",
    );
    expect(result.resolved).toBe("resolved-content {snippet name=\"nope\"} {clipboard}");
    expect(result.errors).toEqual(["Missing snippet: nope"]);
  });
});

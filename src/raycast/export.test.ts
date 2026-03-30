import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { TFile } from "obsidian";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WORKFLOW_HEADER_START } from "@/workflow";
import {
  exportToRaycast,
  mergeSnippets,
  readExistingRaycastJson,
  writeBackup,
  type RaycastSnippet,
  type VaultSnippet,
} from "@/raycast/export";

function vaultSnippet(overrides: Partial<VaultSnippet> & Pick<VaultSnippet, "name" | "text">): VaultSnippet {
  return {
    path: `folder/${overrides.name}.md`,
    ...overrides,
  };
}

function writeTempFile(baseDir: string, relativePath: string, content: string): string {
  const fullPath = join(baseDir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

function makeVaultFile(path: string): TFile {
  const file = new TFile();
  const filename = path.split("/").at(-1) ?? path;
  const basename = filename.replace(/\.md$/, "");
  (file as unknown as { path: string }).path = path;
  (file as unknown as { basename: string }).basename = basename;
  (file as unknown as { extension: string }).extension = "md";
  return file;
}

describe("mergeSnippets", () => {
  it("returns an empty merge for empty inputs", () => {
    const merged = mergeSnippets([], [], false);
    expect(merged).toEqual({ merged: [], vaultDupes: [] });
  });

  it("preserves existing snippets when vault is empty", () => {
    const existing: RaycastSnippet[] = [
      { name: "A", text: "A-text" },
      { name: "B", text: "B-text", keyword: "b" },
    ];

    const result = mergeSnippets(existing, [], false);
    expect(result).toEqual({ merged: existing, vaultDupes: [] });
  });

  it("adds vault snippets when existing is empty", () => {
    const vault: VaultSnippet[] = [
      vaultSnippet({ name: "One", text: "one", keyword: "k1", tags: ["x"] }),
      vaultSnippet({ name: "Two", text: "two" }),
    ];

    const result = mergeSnippets([], vault, false);
    expect(result.vaultDupes).toEqual([]);
    expect(result.merged).toEqual([
      { name: "One", text: "one", keyword: "k1" },
      { name: "Two", text: "two" },
    ]);
  });

  it("overrides matching names, preserves non-vault entries, and appends new vault snippets", () => {
    const existing: RaycastSnippet[] = [
      { name: "A", text: "old A", keyword: "old" },
      { name: "B", text: "keep B" },
    ];
    const vault: VaultSnippet[] = [
      vaultSnippet({ name: "A", text: "new A", keyword: "new" }),
      vaultSnippet({ name: "C", text: "new C" }),
    ];

    const result = mergeSnippets(existing, vault, false);

    expect(result.vaultDupes).toEqual([]);
    expect(result.merged).toEqual([
      { name: "A", text: "new A", keyword: "new" },
      { name: "B", text: "keep B" },
      { name: "C", text: "new C" },
    ]);
  });

  it("deduplicates existing names and reports duplicate vault names with last vault value winning", () => {
    const existing: RaycastSnippet[] = [
      { name: "dup", text: "existing first" },
      { name: "dup", text: "existing second" },
      { name: "Solo", text: "solo" },
    ];
    const vault: VaultSnippet[] = [
      vaultSnippet({ name: "dup", text: "vault first" }),
      vaultSnippet({ name: "dup", text: "vault last" }),
    ];

    const result = mergeSnippets(existing, vault, false);

    expect(result.vaultDupes).toEqual(["dup"]);
    expect(result.merged).toEqual([
      { name: "dup", text: "vault last" },
      { name: "Solo", text: "solo" },
    ]);
  });

  it("matches names case-sensitively", () => {
    const existing: RaycastSnippet[] = [{ name: "Alpha", text: "existing" }];
    const vault: VaultSnippet[] = [vaultSnippet({ name: "alpha", text: "vault" })];

    const result = mergeSnippets(existing, vault, false);

    expect(result.merged).toEqual([
      { name: "Alpha", text: "existing" },
      { name: "alpha", text: "vault" },
    ]);
  });

  it("prepends workflow header when includeWorkflow is true", () => {
    const vault: VaultSnippet[] = [
      vaultSnippet({
        name: "Flow",
        text: "body text",
        workflow: {
          phase: "build",
          useWhen: "testing",
          tools: ["vitest"],
          workflowSteps: ["step one"],
        },
      }),
    ];

    const result = mergeSnippets([], vault, true);
    const text = result.merged[0].text;

    expect(text.startsWith(WORKFLOW_HEADER_START)).toBe(true);
    expect(text).toContain("Phase: Build");
    expect(text).toContain("Tools: vitest");
    expect(text).toContain("body text");
  });
});

describe("readExistingRaycastJson", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pw-raycast-read-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("parses a valid JSON file", async () => {
    const jsonPath = writeTempFile(
      tempDir,
      "snippets.json",
      JSON.stringify([{ name: "One", text: "Body" }], null, 2),
    );

    const result = await readExistingRaycastJson(jsonPath);
    expect(result).toEqual([{ name: "One", text: "Body" }]);
  });

  it("returns empty array for missing file", async () => {
    const result = await readExistingRaycastJson(join(tempDir, "missing.json"));
    expect(result).toEqual([]);
  });

  it("returns empty array for invalid JSON", async () => {
    const jsonPath = writeTempFile(tempDir, "invalid.json", "{ not valid");

    const result = await readExistingRaycastJson(jsonPath);
    expect(result).toEqual([]);
  });
});

describe("writeBackup", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pw-raycast-backup-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates backup file for existing source", () => {
    const sourcePath = writeTempFile(tempDir, "raycast/snippets.json", "[{\"name\":\"A\"}]");

    const backupPath = writeBackup(sourcePath);
    expect(backupPath).not.toBeNull();
    expect(existsSync(backupPath ?? "")).toBe(true);
    expect(readFileSync(backupPath ?? "", "utf8")).toBe("[{\"name\":\"A\"}]");
  });

  it("returns null when source file does not exist", () => {
    const backupPath = writeBackup(join(tempDir, "missing.json"));
    expect(backupPath).toBeNull();
  });
});

describe("exportToRaycast integration", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pw-raycast-export-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("exports with filtering, merge behavior, and backup creation", async () => {
    const vaultRoot = join(tempDir, "vault");
    const exportPath = join(tempDir, "raycast", "snippets.json");

    writeTempFile(vaultRoot, "Alpha.md", ["---", "keyword: alpha", "---", "Alpha body"].join("\n"));
    writeTempFile(vaultRoot, "nested/Beta.md", "Beta body");
    writeTempFile(vaultRoot, "_private/Hidden.md", "Should be filtered");
    writeTempFile(vaultRoot, "NoExport.md", ["---", "raycast-export: false", "---", "No export"].join("\n"));

    const existingSnippets = [
      { name: "Alpha", text: "Old alpha", keyword: "old" },
      { name: "Keep", text: "Keep me" },
    ];
    writeTempFile(tempDir, "raycast/snippets.json", JSON.stringify(existingSnippets, null, 2));

    const files = [
      makeVaultFile("Alpha.md"),
      makeVaultFile("nested/Beta.md"),
      makeVaultFile("_private/Hidden.md"),
      makeVaultFile("NoExport.md"),
    ];

    const fileByPath = new Map(files.map((file) => [file.path, file]));
    const app = {
      vault: {
        getMarkdownFiles: () => files,
        cachedRead: async (file: TFile) => readFileSync(join(vaultRoot, file.path), "utf8"),
        getAbstractFileByPath: (path: string) => fileByPath.get(path) ?? null,
      },
    };

    const plugin = {
      app,
      settings: {
        raycastExportPath: exportPath,
        includeWorkflowHeader: false,
      },
    };

    await exportToRaycast(plugin as never);

    const rawOutput = readFileSync(exportPath, "utf8");
    let output: RaycastSnippet[] = [];
    try {
      output = JSON.parse(rawOutput) as RaycastSnippet[];
    } catch (error) {
      throw new Error(`Expected valid JSON output at ${exportPath}: ${String(error)}`);
    }
    const byName = new Map(output.map((snippet) => [snippet.name, snippet]));

    expect(byName.get("Alpha")).toEqual({ name: "Alpha", text: "Alpha body", keyword: "alpha" });
    expect(byName.get("Beta")).toEqual({ name: "Beta", text: "Beta body" });
    expect(byName.get("Keep")).toEqual({ name: "Keep", text: "Keep me" });
    expect(byName.has("Hidden")).toBe(false);
    expect(byName.has("NoExport")).toBe(false);
    expect("tags" in (byName.get("Alpha") ?? {})).toBe(false);

    const backupFiles = readdirSync(dirname(exportPath)).filter((name) => name.startsWith("raycast-snippets-backup-"));
    expect(backupFiles.length).toBe(1);
    expect(readFileSync(join(dirname(exportPath), backupFiles[0]), "utf8")).toBe(JSON.stringify(existingSnippets, null, 2));
  });
});

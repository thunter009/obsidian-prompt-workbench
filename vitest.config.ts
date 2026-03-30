import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const codemirrorExternal = [
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
];

const builtinExternals = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "obsidian": resolve(__dirname, "src/test-support/obsidian-stub.ts"),
      "electron": resolve(__dirname, "src/test-support/electron-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "happy-dom",
    globals: false,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        lines: 1,
        functions: 1,
        branches: 1,
        statements: 1,
      },
    },
    server: {
      deps: {
        external: ["obsidian", "electron", ...builtinExternals, ...codemirrorExternal],
      },
    },
  },
});

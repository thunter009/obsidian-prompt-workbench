import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "@/frontmatter";

describe("vitest setup", () => {
  it("runs a smoke test", () => {
    const parsed = parseFrontmatter("---\nname: demo\n---\nHello");

    expect(parsed.frontmatter).toEqual({ name: "demo" });
    expect(parsed.body).toBe("Hello");
  });
});

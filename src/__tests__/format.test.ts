import { describe, expect, it } from "vitest";
import { formatMarkdown } from "../editor/format";

describe("formatMarkdown", () => {
  it("normalises bullets, emphasis and spacing", async () => {
    const out = await formatMarkdown("# T\n\n\n\n* a\n* b\n\n*em* and __strong__\r\n");
    expect(out).toBe("# T\n\n- a\n- b\n\n_em_ and **strong**\n");
  });
  it("aligns GFM tables", async () => {
    const out = await formatMarkdown("|a|bb|\n|-|-:|\n|ccc|d|\n");
    expect(out).toBe("| a   | bb |\n| --- | -: |\n| ccc |  d |\n");
  });
  it("keeps front matter, math and code fences", async () => {
    const src = "---\ntitle: x\n---\n\n$$\nE=mc^2\n$$\n\n```js\nlet a = 1;\n```\n";
    expect(await formatMarkdown(src)).toBe(src);
  });
  it("renumbers ordered lists", async () => {
    expect(await formatMarkdown("1. a\n1. b\n1. c\n")).toBe("1. a\n2. b\n3. c\n");
  });
});

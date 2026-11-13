import { describe, expect, it } from "vitest";
import { formatMarkdown } from "../editor/format";

describe("formatMarkdown", () => {
  it("normalises bullets, emphasis and spacing", async () => {
    const out = await formatMarkdown("# T\n\n\n\n* a\n* b\n\n*em* and __strong__\r\n");
    expect(out).toBe("# T\n\n- a\n- b\n\n*em* and **strong**\n");
  });
  it("aligns GFM tables", async () => {
    const out = await formatMarkdown("|a|bb|\n|-|-:|\n|ccc|d|\n");
    expect(out).toBe("| a   |  bb |\n| --- | --: |\n| ccc |   d |\n");
  });
  it("keeps front matter, math and code fences", async () => {
    const src = "---\ntitle: x\n---\n\n$$\nE=mc^2\n$$\n\n```js\nlet a = 1;\n```\n";
    expect(await formatMarkdown(src)).toBe(src);
  });
  it("leaves bare URLs as they were written", async () => {
    const src = "参考: https://example.com/a_b?x=1&y=2 を見る\n\nwww.example.com と mail@example.com\n\n- https://example.com/in-list\n";
    expect(await formatMarkdown(src)).toBe(src);
  });
  it("keeps links written with <...> or [...](...) as links", async () => {
    const src = "<https://example.com/angle> と [名前](https://example.com/named)\n";
    expect(await formatMarkdown(src)).toBe(src);
  });
  it("lines up tables that contain full-width text", async () => {
    const out = await formatMarkdown("|表|URL|\n|-|-|\n|あいう|https://example.com/t|\n");
    expect(out).toBe("| 表     | URL                   |\n| ------ | --------------------- |\n| あいう | https://example.com/t |\n");
  });
  it("renumbers ordered lists", async () => {
    expect(await formatMarkdown("1. a\n1. b\n1. c\n")).toBe("1. a\n2. b\n3. c\n");
  });
});

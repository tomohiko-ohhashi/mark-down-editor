import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../preview/markdown";

describe("renderMarkdown", () => {
  it("renders headings, GFM tables and task lists", async () => {
    const html = await renderMarkdown("# T\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done");
    expect(html).toContain("<h1>T</h1>");
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
  });
  it("renders KaTeX math", async () => {
    const html = await renderMarkdown("$E=mc^2$");
    expect(html).toContain('class="katex');
  });
  it("strips scripts and event handlers", async () => {
    const html = await renderMarkdown('<script>alert(1)</script><img src="x" onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
  it("keeps mermaid blocks as code when not rendering diagrams", async () => {
    const html = await renderMarkdown("```mermaid\ngraph LR\nA-->B\n```");
    expect(html).toContain('class="language-mermaid"');
  });
  it("does not treat '#text' without a space as a heading", async () => {
    const html = await renderMarkdown("#見出し");
    expect(html).toContain("<p>#見出し</p>");
  });
});

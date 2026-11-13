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
  it("tags blocks with their source line when asked", async () => {
    const html = await renderMarkdown("# A\n\npara\n\n## B\n\n- x\n", { sourceLines: true });
    expect(html).toContain('<h1 data-line="1">A</h1>');
    expect(html).toContain('<p data-line="3">para</p>');
    expect(html).toContain('<h2 data-line="5">B</h2>');
    expect(html).toContain('<li data-line="7">x</li>');
    expect(await renderMarkdown("# A")).not.toContain("data-line");
  });
  it("hides front matter instead of rendering it as text", async () => {
    const html = await renderMarkdown("---\ntitle: x\n---\n\n# A\n");
    expect(html).not.toContain("title: x");
    expect(html).toContain("<h1>A</h1>");
  });
  it("does not treat '#text' without a space as a heading", async () => {
    const html = await renderMarkdown("#見出し");
    expect(html).toContain("<p>#見出し</p>");
  });
});

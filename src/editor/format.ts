import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import remarkStringify from "remark-stringify";
import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

/**
 * Normalise a whole Markdown document: "-" bullets, "_" emphasis, "**" strong,
 * fenced code, aligned GFM tables, single blank lines between blocks, LF line
 * endings and one trailing newline. Front matter and math are kept as-is.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ["yaml", "toml"])
  .use(remarkStringify, {
    bullet: "-",
    emphasis: "_",
    strong: "*",
    fences: true,
    listItemIndent: "one",
    rule: "-",
    incrementListMarker: true,
    resourceLink: false,
  });

export async function formatMarkdown(src: string): Promise<string> {
  const normalized = src.replace(/\r\n?/g, "\n");
  const out = String(await processor.process(normalized));
  return out.endsWith("\n") ? out : out + "\n";
}

/** Replace the editor content with the formatted version, keeping the cursor on the same line. */
export async function formatDocument(view: EditorView): Promise<boolean> {
  const before = view.state.doc.toString();
  const after = await formatMarkdown(before);
  if (after === before) return false;
  const line = view.state.doc.lineAt(view.state.selection.main.head).number;
  view.dispatch({ changes: { from: 0, to: before.length, insert: after } });
  const n = Math.min(line, view.state.doc.lines);
  view.dispatch({ selection: EditorSelection.cursor(view.state.doc.line(n).from), scrollIntoView: true });
  return true;
}

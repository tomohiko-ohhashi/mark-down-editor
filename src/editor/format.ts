import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import remarkStringify from "remark-stringify";
import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { displayWidth } from "./table";

interface Node {
  type: string;
  value?: string;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

/**
 * Keep URLs that were written bare ("https://example.com", "www.example.com",
 * "name@example.com") exactly as they were. The parser reads them as links,
 * and writing a link back out would turn them into "<https://example.com>" or
 * "[www.example.com](http://www.example.com)": the same link, but not what the
 * author typed. A link written with "<...>" or "[...](...)" is left to the formatter.
 */
function keepBareUrls() {
  return (tree: Node, file: { value: unknown }) => {
    const source = String(file.value);
    const walk = (node: Node) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        const from = child.position?.start.offset;
        const to = child.position?.end.offset;
        if (child.type === "link" && from != null && to != null) {
          const written = source.slice(from, to);
          // An "html" node is written out verbatim, which is what is wanted here.
          if (!/^[<[]/.test(written)) return { type: "html", value: written };
        }
        walk(child);
        return child;
      });
    };
    walk(tree);
  };
}

/**
 * Normalise a whole Markdown document: "-" bullets, "_" emphasis, "**" strong,
 * fenced code, aligned GFM tables, single blank lines between blocks, LF line
 * endings and one trailing newline. Front matter and math are kept as-is.
 */
const processor = unified()
  .use(remarkParse)
  // Table columns are lined up by display width, so full-width (Japanese) text counts as two columns.
  .use(remarkGfm, { stringLength: displayWidth })
  .use(remarkMath)
  .use(remarkFrontmatter, ["yaml", "toml"])
  .use(keepBareUrls)
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

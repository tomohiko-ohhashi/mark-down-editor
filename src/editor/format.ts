import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import remarkStringify from "remark-stringify";
import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { displayWidth, formatTable, splitRow, type TableInfo } from "./table";

interface Node {
  type: string;
  value?: string;
  children?: Node[];
  /** Column alignment of a table. */
  align?: (string | null)[];
  data?: { trailingSpaces?: boolean };
  position?: { start: { offset?: number; column?: number }; end: { offset?: number } };
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
        // A line break made with two spaces at the end of the line stays that way (see the "break" handler).
        if (child.type === "break" && from != null && source[from] === " ") {
          return { ...child, data: { trailingSpaces: true } };
        }
        walk(child);
        return child;
      });
    };
    walk(tree);
  };
}

/**
 * Normalise a whole Markdown document: "-" bullets, "*" emphasis, "**" strong,
 * fenced code, aligned GFM tables, single blank lines between blocks, LF line
 * endings and one trailing newline. Front matter and math are kept as-is.
 *
 * The rule for everything here: formatting changes how the text is written,
 * never what it means, and it does not add markup the author did not write.
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
    // "*" and not "_": "_" does not work next to letters, which is everywhere in Japanese text
    // ("これは_強調_です" is not emphasis), and the writer would fall back to character codes.
    emphasis: "*",
    strong: "*",
    fences: true,
    listItemIndent: "one",
    rule: "-",
    incrementListMarker: true,
    resourceLink: false,
    handlers: {
      // Keep the author's way of breaking a line: two trailing spaces, or a backslash.
      break: (node: Node) => (node.data?.trailingSpaces ? "  \n" : "\\\n"),
    },
  });

/** The same parser without the writer, to compare what two texts mean. */
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter, ["yaml", "toml"]);

/** What a document means, as text: its syntax tree without the positions. */
function meaning(src: string): string {
  return JSON.stringify(parser.parse(src), (key, value: unknown) => (key === "position" ? undefined : value));
}

/**
 * The writer puts a backslash before every character that could be read as
 * markup in some context ("\[メモ]", "9:00\~18:00", "C\#"). Most of them are
 * not needed where they stand. Take out the ones whose removal leaves the
 * meaning exactly the same, so the text reads the way it was typed.
 */
function dropNeedlessEscapes(out: string): string {
  const escape = /\\(?=[!-/:-@[-`{-~])/g;
  const want = meaning(out);
  const all = out.replace(escape, "");
  if (all === out) return out;
  if (meaning(all) === want) return all;
  // Some are needed: decide one by one, from the end so earlier positions stay valid.
  const at = Array.from(out.matchAll(escape), (m) => m.index);
  if (at.length > 300) return out; // not worth hundreds of parses
  let text = out;
  for (let i = at.length - 1; i >= 0; i--) {
    const candidate = text.slice(0, at[i]) + text.slice(at[i] + 1);
    if (meaning(candidate) === want) text = candidate;
  }
  return text;
}

/**
 * Line up the columns of the tables once more, with the same routine the
 * table commands of the editor use. Needed because the writer measured the
 * cells before the needless backslashes were taken out. Only tables that
 * start at the left margin; one inside a quote or a list is left as it is.
 */
function realignTables(text: string): string {
  const tables = ((parser.parse(text) as Node).children ?? []).filter((n) => n.type === "table" && n.position?.start.column === 1);
  let out = text;
  for (const table of tables.reverse()) {
    const from = table.position?.start.offset;
    const to = table.position?.end.offset;
    if (from == null || to == null) continue;
    const lines = out.slice(from, to).split("\n");
    if (lines.length < 2) continue;
    const rows = lines.filter((_, i) => i !== 1).map(splitRow);
    const aligns = (table.align ?? []).map((a) => (a === "left" || a === "right" || a === "center" ? a : "none")) as TableInfo["aligns"];
    const cols = Math.max(aligns.length, ...rows.map((r) => r.length));
    for (const r of rows) while (r.length < cols) r.push("");
    while (aligns.length < cols) aligns.push("none");
    out = out.slice(0, from) + formatTable({ startLine: 0, endLine: 0, rows, aligns }) + out.slice(to);
  }
  // Belt and braces: never let this step change what the document means.
  return out === text || meaning(out) === meaning(text) ? out : text;
}

export async function formatMarkdown(src: string): Promise<string> {
  const normalized = src.replace(/\r\n?/g, "\n");
  const out = realignTables(dropNeedlessEscapes(String(await processor.process(normalized))));
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

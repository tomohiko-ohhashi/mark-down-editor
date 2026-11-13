import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/**
 * "Live preview": hide Markdown markup (heading hashes, emphasis markers,
 * inline code ticks, link targets) on lines the cursor is not on, so the
 * text reads like the rendered result while still being plain Markdown.
 */
const HIDDEN_MARKS = new Set(["HeaderMark", "EmphasisMark", "CodeMark", "StrikethroughMark"]);
const hide = Decoration.replace({});

function cursorLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const r of view.state.selection.ranges) {
    const a = view.state.doc.lineAt(r.from).number;
    const b = view.state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) lines.add(n);
  }
  return lines;
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const active = cursorLines(view);
  const doc = view.state.doc;
  const ranges: { from: number; to: number }[] = [];
  const push = (from: number, to: number) => {
    if (to > from && !active.has(doc.lineAt(from).number)) ranges.push({ from, to });
  };
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (HIDDEN_MARKS.has(node.name)) {
          let end = node.to;
          // Swallow the single space after "#", "##", ... so the heading text starts at the margin.
          if (node.name === "HeaderMark" && doc.sliceString(end, end + 1) === " ") end += 1;
          push(node.from, end);
        } else if (node.name === "Link" || node.name === "Image") {
          // [text](url) → text ; keep the whole thing when it has no label.
          const n = node.node;
          const marks: { from: number; to: number }[] = [];
          let hasTarget = false;
          for (let c = n.firstChild; c; c = c.nextSibling) {
            if (c.name === "LinkMark") marks.push({ from: c.from, to: c.to });
            if (c.name === "URL") hasTarget = true;
          }
          // Only "[text](url)". Brackets without an address are usually just brackets
          // ("[重要]", "a[0]", "[^1]"), and hiding them would change what the text says.
          if (marks.length >= 2 && hasTarget) {
            const open = marks[0];
            const closeLabel = marks[1];
            push(open.from, open.to); // "[" or "!["
            push(closeLabel.from, node.to); // "](url)" or "][ref]"
          }
        }
      },
    });
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  let last = -1;
  for (const r of ranges) {
    if (r.from < last) continue;
    builder.add(r.from, r.to, hide);
    last = r.to;
  }
  return builder.finish();
}

export const livePreview = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  ),
  EditorView.theme({
    ".cm-line": { transition: "none" },
  }),
];

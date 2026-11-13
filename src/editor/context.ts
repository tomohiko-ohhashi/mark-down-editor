import type { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";

/** Names of the syntax nodes around `pos`, innermost first. */
function nodesAt(state: EditorState, pos: number): string[] {
  const tree = ensureSyntaxTree(state, Math.min(pos + 1, state.doc.length), 50) ?? syntaxTree(state);
  const names: string[] = [];
  for (let n: { name: string; parent: unknown } | null = tree.resolveInner(pos, 1); n; n = n.parent as typeof n) names.push(n.name);
  return names;
}

const CODE_BLOCKS = new Set(["FencedCode", "CodeBlock"]);
const CODE_OR_LINK = new Set(["FencedCode", "CodeBlock", "InlineCode", "CodeText", "Link", "Image", "URL", "Autolink", "LinkReference", "HTMLBlock", "HTMLTag"]);

/** True when `pos` is inside a code block: what is written there is code, not Markdown. */
export function inCodeBlock(state: EditorState, pos: number): boolean {
  return nodesAt(state, pos).some((n) => CODE_BLOCKS.has(n));
}

/** True when `pos` is in code, in a link or in HTML: places where a link must not be made out of the text. */
export function inCodeOrLink(state: EditorState, pos: number): boolean {
  return nodesAt(state, pos).some((n) => CODE_OR_LINK.has(n));
}

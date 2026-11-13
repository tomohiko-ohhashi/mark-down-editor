import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Transaction } from "@codemirror/state";
import { parseLinePrefix, continuationFor, continueList, indentListItem, outdentListItem, plainNewline } from "../editor/listContinuation";

function run(doc: string, cursor: number) {
  let state = EditorState.create({ doc, selection: EditorSelection.single(cursor) });
  const ok = continueList({ state, dispatch: (tr: Transaction) => (state = tr.state) });
  return { ok, text: state.doc.toString(), cursor: state.selection.main.head };
}

describe("parseLinePrefix", () => {
  it("recognises bullets, ordered items, quotes and tasks", () => {
    expect(parseLinePrefix("- item")).toEqual({ indent: "", marker: "- ", rest: "item", length: 2 });
    expect(parseLinePrefix("  1. item")).toEqual({ indent: "  ", marker: "1. ", rest: "item", length: 5 });
    expect(parseLinePrefix("> quote")).toEqual({ indent: "", marker: "> ", rest: "quote", length: 2 });
    expect(parseLinePrefix("> - nested")).toEqual({ indent: "", marker: "> - ", rest: "nested", length: 4 });
    expect(parseLinePrefix("- [x] done")).toEqual({ indent: "", marker: "- [ ] ", rest: "done", length: 6 });
    expect(parseLinePrefix("plain")).toBeNull();
  });
  it("does not take ordinary text for a list marker", () => {
    for (const text of ["**注意** これは", "*強調* です", "-5度です", "1.5 倍です", "+1 する", "---", "* * *", "- - -", "___", "#タグ"]) {
      expect(parseLinePrefix(text), text).toBeNull();
    }
  });
});

describe("continuationFor", () => {
  it("increments ordered lists and keeps bullets", () => {
    expect(continuationFor("3. three")).toEqual({ insert: "4. ", exitList: false });
    expect(continuationFor("* x")).toEqual({ insert: "* ", exitList: false });
    expect(continuationFor("- ")).toEqual({ insert: "", exitList: true });
  });
});

describe("continueList command", () => {
  it("adds the next item after the cursor", () => {
    const r = run("- a", 3);
    expect(r.text).toBe("- a\n- ");
    expect(r.cursor).toBe(6);
  });
  it("leaves the list on an empty item", () => {
    const r = run("- a\n- ", 6);
    expect(r.text).toBe("- a\n");
  });
  it("is an ordinary line break in front of or inside the marker", () => {
    expect(run("- item", 0).ok).toBe(false);
    expect(run("- item", 1).ok).toBe(false);
    expect(run("  - item", 1).ok).toBe(false);
    expect(run("- item", 2).text).toBe("- \n- item");
  });
  it("removes only the marker of an empty item, never the next line", () => {
    expect(run("-\nnext", 1).text).toBe("\nnext");
    expect(run("  - \nnext", 4).text).toBe("  \nnext");
    expect(run("- [ ] \nnext", 6).text).toBe("\nnext");
  });
  it("does nothing outside lists", () => {
    expect(run("text", 4).ok).toBe(false);
  });
});

describe("Tab on a list item", () => {
  const apply = (cmd: typeof indentListItem, doc: string, cursor: number) => {
    let state = EditorState.create({ doc, selection: EditorSelection.single(Math.min(cursor, doc.length)) });
    const ok = cmd({ state, dispatch: (tr: Transaction) => (state = tr.state) });
    return ok ? state.doc.toString() : null;
  };
  it("nests under the item above, at the column of its text, with a number that starts a list", () => {
    expect(apply(indentListItem, "- a\n- b", 7)).toBe("- a\n  - b");
    expect(apply(indentListItem, "1. a\n2. b", 9)).toBe("1. a\n   1. b");
    expect(apply(indentListItem, "10. a\n11. b", 11)).toBe("10. a\n    1. b");
    expect(apply(indentListItem, "1. a\n   1. x\n2. b", 18)).toBe("1. a\n   1. x\n   2. b");
    // The first item has nothing to go under.
    expect(apply(indentListItem, "- a", 3)).toBeNull();
    expect(apply(indentListItem, "text\n- a", 8)).toBeNull();
  });
  it("Shift+Tab goes back to the level of the item it is under", () => {
    expect(apply(outdentListItem, "1. a\n   1. b", 12)).toBe("1. a\n2. b");
    expect(apply(outdentListItem, "- a\n  - b", 9)).toBe("- a\n- b");
    expect(apply(outdentListItem, "- a", 3)).toBeNull();
  });
});

describe("plainNewline", () => {
  const press = (doc: string, cursor: number) => {
    let state = EditorState.create({ doc, selection: EditorSelection.single(cursor) });
    plainNewline({ state, dispatch: (tr: Transaction) => (state = tr.state) });
    return state.doc.toString();
  };
  it("keeps the line's own indentation and nothing else", () => {
    expect(press("\tcode", 5)).toBe("\tcode\n\t");
    expect(press("  a  ", 3)).toBe("  a\n    ");
    expect(press("    x", 2)).toBe("  \n    x");
    expect(press("[t]()", 4)).toBe("[t](\n)");
  });
});

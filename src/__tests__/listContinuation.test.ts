import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Transaction } from "@codemirror/state";
import { parseLinePrefix, continuationFor, continueList } from "../editor/listContinuation";

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

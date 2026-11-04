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
    expect(parseLinePrefix("- item")).toEqual({ indent: "", marker: "- ", rest: "item" });
    expect(parseLinePrefix("  1. item")).toEqual({ indent: "  ", marker: "1. ", rest: "item" });
    expect(parseLinePrefix("> quote")).toEqual({ indent: "", marker: "> ", rest: "quote" });
    expect(parseLinePrefix("> - nested")).toEqual({ indent: "", marker: "> - ", rest: "nested" });
    expect(parseLinePrefix("- [x] done")).toEqual({ indent: "", marker: "- [ ] ", rest: "done" });
    expect(parseLinePrefix("plain")).toBeNull();
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
  it("does nothing outside lists", () => {
    expect(run("text", 4).ok).toBe(false);
  });
});

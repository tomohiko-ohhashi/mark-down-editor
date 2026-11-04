import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Transaction } from "@codemirror/state";
import { setHeading, toggleBold } from "../editor/formatting";

function run(doc: string, sel: [number, number], cmd: (t: { state: EditorState; dispatch: (tr: Transaction) => void }) => boolean) {
  let state = EditorState.create({ doc, selection: EditorSelection.single(sel[0], sel[1]) });
  cmd({ state, dispatch: (tr) => (state = tr.state) });
  return state;
}

describe("setHeading", () => {
  it("adds, changes and removes a heading prefix", () => {
    expect(run("見出し", [0, 0], setHeading(1)).doc.toString()).toBe("# 見出し");
    expect(run("# 見出し", [0, 0], setHeading(2)).doc.toString()).toBe("## 見出し");
    expect(run("## 見出し", [0, 0], setHeading(2)).doc.toString()).toBe("見出し");
  });
  it("re-applies after the marker was deleted by hand", () => {
    const s = run("見出し", [0, 0], setHeading(1));
    expect(s.doc.toString()).toBe("# 見出し");
  });
});

describe("toggleBold", () => {
  it("wraps and unwraps the selection", () => {
    const s = run("abc", [0, 3], toggleBold);
    expect(s.doc.toString()).toBe("**abc**");
    const t = run(s.doc.toString(), [2, 5], toggleBold);
    expect(t.doc.toString()).toBe("abc");
  });
});

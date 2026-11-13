import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Transaction } from "@codemirror/state";
import { setHeading, toggleBold, toggleItalic, toggleCode, insertLink } from "../editor/formatting";

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
  it("leaves the cursor after the marker, so typing continues the heading", () => {
    const empty = run("", [0, 0], setHeading(1));
    expect(empty.doc.toString()).toBe("# ");
    expect(empty.selection.main.head).toBe(2);
    const start = run("abc", [0, 0], setHeading(2));
    expect(start.selection.main.head).toBe(3);
    const end = run("abc", [3, 3], setHeading(3));
    expect(end.selection.main.head).toBe(7);
    const changed = run("## abc", [0, 0], setHeading(1));
    expect(changed.doc.toString()).toBe("# abc");
    expect(changed.selection.main.head).toBe(2);
    const removed = run("# abc", [5, 5], setHeading(1));
    expect(removed.selection.main.head).toBe(3);
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

describe("bold, italic and code", () => {
  const text = (doc: string, sel: [number, number], cmd: Parameters<typeof run>[2]) => run(doc, sel, cmd).doc.toString();
  /** Type like a user: run the command at the cursor, insert text, run it again, insert more. */
  function typeThrough(cmd: Parameters<typeof run>[2]) {
    let state = EditorState.create({ doc: "foo " , selection: EditorSelection.single(4) });
    const apply = () => cmd({ state, dispatch: (tr) => (state = tr.state) });
    const type = (s: string) => (state = state.update(state.replaceSelection(s)).state);
    apply();
    type("x");
    apply();
    type(" after");
    return state.doc.toString();
  }
  it("pressing the shortcut again steps out of the markers instead of adding more", () => {
    expect(typeThrough(toggleBold)).toBe("foo **x** after");
    expect(typeThrough(toggleItalic)).toBe("foo *x* after");
    expect(typeThrough(toggleCode)).toBe("foo `x` after");
  });
  it("an empty pair is taken away again", () => {
    expect(text("a **** b", [4, 4], toggleBold)).toBe("a  b");
    expect(text("a ** b", [3, 3], toggleItalic)).toBe("a  b");
  });
  it("leaves the line break and the spaces of a selection outside the markers", () => {
    expect(text("first line\nsecond line", [0, 11], toggleBold)).toBe("**first line**\nsecond line");
    expect(text("これは 強調 です", [3, 7], toggleBold)).toBe("これは **強調** です");
    expect(text("first line\nsecond line", [0, 11], toggleItalic)).toBe("*first line*\nsecond line");
    expect(text("first line\nsecond", [0, 11], insertLink)).toBe("[first line](url)\nsecond");
  });
  it("wraps each line of a selection over several lines", () => {
    expect(text("- a\n- b\n\nc", [2, 10], toggleBold)).toBe("- **a**\n- **b**\n\n**c**");
    expect(text("# 見出し\n> 引用\n- [ ] 作業", [0, 19], toggleBold)).toBe("# **見出し**\n> **引用**\n- [ ] **作業**");
    expect(text("a\n\nb", [0, 4], toggleItalic)).toBe("*a*\n\n*b*");
  });
  it("takes the markers off when they are part of the selection", () => {
    expect(text("**foo**", [0, 7], toggleBold)).toBe("foo");
    expect(text("*foo*", [0, 5], toggleItalic)).toBe("foo");
    expect(text("`foo`", [0, 5], toggleCode)).toBe("foo");
    expect(text("a **foo** b", [4, 7], toggleBold)).toBe("a foo b");
  });
  it("italic: stars of bold and underscores of a name are not italic markers", () => {
    expect(text("**foo**", [2, 5], toggleItalic)).toBe("***foo***");
    expect(text("snake_case_name", [6, 10], toggleItalic)).toBe("snake_*case*_name");
    expect(text("__foo__", [2, 5], toggleItalic)).toBe("__*foo*__");
    expect(text("a _foo_ b", [3, 6], toggleItalic)).toBe("a foo b");
    expect(text("これは*強調*です", [4, 6], toggleItalic)).toBe("これは強調です");
  });
});

describe("setHeading on a selection", () => {
  it("does not touch the line after a whole-line selection, nor blank lines in between", () => {
    expect(run("first\nsecond", [0, 6], setHeading(1)).doc.toString()).toBe("# first\nsecond");
    expect(run("a\nb\n\nc", [0, 6], setHeading(2)).doc.toString()).toBe("## a\n## b\n\n## c");
  });
});

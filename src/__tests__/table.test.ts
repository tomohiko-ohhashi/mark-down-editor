import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { displayWidth, splitRow, formatTable, tableAt } from "../editor/table";

describe("displayWidth", () => {
  it("counts CJK as double width", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("日本語")).toBe(6);
    expect(displayWidth("a日")).toBe(3);
  });
});

describe("splitRow", () => {
  it("splits cells and trims", () => {
    expect(splitRow("| a | b  |c|")).toEqual(["a", "b", "c"]);
  });
  it("keeps escaped pipes and pipes inside code", () => {
    expect(splitRow("| a \\| b | `x|y` |")).toEqual(["a \\| b", "`x|y`"]);
  });
});

describe("a table inside a list item", () => {
  it("keeps its indent when it is rewritten", () => {
    const state = EditorState.create({ doc: "- item\n\n  |a|b|\n  |-|-|\n  |1|2|\n" });
    const t = tableAt(state, state.doc.line(5).from + 3)!;
    expect(formatTable(t)).toBe("  | a   | b   |\n  | --- | --- |\n  | 1   | 2   |");
  });
});

describe("tableAt / formatTable", () => {
  const src = "intro\n|項目|値|\n|---|--:|\n|OS|mac|\n\nafter";
  it("finds the table around the cursor", () => {
    const state = EditorState.create({ doc: src });
    const t = tableAt(state, state.doc.line(4).from + 2)!;
    expect(t).not.toBeNull();
    expect(t.startLine).toBe(2);
    expect(t.endLine).toBe(4);
    expect(t.rows).toEqual([["項目", "値"], ["OS", "mac"]]);
    expect(t.aligns).toEqual(["none", "right"]);
  });
  it("returns null outside tables", () => {
    const state = EditorState.create({ doc: src });
    expect(tableAt(state, 0)).toBeNull();
  });
  it("formats with aligned columns (CJK aware)", () => {
    const state = EditorState.create({ doc: src });
    const t = tableAt(state, state.doc.line(2).from)!;
    expect(formatTable(t)).toBe("| 項目 |  値 |\n| ---- | --: |\n| OS   | mac |");
  });
  it("pads short rows", () => {
    const state = EditorState.create({ doc: "| a | b |\n| - | - |\n| x |" });
    const t = tableAt(state, 0)!;
    expect(t.rows[1]).toEqual(["x", ""]);
  });
});

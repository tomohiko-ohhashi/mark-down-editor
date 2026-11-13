import { describe, it, expect } from "vitest";
import { tabLabels, suggestFileName } from "../features/files/names";
import { taskToggle } from "../editor/tasks";
import { droppedKind } from "../features/files/dropped";
import { dropAliases } from "../features/fonts";

describe("tabLabels", () => {
  it("shows plain file names when they differ", () => {
    expect(tabLabels(["/n/a.md", "/n/b.md", null])).toEqual(["a.md", "b.md", "無題"]);
  });
  it("adds the folder to files that share a name", () => {
    expect(tabLabels(["/w/docs/README.md", "/w/README.md", "/w/x.md"])).toEqual(["README.md — docs", "README.md — w", "x.md"]);
    expect(tabLabels(["C:\\w\\a\\memo.md", "C:\\w\\b\\memo.md"])).toEqual(["memo.md — a", "memo.md — b"]);
  });
  it("copes with root-relative paths of web mode and several untitled tabs", () => {
    expect(tabLabels(["memo.md", "sub/memo.md", null, null])).toEqual(["memo.md — /", "memo.md — sub", "無題", "無題"]);
  });
});

describe("suggestFileName", () => {
  it("uses the first heading", () => {
    expect(suggestFileName("# 議事録 2026-11-13\n\n本文")).toBe("議事録 2026-11-13.md");
    expect(suggestFileName("\n\n## Setup guide ##\ntext")).toBe("Setup guide.md");
  });
  it("skips front matter and falls back to the first line of text", () => {
    expect(suggestFileName("---\ntitle: x\n---\n\nはじめに書く文\n")).toBe("はじめに書く文.md");
  });
  it("removes characters that are not allowed in file names", () => {
    expect(suggestFileName('# a/b\\c: "d" <e> | f? *g*')).toBe("a b c d e f g.md");
    expect(suggestFileName("# ...hidden")).toBe("hidden.md");
  });
  it("keeps names short and never returns an empty name", () => {
    expect(suggestFileName("# " + "あ".repeat(200)).length).toBe(60 + 3);
    expect(suggestFileName("")).toBe("untitled.md");
    expect(suggestFileName("# ***")).toBe("untitled.md");
  });
});

describe("taskToggle", () => {
  it("flips the mark of a task item", () => {
    expect(taskToggle("- [ ] todo")).toEqual({ offset: 3, insert: "x" });
    expect(taskToggle("- [x] done")).toEqual({ offset: 3, insert: " " });
    expect(taskToggle("  * [X] nested")).toEqual({ offset: 5, insert: " " });
    expect(taskToggle("1. [ ] numbered")).toEqual({ offset: 4, insert: "x" });
    expect(taskToggle("> - [ ] quoted")).toEqual({ offset: 5, insert: "x" });
  });
  it("ignores other lines", () => {
    expect(taskToggle("- plain item")).toBeNull();
    expect(taskToggle("text [ ] in a paragraph")).toBeNull();
    expect(taskToggle("- [link](x)")).toBeNull();
  });
});

describe("droppedKind", () => {
  it("sorts dropped files by extension", () => {
    expect(droppedKind("/a/Notes.MD")).toBe("markdown");
    expect(droppedKind("C:\\x\\memo.txt")).toBe("markdown");
    expect(droppedKind("/a/shot.PNG")).toBe("image");
    expect(droppedKind("/a/photo.jpeg")).toBe("image");
    expect(droppedKind("/a/folder")).toBe("other");
    expect(droppedKind("/a/archive.zip")).toBe("other");
  });
});

describe("dropAliases", () => {
  const f = (name: string) => ({ name, label: name, monospace: false });
  it("keeps one font of each group that measures the same, preferring a native name", () => {
    const sig = (n: string) => ({ Arial: "A", Helvetica: "A", "Liberation Sans": "A", Inter: "B", "Helvetica Neue": "C", Roboto: "C" })[n] ?? n;
    expect(dropAliases(["Arial", "Helvetica", "Inter", "Liberation Sans", "Helvetica Neue", "Roboto"].map(f), sig).map((x) => x.name)).toEqual([
      "Arial",
      "Inter",
      "Helvetica Neue",
    ]);
  });
  it("leaves fonts with different measurements alone", () => {
    expect(dropAliases(["Inter", "Roboto"].map(f), (n) => n)).toHaveLength(2);
  });
});

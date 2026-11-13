import { describe, it, expect } from "vitest";
import { snapshotSession, normalizeSession, lineOffset } from "../features/session";
import { cssString, printPageCss, supportsMarginBoxes } from "../features/printPage";
import { fontFamilyCss } from "../features/fonts";

const base = {
  showSidebar: true,
  showOutline: false,
  cheatSheetOpen: true,
  viewMode: "editor" as const,
  typewriterMode: false,
};

describe("snapshotSession", () => {
  it("records the open files in tab order, the front tab and the panels", () => {
    const docs = [
      { id: "a", path: "/n/a.md" },
      { id: "u", path: null },
      { id: "b", path: "/n/b.md" },
    ];
    const snap = snapshotSession({ ...base, docs, activeId: "b" }, new Map([["/n/b.md", 12]]));
    expect(snap.lastOpenFiles).toEqual(["/n/a.md", "/n/b.md"]);
    expect(snap.session).toEqual({ ...base, activeFile: "/n/b.md", cursors: { "/n/b.md": 12 } });
  });

  it("keeps cursor lines only for files that are still open, and not for line 1", () => {
    const docs = [{ id: "a", path: "a.md" }];
    const cursors = new Map([
      ["a.md", 1],
      ["closed.md", 40],
    ]);
    expect(snapshotSession({ ...base, docs, activeId: "a" }, cursors).session.cursors).toEqual({});
  });

  it("has no front file when an untitled document is in front", () => {
    const docs = [
      { id: "a", path: "a.md" },
      { id: "u", path: null },
    ];
    expect(snapshotSession({ ...base, docs, activeId: "u" }, new Map()).session.activeFile).toBeNull();
  });
});

describe("normalizeSession", () => {
  it("returns null when nothing usable was stored", () => {
    expect(normalizeSession(null)).toBeNull();
    expect(normalizeSession(undefined)).toBeNull();
    expect(normalizeSession("x")).toBeNull();
  });

  it("fills in defaults and drops broken values", () => {
    expect(normalizeSession({ showSidebar: true, viewMode: "sideways", cursors: { "a.md": 7.9, "b.md": "3", "c.md": 0 } })).toEqual({
      activeFile: null,
      showSidebar: true,
      showOutline: false,
      cheatSheetOpen: false,
      viewMode: "split",
      typewriterMode: false,
      cursors: { "a.md": 7 },
    });
  });

  it("round-trips a snapshot", () => {
    const { session } = snapshotSession({ ...base, docs: [{ id: "a", path: "a.md" }], activeId: "a" }, new Map([["a.md", 5]]));
    expect(normalizeSession(JSON.parse(JSON.stringify(session)))).toEqual(session);
  });
});

describe("lineOffset", () => {
  const text = "one\ntwo\n\nfour";
  it("gives the start of a 1-based line", () => {
    expect(lineOffset(text, 1)).toBe(0);
    expect(lineOffset(text, 2)).toBe(4);
    expect(lineOffset(text, 3)).toBe(8);
    expect(lineOffset(text, 4)).toBe(9);
  });
  it("stops at the last line when the file became shorter", () => {
    expect(lineOffset(text, 99)).toBe(9);
    expect(lineOffset("", 5)).toBe(0);
  });
});

describe("print header / footer", () => {
  it("escapes file names for a CSS string", () => {
    expect(cssString("メモ.md")).toBe('"メモ.md"');
    expect(cssString('a"b\\c.md')).toBe('"a\\"b\\\\c.md"');
    expect(cssString("a\nb")).toBe('"a\\a b"');
  });

  it("puts only file name, time and page number in the margins", () => {
    const css = printPageCss('my "notes".md', "2026/11/13 16:30");
    expect(css).toContain('@top-left { content: "my \\"notes\\".md";');
    expect(css).toContain('@top-right { content: "2026/11/13 16:30";');
    expect(css).toContain('@bottom-right { content: counter(page) " / " counter(pages);');
    expect(css).not.toContain("url");
  });

  it("uses margin boxes only where the engine has them", () => {
    expect(supportsMarginBoxes("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0")).toBe(true);
    expect(supportsMarginBoxes("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")).toBe(false);
    expect(supportsMarginBoxes("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe(false);
  });
});

describe("fontFamilyCss", () => {
  it("is null for the default", () => {
    expect(fontFamilyCss("", "monospace")).toBeNull();
    expect(fontFamilyCss("  ", "monospace")).toBeNull();
  });
  it("quotes a picked font and keeps the fallbacks behind it", () => {
    expect(fontFamilyCss("Cascadia Code", "Consolas, monospace")).toBe('"Cascadia Code", Consolas, monospace');
    expect(fontFamilyCss("ＭＳ ゴシック", "monospace")).toBe('"ＭＳ ゴシック", monospace');
  });
  it("leaves a hand-written font list from an older version alone", () => {
    expect(fontFamilyCss("'JetBrains Mono', Menlo, monospace", "x")).toBe("'JetBrains Mono', Menlo, monospace");
  });
});

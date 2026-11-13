import { describe, expect, it } from "vitest";
import { extractHeadings } from "../components/Outline";
import { dirName, fileName, splitEol, diskText } from "../store/useDocStore";

describe("extractHeadings", () => {
  it("collects ATX headings with levels and line numbers", () => {
    const h = extractHeadings("# A\ntext\n## B ##\n### C");
    expect(h).toEqual([
      { level: 1, text: "A", line: 1 },
      { level: 2, text: "B", line: 3 },
      { level: 3, text: "C", line: 4 },
    ]);
  });
  it("ignores headings inside fenced code", () => {
    const h = extractHeadings("```\n# not\n```\n# yes");
    expect(h).toEqual([{ level: 1, text: "yes", line: 4 }]);
  });
  it("finds setext headings and skips front matter", () => {
    const h = extractHeadings("---\ntitle: x\n---\n\nTitle\n=====\n\ntext\n\nSub\n---\n\n- item\n---\n");
    expect(h).toEqual([
      { level: 1, text: "Title", line: 5 },
      { level: 2, text: "Sub", line: 10 },
    ]);
  });
  it("requires a space after the hashes", () => {
    expect(extractHeadings("#nope")).toEqual([]);
  });
});

describe("dirName / fileName", () => {
  it("handles absolute, relative and bare paths", () => {
    expect(dirName("/home/u/a.md")).toBe("/home/u");
    expect(dirName("/a.md")).toBe("/");
    expect(dirName("notes/a.md")).toBe("notes");
    expect(dirName("a.md")).toBe("");
    expect(dirName("C:\\x\\a.md")).toBe("C:\\x");
    expect(fileName("notes/a.md")).toBe("a.md");
    expect(fileName(null)).toBe("無題");
  });
});

describe("line endings", () => {
  it("keeps LF text as is", () => {
    expect(splitEol("a\nb\n")).toEqual({ text: "a\nb\n", eol: "\n" });
  });
  it("normalises CRLF in memory and restores it for disk", () => {
    const { text, eol } = splitEol("a\r\nb\r\n");
    expect(text).toBe("a\nb\n");
    expect(eol).toBe("\r\n");
    expect(diskText({ content: text + "c\n", eol })).toBe("a\r\nb\r\nc\r\n");
    expect(diskText({ content: "x\ny", eol: "\n" })).toBe("x\ny");
  });
});

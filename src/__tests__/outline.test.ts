import { describe, expect, it } from "vitest";
import { extractHeadings } from "../components/Outline";

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
  it("requires a space after the hashes", () => {
    expect(extractHeadings("#nope")).toEqual([]);
  });
});

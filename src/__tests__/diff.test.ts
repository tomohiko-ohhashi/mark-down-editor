import { describe, it, expect } from "vitest";
import { diffLines, sideBySide, changedSpan, changeStarts, firstOpenedText } from "../features/diff";

const apply = (a: string[], b: string[]) => {
  // Rebuild both sides from the edit script: it must describe exactly a -> b.
  const ops = diffLines(a, b);
  expect(ops.filter((o) => o.kind !== "add").map((o) => a[o.a])).toEqual(a);
  expect(ops.filter((o) => o.kind !== "del").map((o) => b[o.b])).toEqual(b);
  for (const o of ops) if (o.kind === "same") expect(a[o.a]).toBe(b[o.b]);
  return ops;
};

describe("diffLines", () => {
  it("handles equal, empty, pure insert and pure delete", () => {
    expect(apply(["a", "b"], ["a", "b"]).every((o) => o.kind === "same")).toBe(true);
    expect(apply([], []).length).toBe(0);
    expect(apply([], ["x", "y"]).map((o) => o.kind)).toEqual(["add", "add"]);
    expect(apply(["x", "y"], []).map((o) => o.kind)).toEqual(["del", "del"]);
  });

  it("finds a minimal script in the middle of a file", () => {
    const ops = apply(["a", "b", "c", "d", "e"], ["a", "x", "c", "e", "f"]);
    expect(ops.filter((o) => o.kind !== "same").length).toBe(4); // b->x, -d, +f
  });

  it("agrees with random edits", () => {
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let round = 0; round < 60; round++) {
      const a = Array.from({ length: rnd(30) }, () => "l" + rnd(6));
      const b = a.slice();
      for (let e = rnd(8); e > 0; e--) {
        const at = rnd(b.length + 1);
        if (rnd(2) === 0) b.splice(at, 0, "n" + rnd(6));
        else b.splice(at, 1);
      }
      apply(a, b);
    }
  });

  it("still returns a correct script when the texts are too different to align", () => {
    const a = Array.from({ length: 50 }, (_, i) => "a" + i);
    const b = Array.from({ length: 50 }, (_, i) => "b" + i);
    expect(diffLines(a, b, 10).filter((o) => o.kind === "same")).toEqual([]);
    apply(a, b);
  });
});

describe("sideBySide", () => {
  it("pairs replaced lines and keeps line numbers of both sides", () => {
    const rows = sideBySide("one\ntwo\nthree\nfour", "one\n2\nthree\nfour\nfive");
    expect(rows.map((r) => [r.kind, r.left, r.right])).toEqual([
      ["same", 1, 1],
      ["change", 2, 2],
      ["same", 3, 3],
      ["same", 4, 4],
      ["add", null, 5],
    ]);
    expect(rows[1]).toMatchObject({ leftText: "two", rightText: "2" });
  });

  it("shows extra removed lines of a block on the left only", () => {
    const rows = sideBySide("a\nb\nc\nd", "a\nX\nd");
    expect(rows.map((r) => r.kind)).toEqual(["same", "change", "del", "same"]);
  });

  it("finds where blocks of changes start", () => {
    const rows = sideBySide("a\nb\nc\nd\ne", "A\nB\nc\nd\nE");
    expect(changeStarts(rows)).toEqual([0, 4]);
    expect(changeStarts(sideBySide("x", "x"))).toEqual([]);
  });
});

describe("changedSpan", () => {
  it("narrows a change to the part that differs", () => {
    expect(changedSpan("the quick fox", "the slow fox")).toEqual([4, 9, 8]);
    expect(changedSpan("abc", "abcd")).toEqual([3, 3, 4]);
    expect(changedSpan("same", "same")).toEqual([4, 4, 4]);
  });
});

describe("firstOpenedText", () => {
  it("keeps the first text seen for a path", () => {
    expect(firstOpenedText("/t/first.md", "v1")).toBe("v1");
    expect(firstOpenedText("/t/first.md", "v2")).toBe("v1");
    expect(firstOpenedText("/t/other.md", "x")).toBe("x");
  });
});

import { describe, it, expect } from "vitest";
import { firstOpenedText } from "../features/diff";

describe("firstOpenedText", () => {
  it("keeps the first text seen for a path", () => {
    expect(firstOpenedText("/t/first.md", "v1")).toBe("v1");
    expect(firstOpenedText("/t/first.md", "v2")).toBe("v1");
    expect(firstOpenedText("/t/other.md", "x")).toBe("x");
  });
});

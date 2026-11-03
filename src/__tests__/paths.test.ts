import { describe, expect, it } from "vitest";
import { joinPath, isAbsolutePath, isExternalUrl } from "../preview/paths";

describe("paths", () => {
  it("joins posix paths resolving . and ..", () => {
    expect(joinPath("/home/u/docs", "assets/a.png")).toBe("/home/u/docs/assets/a.png");
    expect(joinPath("/home/u/docs", "../img/b.png")).toBe("/home/u/img/b.png");
    expect(joinPath("/home/u/docs", "./c.png")).toBe("/home/u/docs/c.png");
  });
  it("joins windows paths", () => {
    expect(joinPath("C:\\Users\\u\\docs", "assets\\a.png")).toBe("C:\\Users\\u\\docs\\assets\\a.png");
    expect(joinPath("C:\\Users\\u\\docs", "../b.png")).toBe("C:\\Users\\u\\b.png");
  });
  it("detects absolute paths and external urls", () => {
    expect(isAbsolutePath("/a")).toBe(true);
    expect(isAbsolutePath("D:/x")).toBe(true);
    expect(isAbsolutePath("rel/x")).toBe(false);
    expect(isExternalUrl("https://x")).toBe(true);
    expect(isExternalUrl("data:image/png;base64,xx")).toBe(true);
    expect(isExternalUrl("assets/a.png")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { joinPath, isAbsolutePath, isExternalUrl, relativePath, isImagePath } from "../preview/paths";

describe("paths", () => {
  it("joins posix paths resolving . and ..", () => {
    expect(joinPath("/home/u/docs", "assets/a.png")).toBe("/home/u/docs/assets/a.png");
    expect(joinPath("/home/u/docs", "../img/b.png")).toBe("/home/u/img/b.png");
    expect(joinPath("/home/u/docs", "./c.png")).toBe("/home/u/docs/c.png");
  });
  it("joins relative (web mode) paths from the root", () => {
    expect(joinPath("", "a.png")).toBe("a.png");
    expect(joinPath("", "assets/a.png")).toBe("assets/a.png");
    expect(joinPath("docs", "../a.png")).toBe("a.png");
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

describe("relativePath", () => {
  it("gives the path of a file as seen from a folder", () => {
    expect(relativePath("/n/docs", "/n/docs/assets/a.png")).toBe("assets/a.png");
    expect(relativePath("/n/docs/sub", "/n/img/a.png")).toBe("../../img/a.png");
    expect(relativePath("C:\\n\\docs", "C:\\n\\docs\\assets\\a b.png")).toBe("assets/a b.png");
    // web mode: paths relative to the shared folder; "" is its top
    expect(relativePath("", "assets/a.png")).toBe("assets/a.png");
    expect(relativePath("docs", "assets/a.png")).toBe("../assets/a.png");
    expect(relativePath("/n/a", "/n/a/a")).toBe("a");
  });
  it("knows image files by extension", () => {
    expect(isImagePath("x/Photo.JPG")).toBe(true);
    expect(isImagePath("x/notes.md")).toBe(false);
  });
});

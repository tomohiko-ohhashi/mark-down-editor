import { describe, it, expect, afterEach } from "vitest";
import { en } from "../i18n/en";
import { t, tError, setLanguage, resolveLanguage, format } from "../i18n";

/** The app's source files as text (everything but the tests and the dictionary itself). */
const sources = Object.entries(
  import.meta.glob<string>("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
).filter(([path]) => !path.includes("__tests__") && !path.includes("/i18n/"));

/** Every string literal passed to t() (or its alias tr()) in the source. */
function sourceKeys(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [path, text] of sources) {
    for (const m of text.matchAll(/\bt(?:r)?\(\s*("(?:[^"\\]|\\.)*")/g)) found.set(JSON.parse(m[1]) as string, path);
  }
  return found;
}

const placeholders = (s: string) => Array.from(new Set(s.match(/\{\d+\}/g) ?? [])).sort();

afterEach(() => setLanguage("ja"));

describe("English dictionary", () => {
  const keys = sourceKeys();

  it("finds the strings used in the source", () => {
    expect(keys.size).toBeGreaterThan(200);
  });

  it("has an entry for every string passed to t()", () => {
    const missing = Array.from(keys).filter(([k]) => !(k in en)).map(([k, file]) => `${k}  (${file})`);
    expect(missing).toEqual([]);
  });

  it("keeps the same placeholders in both languages", () => {
    const wrong = Object.entries(en).filter(([ja, english]) => placeholders(ja).join() !== placeholders(english).join());
    expect(wrong).toEqual([]);
  });

  it("has no empty or untranslated entries", () => {
    const jp = /[぀-ヿ一-鿿]/;
    expect(Object.entries(en).filter(([, english]) => english.trim() === "" || jp.test(english))).toEqual([]);
  });

  it("does not call t() with anything but a string literal first", () => {
    // A computed key could never be checked against the dictionary.
    const offenders: string[] = [];
    for (const [path, text] of sources) {
      for (const m of text.matchAll(/[^\w.]t\(\s*([^"\s)])/g)) offenders.push(`${path}: t(${m[1]}…`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("t", () => {
  it("returns the source text in Japanese and the dictionary text in English", () => {
    expect(t("保存")).toBe("保存");
    setLanguage("en");
    expect(t("保存")).toBe("Save");
  });

  it("fills in positional placeholders", () => {
    expect(t("{0} 行目 {1} 列", 3, 14)).toBe("3 行目 14 列");
    setLanguage("en");
    expect(t("{0} 行目 {1} 列", 3, 14)).toBe("Ln 3, Col 14");
    expect(t("「{0}」を「{1}」に変更しました", "a.md", "b.md")).toBe('Renamed "a.md" to "b.md"');
  });

  it("falls back to the source text for an unknown string", () => {
    setLanguage("en");
    expect(t("辞書にない文")).toBe("辞書にない文");
  });

  it("leaves braces that are not placeholders alone", () => {
    expect(format("a {0} b {x} {1}", ["A"])).toBe("a A b {x} {1}");
  });
});

describe("tError", () => {
  it("passes messages through in Japanese", () => {
    expect(tError("保存に失敗しました: Permission denied (os error 13)")).toBe("保存に失敗しました: Permission denied (os error 13)");
  });

  it("translates the known part of an error from the Rust side", () => {
    setLanguage("en");
    expect(tError("保存に失敗しました: Permission denied (os error 13)")).toBe("Could not save the file: Permission denied (os error 13)");
    expect(tError("同じ名前のフォルダかファイルが既にあります")).toBe("A file or folder with that name already exists");
    expect(tError(new Error("ファイルがありません"))).toBe("File not found");
    expect(tError("something else: detail")).toBe("something else: detail");
  });
});

describe("resolveLanguage", () => {
  it("uses an explicit choice as it is", () => {
    expect(resolveLanguage("ja")).toBe("ja");
    expect(resolveLanguage("en")).toBe("en");
  });
  it("follows the browser language for 'system' and for missing settings", () => {
    // jsdom reports en-US.
    expect(resolveLanguage("system")).toBe("en");
    expect(resolveLanguage(undefined)).toBe("en");
  });
});

import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import { formatMarkdown } from "../editor/format";

/**
 * The formatter may change how a document is written, never what it means.
 * These tests check that on many kinds of Markdown (with plenty of Japanese,
 * where emphasis and escaping behave differently) instead of a few happy cases.
 */
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter, ["yaml", "toml"]);
const meaning = (md: string) => JSON.stringify(parser.parse(md), (key, value: unknown) => (key === "position" ? undefined : value));

/** How many "&#x3042;"-style character codes a text has. Formatting must not add any (a document may contain some of its own). */
const characterCodes = (md: string) => (md.match(/&#x?[0-9a-f]+;/gi) ?? []).length;

const cases: Record<string, string> = {
  "jp emphasis star": "これは*強調*です。これは**太字**です。\n",
  "jp emphasis underscore": "これは _強調_ です。__太字__ です。\n",
  "jp emphasis punctuation": "「**重要**」と（*注意*）。**太字**、*斜体*。\n",
  "jp strong then particle": "**消費税**の導入と*物価*への影響\n",
  "en emphasis": "This is *emphasis* and **strong** and ***both***.\n",
  "snake case": "use snake_case_name and file_name.md and 2*3*4\n",
  "intraword star": "un*frigging*believable and a*b*c\n",
  "strikethrough": "これは~~取り消し~~です。~~done~~\n",
  "inline code": "`code` と `` a`b `` と `*not em*`\n",
  "special chars": "1+1=2, a*b, [括弧], <タグではない>, # 見出しではない\n",
  "brackets and ranges": "[要確認] あとで見る。営業時間は 9:00~18:00、約10~20人。C# と F#。\n",
  "line start markers": "+ plus item\n\n1) paren list\n2) second\n",
  "escapes the author needs": "\\*not em\\* and \\# not heading and \\[x\\] and 100\\%\n\n\\# 行頭のシャープ\n\n\\- 行頭のハイフン\n\n1\\. 番号ではない\n",
  "hard break spaces": "一行目  \n二行目\n",
  "hard break backslash": "一行目\\\n二行目\n",
  "soft break": "一行目\n二行目\n三行目\n",
  headings: "Title\n=====\n\nSub\n---\n\n### h3 ###\n\n#### 日本語の見出し\n",
  "nested list": "- a\n  - b\n    - c\n- d\n\n1. one\n   - x\n   - y\n2. two\n",
  "loose list": "- a\n\n- b\n\n  続きの段落\n\n- c\n",
  "task list": "- [ ] 未完了\n- [x] 完了\n  - [ ] 子\n",
  "ordered start": "3. three\n4. four\n10. ten\n",
  blockquote: "> 引用\n> 続き [メモ] と 1~2\n>\n> - リスト\n>\n> > 入れ子\n",
  "code fence": "```js\nconst a = '*x*';\n```\n\n~~~\ntilde\n~~~\n\n    indented code\n",
  "code fence with backticks": "````md\n```js\nx\n```\n````\n",
  table: "| 名前 | 値 |\n|:--|--:|\n| `a` | 1 |\n| **太字** | あ\\|い |\n| [メモ] | 1~2 |\n",
  "table inline": "|a|b|\n|-|-|\n|[link](https://e.com)|*em*|\n",
  links: "[名前](https://example.com \"タイトル\") と [ref][r] と ![画像](a b.png) と ![alt](<a b.png>)\n\n[r]: https://example.com/ref \"T\"\n",
  "link with parens": "[wiki](https://ja.wikipedia.org/wiki/消費税_(日本)) と [x](a%20b.md)\n",
  "bare urls": "https://example.com/a_b と www.example.com と a@b.com\n",
  footnote: "本文[^1]と[^note]。\n\n[^1]: 注一。\n[^note]: 注二\n    続き\n",
  html: "<div align=\"center\">\n  <b>html</b>\n</div>\n\n<!-- コメント -->\n\ntext <kbd>Ctrl</kbd> text <br> x\n",
  math: "インライン $a_1 + b_2$ と\n\n$$\n\\int_0^1 x^2 dx\n$$\n",
  "front matter": "---\ntitle: テスト\ntags: [a, b]\n---\n\n# 本文\n",
  hr: "a\n\n***\n\n___\n\n---\n\nb\n",
  mermaid: "```mermaid\ngraph LR\n  A --> B\n```\n",
  "long jp paragraph": "消費税の歴史（アメリカの要求はあったか）から、今の財政と物価、消費税を下げるならどうするか、までの議論の整理。\n（作成日: 2026-10-28。売買・投票をすすめるものではなく、考えの整理）\n",
  "numbers and dashes": "2026-10-28 - 2026-11-13 と 1. で始まらない 1.5 倍\n\n- 1. 入れ子の番号\n",
  "emoji and symbols": "✅ 完了 → 次へ ※注意 ①②③ ～ 〜 ・ …\n",
  "trailing spaces and blank lines": "a   \n\n\n\nb\t\n",
  "image link": "[![alt](a.png)](https://e.com)\n",
  "autolink in emphasis": "**https://example.com** と *www.example.com*\n",
  "tilde and caret": "H~2~O と x^2^ と ~単独\n",
  "pipes outside table": "a | b | c\n",
  "heading with trailing #": "# C# と F#\n\n## a # b\n",
  "list with code": "1. 手順\n\n   ```bash\n   echo hi\n   ```\n\n2. 次\n",
  crlf: "a\r\n\r\n- b\r\n- c\r\n",
};

// Real, long documents with a lot of Japanese: the ones this project is described in.
const documents = import.meta.glob<string>(["../../README.md", "../../CLAUDE.md", "../../docs/*.md"], { query: "?raw", import: "default", eager: true });

describe("formatMarkdown keeps the meaning", () => {
  for (const [name, source] of Object.entries(cases)) {
    it(name, async () => {
      const src = source.replace(/\r\n?/g, "\n");
      const out = await formatMarkdown(source);
      expect(meaning(out), "the document means something else after formatting").toBe(meaning(src));
      expect(await formatMarkdown(out), "formatting twice gives a different text").toBe(out);
      expect(characterCodes(out), "character codes in place of letters").toBe(characterCodes(src));
    });
  }

  it("this project's own documents", async () => {
    expect(Object.keys(documents).length).toBeGreaterThanOrEqual(4);
    for (const [file, text] of Object.entries(documents)) {
      const src = text.replace(/\r\n?/g, "\n");
      const out = await formatMarkdown(src);
      expect(meaning(out), file).toBe(meaning(src));
      expect(await formatMarkdown(out), file).toBe(out);
      expect(characterCodes(out), file).toBe(characterCodes(src));
    }
  }, 60000);
});

describe("formatMarkdown does not add markup the author did not write", () => {
  it("no backslashes before brackets, tildes, sharps or parentheses that are plain text", async () => {
    const src = "[要確認] あとで見る。営業時間は 9:00~18:00。C# と F#。\n\n約10~20人 (1 つの段落に ~ が 1 つ)\n\n# C# と F#\n\n[wiki](https://ja.wikipedia.org/wiki/消費税_(日本))\n";
    expect(await formatMarkdown(src)).toBe(src);
  });
  it("keeps the backslashes that are needed", async () => {
    const src = "\\*強調ではない\\* と \\# 見出しではない\n\n\\# 行頭のシャープ\n\n\\- 行頭のハイフン\n";
    const out = await formatMarkdown(src);
    // The first one is needed (without it the two stars would be emphasis); the second is not.
    expect(out).toContain("\\*強調ではない*");
    expect(out).toContain("\n\\# 行頭のシャープ\n");
    expect(out).toContain("\n\\- 行頭のハイフン\n");
  });
  it("emphasis in Japanese text stays readable", async () => {
    expect(await formatMarkdown("これは*強調*です。**消費税**の導入と*物価*への影響\n")).toBe("これは*強調*です。**消費税**の導入と*物価*への影響\n");
    expect(await formatMarkdown("これは _強調_ です。__太字__ です。\n")).toBe("これは *強調* です。**太字** です。\n");
  });
  it("tables stay lined up when a cell has brackets, a tilde or full-width text", async () => {
    const out = await formatMarkdown("| 名前 | 値 |\n|:--|--:|\n| `a` | 1 |\n| **太字** | あ\\|い |\n| [メモ] | 1~2 |\n");
    expect(out).toBe("| 名前     |     値 |\n| :------- | -----: |\n| `a`      |      1 |\n| **太字** | あ\\|い |\n| [メモ]   |    1~2 |\n");
  });
  it("keeps the way a line break was written", async () => {
    expect(await formatMarkdown("一行目  \n二行目\n")).toBe("一行目  \n二行目\n");
    expect(await formatMarkdown("一行目\\\n二行目\n")).toBe("一行目\\\n二行目\n");
  });
});

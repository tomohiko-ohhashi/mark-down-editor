import { expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import { formatMarkdown } from "../editor/format";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter, ["yaml", "toml"]);
const meaning = (md: string) => JSON.stringify(parser.parse(md), (k, v: unknown) => (k === "position" ? undefined : v));
const refs = (md: string) => (md.match(/&#x?[0-9a-f]+;/gi) ?? []).length;

const inline = [
  "文", "word", "*強調*", "_強調_", "**太字**", "__太字__", "***両方***", "_**両方**_", "**_両方_**", "*_入れ子_*", "_*入れ子*_", "*a**b**c*", "**a*b*c**", "*a* *b*", "**a****b**",
  "`code`", "`` a`b ``", "~~取消~~", "~取消~", "[リンク](https://e.com)", "[リンク](https://e.com \"題\")", "[参照][r]", "![画像](a.png)", "https://example.com/a_b", "www.example.com",
  "<https://e.com>", "a@b.com", "$x_1$", "<kbd>K</kbd>", "<br>", "脚注[^1]", "\\*エスケープ\\*", "[括弧]", "(かっこ)", "a_b_c", "2*3*4", "C#", "9:00~18:00", "「**重要**」", "**「重要」**",
  "*強調*と", "と*強調*", "**太字**。", "、**太字**", "a*b", "a_b", "a~b", "!", "#タグ", "+1", "-1", "1.", "|", "&amp;", "&", "<", ">", "\"引用\"", "😀", "　", "  ", "\\",
];
const joiners = ["", " ", "、", "と", "\n", "  \n", "\\\n"];
const blocks = [
  (t: string) => t,
  (t: string) => `# ${t.replace(/\n/g, " ")}`,
  (t: string) => `### ${t.replace(/\n/g, " ")} ###`,
  (t: string) => `- ${t.replace(/\n/g, "\n  ")}`,
  (t: string) => `* ${t.replace(/\n/g, "\n  ")}\n* 二つ目`,
  (t: string) => `1. ${t.replace(/\n/g, "\n   ")}\n1. 次`,
  (t: string) => `- [ ] ${t.replace(/\n/g, "\n  ")}`,
  (t: string) => `> ${t.replace(/\n/g, "\n> ")}`,
  (t: string) => `> - ${t.replace(/\n/g, "\n>   ")}`,
  (t: string) => `- a\n  - ${t.replace(/\n/g, "\n    ")}\n    - c`,
  (t: string) => `| 列 | 値 |\n| --- | --- |\n| ${t.replace(/\n|\|/g, " ")} | 1 |`,
  (t: string) => `- 表\n\n  | 列 |\n  | --- |\n  | ${t.replace(/\n|\|/g, " ")} |`,
  (t: string) => `> | 列 |\n> | --- |\n> | ${t.replace(/\n|\|/g, " ")} |`,
  (t: string) => `${t}\n\n[r]: https://e.com/ref\n\n[^1]: 注 ${t.replace(/\n/g, " ")}`,
  (t: string) => `Title ${t.replace(/\n/g, " ")}\n===`,
  (t: string) => `<div>\n\n${t}\n\n</div>`,
];

// A small deterministic random generator, so a failure can be reproduced.
let seed = 987654321;
const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };

/**
 * Thousands of small documents put together at random from pieces that are
 * known to be awkward (emphasis next to Japanese text and to punctuation,
 * nested emphasis, bare URLs, line breaks, tables inside lists and quotes ...).
 * For each: formatting keeps the meaning, is stable when repeated, and adds no
 * character codes. Run with 40,000 documents when the formatter is changed.
 */
it("formatMarkdown on generated documents", async () => {
  const problems: string[] = [];
  let count = 0;
  for (let i = 0; i < 4000; i++) {
    const parts = 1 + rnd(4);
    let t = "";
    for (let p = 0; p < parts; p++) t += (p ? joiners[rnd(joiners.length)] : "") + inline[rnd(inline.length)];
    const nBlocks = 1 + rnd(2);
    let src = "";
    for (let b = 0; b < nBlocks; b++) src += (b ? "\n\n" : "") + blocks[rnd(blocks.length)](b ? inline[rnd(inline.length)] + joiners[rnd(3)] + inline[rnd(inline.length)] : t);
    src += "\n";
    count++;
    let out: string;
    try {
      out = await formatMarkdown(src);
    } catch (e) {
      problems.push(`THROWS ${JSON.stringify(src)} ${String(e).slice(0, 80)}`);
      continue;
    }
    const kinds: string[] = [];
    if (meaning(out) !== meaning(src)) kinds.push("MEANING");
    if ((await formatMarkdown(out)) !== out) kinds.push("UNSTABLE");
    if (refs(out) > refs(src)) kinds.push("CHARREF");
    if (kinds.length) problems.push(`${kinds.join("+")} IN ${JSON.stringify(src)} OUT ${JSON.stringify(out)}`);
  }
  expect(problems.slice(0, 20), `${problems.length} of ${count} generated documents`).toEqual([]);
}, 120000);

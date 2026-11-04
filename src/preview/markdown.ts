import { unified, type Plugin } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";
import { platform } from "../platform";
import { isAbsolutePath, isExternalUrl, joinPath } from "./paths";

// Allow the class names rehype-highlight / remark-math emit, GFM task-list
// checkboxes, and heading ids used by the outline.
const schema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^(hljs|language-|math-).*/]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", /^(hljs-|math).*/]],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", /^math.*/]],
    input: [...(defaultSchema.attributes?.input ?? []), "checked", "disabled", ["type", "checkbox"]],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), "input"],
};

export interface RenderOptions {
  /** Directory of the document; relative image paths are resolved against it and
   *  converted to Tauri asset URLs so they display in the preview. */
  docDir?: string | null;
  /** Render ```mermaid blocks to inline SVG (requires a DOM). */
  mermaid?: boolean;
  dark?: boolean;
}

/** Rewrite relative <img src> to asset URLs the webview can load. */
const rehypeLocalImages: Plugin<[{ docDir: string | null | undefined }], Root> = function (
  this: unknown,
  { docDir },
) {
  return (tree: Root) => {
    if (docDir == null) return;
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const src = node.properties?.src;
      if (typeof src !== "string" || isExternalUrl(src)) return;
      let decoded = src;
      try {
        decoded = decodeURIComponent(src);
      } catch {
        /* keep the raw path for inputs like "100%.png" */
      }
      const abs = isAbsolutePath(decoded) ? decoded : joinPath(docDir, decoded);
      node.properties.src = platform.assetUrl(abs);
    });
  };
};

function buildProcessor(docDir: string | null | undefined) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeSanitize, schema)
    .use(rehypeKatex, { throwOnError: false, strict: false })
    .use(rehypeHighlight, { detect: false, plainText: ["mermaid", "math", "txt", "text"] })
    .use(rehypeLocalImages, { docDir })
    .use(rehypeStringify);
}

let mermaidInit: Promise<typeof import("mermaid").default> | null = null;
let mermaidDark: boolean | null = null;

async function getMermaid(dark: boolean) {
  if (!mermaidInit) mermaidInit = import("mermaid").then((m) => m.default);
  const mermaid = await mermaidInit;
  if (mermaidDark !== dark) {
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? "dark" : "default",
      securityLevel: "strict",
      fontFamily: "inherit",
    });
    mermaidDark = dark;
  }
  return mermaid;
}

let mermaidSeq = 0;

/** Replace ```mermaid code blocks in an HTML string with rendered SVG. */
async function renderMermaidBlocks(html: string, dark: boolean): Promise<string> {
  if (!html.includes("language-mermaid")) return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const blocks = tpl.content.querySelectorAll("pre > code.language-mermaid");
  if (blocks.length === 0) return html;
  const mermaid = await getMermaid(dark);
  for (const code of Array.from(blocks)) {
    const pre = code.parentElement!;
    const source = code.textContent ?? "";
    const wrapper = document.createElement("div");
    wrapper.className = "mermaid-diagram";
    try {
      const { svg } = await mermaid.render(`mermaid-${mermaidSeq++}`, source);
      wrapper.innerHTML = svg;
    } catch (e) {
      wrapper.className = "mermaid-error";
      wrapper.textContent = `Mermaid: ${e instanceof Error ? e.message : String(e)}`;
      // mermaid leaves an error element behind in the body on failure; remove it.
      document.querySelectorAll('[id^="dmermaid-"]').forEach((n) => n.remove());
    }
    pre.replaceWith(wrapper);
  }
  return tpl.innerHTML;
}

export async function renderMarkdown(src: string, opts: RenderOptions = {}): Promise<string> {
  const file = await buildProcessor(opts.docDir).process(src);
  let html = String(file);
  if (opts.mermaid) html = await renderMermaidBlocks(html, opts.dark ?? false);
  return html;
}

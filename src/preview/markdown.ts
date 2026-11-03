import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

// Allow the class names rehype-highlight emits and GFM task-list checkboxes.
const schema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^(hljs|language-).*/]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", /^hljs-.*/]],
    input: [...(defaultSchema.attributes?.input ?? []), "checked", "disabled", ["type", "checkbox"]],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), "input"],
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeHighlight, { detect: false, ignoreMissing: true })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

export async function renderMarkdown(src: string): Promise<string> {
  const file = await processor.process(src);
  return String(file);
}

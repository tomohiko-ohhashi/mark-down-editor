/**
 * Page header / footer for printing (PDF export).
 *
 * Browsers add their own header and footer: date, page title, URL and page
 * number. We only want file name, time and page number, so on Chromium
 * (WebView2 on Windows, Chrome / Edge in web mode) the page defines its own
 * margin boxes. Chromium leaves out its default header when the page has
 * boxes in the top margin, and its default footer (with the URL) when it has
 * boxes in the bottom margin. Other engines have no margin boxes; there only
 * the page title is changed to the bare file name while printing.
 */

/** A CSS string literal for arbitrary text (file names can contain quotes and backslashes). */
export function cssString(text: string): string {
  let out = '"';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '"' || ch === "\\") out += "\\" + ch;
    // Control characters (a newline would end the string) as hex escapes; the space ends the escape.
    else if (code < 0x20 || code === 0x7f) out += "\\" + code.toString(16) + " ";
    else out += ch;
  }
  return out + '"';
}

/** @page rule: file name top-left, time top-right, "page / pages" bottom-right. */
export function printPageCss(name: string, when: string): string {
  const box = "font: 8pt system-ui, sans-serif; color: #57606a;";
  return `@page {
  margin: 16mm 14mm 16mm;
  @top-left { content: ${cssString(name)}; ${box} }
  @top-right { content: ${cssString(when)}; ${box} }
  @bottom-right { content: counter(page) " / " counter(pages); ${box} }
}`;
}

/** Margin boxes exist since Chromium 131. */
export function supportsMarginBoxes(userAgent: string): boolean {
  const m = userAgent.match(/Chrom(?:e|ium)\/(\d+)/);
  return !!m && Number(m[1]) >= 131;
}

const STYLE_ID = "print-page-style";
let titleBefore: string | null = null;
let printTitle: string | null = null;

/** Set up the document for printing `name`. Safe to call twice; undo with endPrint(). */
export function beginPrint(name: string, now = new Date()): void {
  if (titleBefore == null) titleBefore = document.title;
  // Engines without margin boxes print the page title in their own header.
  document.title = name;
  printTitle = name;
  if (!supportsMarginBoxes(navigator.userAgent)) return;
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(now);
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = printPageCss(name, when);
}

export function endPrint(): void {
  // Put the title back, unless something else (a tab switch) retitled the window meanwhile.
  if (titleBefore != null && document.title === printTitle) document.title = titleBefore;
  titleBefore = null;
  printTitle = null;
  document.getElementById(STYLE_ID)?.remove();
}

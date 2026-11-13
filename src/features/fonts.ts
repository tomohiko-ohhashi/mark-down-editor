import { platform } from "../platform";
import type { FontInfo } from "../platform/types";

/** The stacks behind the default fonts; a chosen font is put in front of them. */
export const MONO_FALLBACK =
  'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", "Noto Sans Mono CJK JP", monospace';
export const SANS_FALLBACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif';

/**
 * CSS font-family value for a font setting. A name picked from the list is
 * quoted and followed by the fallback stack (for characters the font lacks).
 * A value that already is a CSS list (typed by hand in an older version) is
 * used as it is. Returns null for "default".
 */
export function fontFamilyCss(value: string, fallback: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/[,"']/.test(v)) return v;
  return `"${v.replace(/\\/g, "\\\\")}", ${fallback}`;
}

/** Fonts worth offering where the installed fonts cannot be listed (browsers). */
const CANDIDATES: [name: string, monospace: boolean][] = [
  ["BIZ UDGothic", true], ["Cascadia Code", true], ["Cascadia Mono", true], ["Consolas", true],
  ["Courier New", true], ["DejaVu Sans Mono", true], ["Fira Code", true], ["Hack", true],
  ["HackGen", true], ["IBM Plex Mono", true], ["Inconsolata", true], ["JetBrains Mono", true],
  ["Liberation Mono", true], ["Lucida Console", true], ["Menlo", true], ["Monaco", true],
  ["MS Gothic", true], ["Noto Sans Mono", true], ["Noto Sans Mono CJK JP", true], ["Osaka-Mono", true],
  ["PlemolJP", true], ["Ricty Diminished", true], ["Roboto Mono", true], ["SF Mono", true],
  ["Source Code Pro", true], ["Source Han Code JP", true], ["UDEV Gothic", true], ["Ubuntu Mono", true],
  ["Arial", false], ["BIZ UDPGothic", false], ["DejaVu Sans", false], ["DejaVu Serif", false],
  ["Georgia", false], ["Helvetica", false], ["Helvetica Neue", false], ["Hiragino Kaku Gothic ProN", false],
  ["Hiragino Maru Gothic ProN", false], ["Hiragino Mincho ProN", false], ["Hiragino Sans", false],
  ["Inter", false], ["Liberation Sans", false], ["Meiryo", false], ["MS Mincho", false],
  ["MS PGothic", false], ["Noto Sans CJK JP", false], ["Noto Sans JP", false], ["Noto Serif CJK JP", false],
  ["Noto Serif JP", false], ["Roboto", false], ["Segoe UI", false], ["Times New Roman", false],
  ["Ubuntu", false], ["Verdana", false], ["Yu Gothic", false], ["Yu Gothic UI", false], ["Yu Mincho", false],
];

/**
 * Which of the candidate fonts this device has. A font is present when text
 * set in it measures differently from the generic fallback behind it; three
 * fallbacks are tried because the font may itself be one of the defaults.
 */
export function detectFonts(): FontInfo[] {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return [];
  const sample = "mmmmmmmmmmlli 0O あいう漢字";
  const generics = ["monospace", "sans-serif", "serif"];
  const width = (family: string) => {
    ctx.font = `72px ${family}`;
    return ctx.measureText(sample).width;
  };
  const base = generics.map(width);
  return CANDIDATES.filter(([name]) => generics.some((g, i) => width(`"${name}", ${g}`) !== base[i])).map(
    ([name, monospace]) => ({ name, label: name, monospace }),
  );
}

let cache: Promise<FontInfo[]> | null = null;

/** Fonts to offer in the settings (looked up once per run). */
export function availableFonts(): Promise<FontInfo[]> {
  cache ??= platform.listFonts().then(
    (list) => (list.length > 0 ? list : detectFonts()),
    () => detectFonts(),
  );
  return cache;
}

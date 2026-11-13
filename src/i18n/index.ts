import { en } from "./en";

/**
 * UI language. The Japanese text is the source: `t("保存")` returns it
 * unchanged in Japanese and looks it up in the English dictionary otherwise
 * (falling back to the Japanese text if an entry is missing). Placeholders
 * are positional: `t("{0} 行目", line)`.
 *
 * Call `t` while rendering or handling an event, never at module level: a
 * module-level call would freeze the language the app happened to start in.
 */
export type Lang = "ja" | "en";
export type LanguageSetting = "system" | Lang;

let current: Lang = "ja";

/** The language of the OS / browser: Japanese if it is preferred there, otherwise English. */
export function detectLanguage(): Lang {
  const prefs = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  return (prefs[0] ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function resolveLanguage(setting: LanguageSetting | undefined): Lang {
  return setting === "ja" || setting === "en" ? setting : detectLanguage();
}

export function setLanguage(lang: Lang): void {
  current = lang;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export function getLanguage(): Lang {
  return current;
}

export function format(text: string, args: readonly (string | number)[]): string {
  return args.length === 0 ? text : text.replace(/\{(\d+)\}/g, (m, i) => (i in args ? String(args[Number(i)]) : m));
}

export function t(text: string, ...args: (string | number)[]): string {
  return format(current === "en" ? (en[text] ?? text) : text, args);
}

/**
 * Error messages from the Rust side arrive as Japanese text, usually
 * "<what failed>: <detail from the OS>". Translate the part we know.
 */
export function tError(error: unknown): string {
  const text = String(error).replace(/^Error: /, "");
  if (current === "ja") return text;
  if (en[text]) return en[text];
  const cut = text.indexOf(": ");
  if (cut > 0 && en[text.slice(0, cut)]) return en[text.slice(0, cut)] + text.slice(cut);
  return text;
}

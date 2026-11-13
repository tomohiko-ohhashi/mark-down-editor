import { fileName, dirName } from "../../store/useDocStore";

/**
 * Labels for the tabs: the file name, plus the folder for files that share
 * their name with another open file ("README.md — docs").
 */
export function tabLabels(paths: (string | null)[]): string[] {
  const names = paths.map((p) => fileName(p));
  const count = new Map<string, number>();
  paths.forEach((p, i) => {
    if (p) count.set(names[i], (count.get(names[i]) ?? 0) + 1);
  });
  return paths.map((p, i) => {
    if (!p || (count.get(names[i]) ?? 0) < 2) return names[i];
    const dir = dirName(p);
    // "" is the top folder of a web-mode workspace.
    const folder = dir ? fileName(dir) || dir : "/";
    return `${names[i]} — ${folder}`;
  });
}

/**
 * A file name to propose when a new document is saved for the first time:
 * its first heading (or first line of text), made safe for every OS.
 */
export function suggestFileName(content: string): string {
  let inFrontMatter = false;
  let title = "";
  const lines = content.split("\n");
  for (let i = 0; i < lines.length && i < 200; i++) {
    const line = lines[i].trim();
    if (i === 0 && line === "---") {
      inFrontMatter = true;
      continue;
    }
    if (inFrontMatter) {
      if (line === "---" || line === "...") inFrontMatter = false;
      continue;
    }
    if (!line) continue;
    title = line;
    break;
  }
  const name = title
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+#+$/, "")
    // Markdown markup and characters that are not allowed in file names (Windows is the strictest).
    .replace(/[*_`~[\]<>:"/\\|?!]/g, " ")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 60)
    .trim()
    .replace(/\.+$/, "");
  return `${name || "untitled"}.md`;
}

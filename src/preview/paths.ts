/** Minimal path helpers that work for both POSIX and Windows paths without Node. */

export function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

export function isExternalUrl(src: string): boolean {
  return /^(https?:|data:|blob:|asset:|file:|\/\/|http:\/\/asset\.localhost)/i.test(src);
}

/** Join a directory and a relative path, resolving "." and ".." segments. */
export function joinPath(dir: string, rel: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  const parts = dir === "" ? [] : dir.split(/[\\/]/);
  const leadingSlash = dir.startsWith("/");
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length > (leadingSlash ? 1 : 0)) parts.pop();
      continue;
    }
    parts.push(seg);
  }
  const joined = parts.join(sep);
  return leadingSlash && !joined.startsWith("/") ? "/" + joined : joined;
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/** True for the image files the workspace tree lists next to the documents. */
export function isImagePath(path: string): boolean {
  return IMAGE.test(path);
}

/** Path of `target` as seen from the folder `fromDir` (both absolute, or both relative to the same root), with "/" separators. */
export function relativePath(fromDir: string, target: string): string {
  const split = (p: string) => p.split(/[\\/]/).filter((seg) => seg !== "");
  const from = split(fromDir);
  const to = split(target);
  // Another Windows drive cannot be reached with "..": give the full path.
  const drive = /^[a-zA-Z]:$/;
  if (from.length > 0 && to.length > 0 && (drive.test(from[0]) || drive.test(to[0])) && from[0].toLowerCase() !== to[0].toLowerCase()) {
    return to.join("/");
  }
  let common = 0;
  while (common < from.length && common < to.length - 1 && (from[common] === to[common] || (common === 0 && drive.test(from[0]) && from[0].toLowerCase() === to[0].toLowerCase()))) common++;
  return [...Array(from.length - common).fill(".."), ...to.slice(common)].join("/");
}

/**
 * A path as the destination of a Markdown link or image. Only the characters
 * that would end or break the destination are escaped, so names in Japanese
 * stay readable in the source (the preview decodes "%20" and friends).
 */
export function linkPath(path: string): string {
  return path.replace(/[ \t()<>%]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

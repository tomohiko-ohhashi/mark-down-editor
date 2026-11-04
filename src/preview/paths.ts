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

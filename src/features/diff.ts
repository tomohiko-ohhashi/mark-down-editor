/**
 * Line diff for the "changes" view: the current text against what the file
 * looked like when it was first opened in this run of the app, or against
 * what is saved on disk.
 */

/** Text of each file as it was when first opened since the app started (kept even if the tab is closed). */
const firstOpened = new Map<string, string>();

/** Remember `content` as the first-opened text of `path` unless one is already known; returns the remembered text. */
export function firstOpenedText(path: string, content: string): string {
  const known = firstOpened.get(path);
  if (known != null) return known;
  firstOpened.set(path, content);
  return content;
}

export type Op = { kind: "same" | "del" | "add"; a: number; b: number };

/**
 * Shortest edit script between two lists of lines (Myers' algorithm).
 * `a` / `b` in the result are 0-based indexes into the old / new list.
 * Very large differences fall back to "everything in between was replaced".
 */
export function diffLines(oldLines: readonly string[], newLines: readonly string[], maxEdits = 4000): Op[] {
  // Equal head and tail are cheap to take off and are most of a typical file.
  let head = 0;
  while (head < oldLines.length && head < newLines.length && oldLines[head] === newLines[head]) head++;
  let tail = 0;
  while (tail < oldLines.length - head && tail < newLines.length - head && oldLines[oldLines.length - 1 - tail] === newLines[newLines.length - 1 - tail]) tail++;
  const a = oldLines.slice(head, oldLines.length - tail);
  const b = newLines.slice(head, newLines.length - tail);

  const ops: Op[] = [];
  for (let i = 0; i < head; i++) ops.push({ kind: "same", a: i, b: i });
  for (const op of middle(a, b, maxEdits)) ops.push({ kind: op.kind, a: op.a + head, b: op.b + head });
  for (let i = 0; i < tail; i++) ops.push({ kind: "same", a: oldLines.length - tail + i, b: newLines.length - tail + i });
  return ops;
}

function middle(a: readonly string[], b: readonly string[], maxEdits: number): Op[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((_, j) => ({ kind: "add" as const, a: 0, b: j }));
  if (m === 0) return a.map((_, i) => ({ kind: "del" as const, a: i, b: 0 }));

  const max = Math.min(n + m, maxEdits);
  const offset = max;
  let v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice());
    const next = v.slice();
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      next[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    v = next;
  }
  if (found < 0) {
    // Too different to be worth aligning: the whole block was replaced.
    return [...a.map((_, i) => ({ kind: "del" as const, a: i, b: 0 })), ...b.map((_, j) => ({ kind: "add" as const, a: n, b: j }))];
  }

  // Walk back through the recorded rounds to recover the path.
  const out: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const k = x - y;
    const down = k === -d || (k !== d && prev[offset + k - 1] < prev[offset + k + 1]);
    const prevK = down ? k + 1 : k - 1;
    const prevX = prev[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      out.push({ kind: "same", a: x, b: y });
    }
    if (down) {
      y--;
      out.push({ kind: "add", a: x, b: y });
    } else {
      x--;
      out.push({ kind: "del", a: x, b: y });
    }
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    out.push({ kind: "same", a: x, b: y });
  }
  return out.reverse();
}

export interface DiffRow {
  kind: "same" | "del" | "add" | "change";
  /** 1-based line numbers; null where that side has no line. */
  left: number | null;
  right: number | null;
  leftText: string;
  rightText: string;
}

/** Rows for a side-by-side view: removed and added lines that follow each other are paired as "changed". */
export function sideBySide(oldText: string, newText: string): DiffRow[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const ops = diffLines(a, b);
  const rows: DiffRow[] = [];
  for (let i = 0; i < ops.length; ) {
    if (ops[i].kind === "same") {
      rows.push({ kind: "same", left: ops[i].a + 1, right: ops[i].b + 1, leftText: a[ops[i].a], rightText: b[ops[i].b] });
      i++;
      continue;
    }
    const dels: number[] = [];
    const adds: number[] = [];
    for (; i < ops.length && ops[i].kind !== "same"; i++) (ops[i].kind === "del" ? dels : adds).push(ops[i].kind === "del" ? ops[i].a : ops[i].b);
    for (let j = 0; j < Math.max(dels.length, adds.length); j++) {
      const l = dels[j];
      const r = adds[j];
      rows.push({
        kind: l != null && r != null ? "change" : l != null ? "del" : "add",
        left: l != null ? l + 1 : null,
        right: r != null ? r + 1 : null,
        leftText: l != null ? a[l] : "",
        rightText: r != null ? b[r] : "",
      });
    }
  }
  return rows;
}

/** The part of two changed lines that differs: [start, end of old, end of new] after the common prefix and suffix. */
export function changedSpan(oldLine: string, newLine: string): [number, number, number] {
  let start = 0;
  while (start < oldLine.length && start < newLine.length && oldLine[start] === newLine[start]) start++;
  let endOld = oldLine.length;
  let endNew = newLine.length;
  while (endOld > start && endNew > start && oldLine[endOld - 1] === newLine[endNew - 1]) {
    endOld--;
    endNew--;
  }
  return [start, endOld, endNew];
}

/** Row indexes where a block of changes starts (for "next / previous change"). */
export function changeStarts(rows: readonly DiffRow[]): number[] {
  const starts: number[] = [];
  rows.forEach((r, i) => {
    if (r.kind !== "same" && (i === 0 || rows[i - 1].kind === "same")) starts.push(i);
  });
  return starts;
}

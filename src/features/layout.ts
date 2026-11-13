/**
 * Widths of the panels around the editor, changed by dragging the dividers
 * between them. Side panels are in pixels; `split` is the share of the
 * editor + preview area the editor takes (0..1), and `diff` the share the
 * left (old) side takes in the changes view.
 */
export type PanelKey = "sidebar" | "outline" | "cheatSheet" | "split" | "diff";
export type PanelSizes = Record<PanelKey, number>;

export const DEFAULT_PANEL_SIZES: PanelSizes = { sidebar: 240, outline: 240, cheatSheet: 300, split: 0.5, diff: 0.5 };

/** Sizes that are a share of the available width rather than pixels. */
export const isRatio = (key: PanelKey) => key === "split" || key === "diff";

const LIMITS: Record<PanelKey, [number, number]> = {
  sidebar: [150, 640],
  outline: [150, 640],
  cheatSheet: [200, 640],
  split: [0.15, 0.85],
  diff: [0.15, 0.85],
};

/** One arrow-key press on a divider. */
export const PANEL_STEP: Record<PanelKey, number> = { sidebar: 16, outline: 16, cheatSheet: 16, split: 0.02, diff: 0.02 };

const CSS_VAR: Record<PanelKey, string> = {
  sidebar: "--sidebar-w",
  outline: "--outline-w",
  cheatSheet: "--cheatsheet-w",
  split: "--split",
  diff: "--diff-split",
};

/** Keep a size within what still leaves the panel (and its neighbours) usable. */
export function clampPanelSize(key: PanelKey, value: number): number {
  const [min, max] = LIMITS[key];
  if (!Number.isFinite(value)) return DEFAULT_PANEL_SIZES[key];
  const clamped = Math.max(min, Math.min(max, value));
  return isRatio(key) ? Math.round(clamped * 1000) / 1000 : Math.round(clamped);
}

/** Make stored sizes safe to use: they may be missing, from an older version, or hand-edited. */
export function normalizePanelSizes(raw: unknown): PanelSizes {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_PANEL_SIZES };
  for (const key of Object.keys(out) as PanelKey[]) {
    if (typeof r[key] === "number") out[key] = clampPanelSize(key, r[key] as number);
  }
  return out;
}

/** The CSS custom property a size is applied through, and its value. */
export function panelCssVar(key: PanelKey, size: number): [string, string] {
  // `diff` is used as a flex-grow factor, which takes a plain number.
  return [CSS_VAR[key], key === "split" ? `${size * 100}%` : key === "diff" ? String(size) : `${size}px`];
}

/** All sizes as CSS custom properties, for the element that holds the panels. */
export function panelCssVars(sizes: PanelSizes): Record<string, string> {
  return Object.fromEntries((Object.keys(sizes) as PanelKey[]).map((key) => panelCssVar(key, sizes[key])));
}

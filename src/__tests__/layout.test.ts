import { describe, it, expect } from "vitest";
import { DEFAULT_PANEL_SIZES, clampPanelSize, normalizePanelSizes, panelCssVars } from "../features/layout";

describe("panel sizes", () => {
  it("keeps sizes within usable limits", () => {
    expect(clampPanelSize("sidebar", 10)).toBe(150);
    expect(clampPanelSize("sidebar", 5000)).toBe(640);
    expect(clampPanelSize("sidebar", 300.4)).toBe(300);
    expect(clampPanelSize("split", 0)).toBe(0.15);
    expect(clampPanelSize("split", 1)).toBe(0.85);
    expect(clampPanelSize("split", 0.33333)).toBe(0.333);
    expect(clampPanelSize("outline", NaN)).toBe(DEFAULT_PANEL_SIZES.outline);
  });

  it("falls back to the defaults for missing or broken stored values", () => {
    expect(normalizePanelSizes(undefined)).toEqual(DEFAULT_PANEL_SIZES);
    expect(normalizePanelSizes("x")).toEqual(DEFAULT_PANEL_SIZES);
    expect(normalizePanelSizes({ sidebar: 320, split: "wide", cheatSheet: 99999 })).toEqual({
      ...DEFAULT_PANEL_SIZES,
      sidebar: 320,
      cheatSheet: 640,
    });
  });

  it("turns sizes into CSS variables", () => {
    expect(panelCssVars({ sidebar: 200, outline: 250, cheatSheet: 300, split: 0.4, diff: 0.3 })).toEqual({
      "--sidebar-w": "200px",
      "--outline-w": "250px",
      "--cheatsheet-w": "300px",
      "--split": "40%",
      "--diff-split": "0.3",
    });
  });
});

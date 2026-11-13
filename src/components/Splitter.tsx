import { useRef, useState } from "react";
import { useSettings } from "../store/useSettings";
import { DEFAULT_PANEL_SIZES, PANEL_STEP, clampPanelSize, isRatio, normalizePanelSizes, panelCssVar, type PanelKey } from "../features/layout";
import { t } from "../i18n";

/**
 * The divider between two panels. Drag it to change the width of `panel`;
 * double-click puts the default width back. `grow` says which way makes the
 * panel wider: 1 when the panel is left of the divider, -1 when it is right.
 * For the sizes that are a share of a width, `track` gives the stretch that
 * share is measured in (default: the element the divider sits in).
 */
export function Splitter({
  panel,
  grow,
  track,
  edge,
}: {
  panel: PanelKey;
  grow: 1 | -1;
  track?: () => { left: number; width: number } | null;
  /** Which border the divider stands for: the one of the panel before it or after it (default: the panel it resizes). */
  edge?: "before" | "after";
}) {
  const sizes = normalizePanelSizes(useSettings((s) => s.panelSizes));
  const [dragging, setDragging] = useState(false);
  const el = useRef<HTMLDivElement>(null);

  const save = (size: number) => {
    const s = useSettings.getState();
    s.update({ panelSizes: { ...normalizePanelSizes(s.panelSizes), [panel]: clampPanelSize(panel, size) } });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const bar = el.current;
    const workbench = bar?.closest<HTMLElement>(".workbench");
    if (!bar || !workbench) return;
    e.preventDefault();
    const startX = e.clientX;
    const startSize = sizes[panel];
    let size = startSize;
    // While dragging the size goes straight to the CSS variable (no re-render per pixel); it is saved on release.
    const apply = (value: number) => {
      size = clampPanelSize(panel, value);
      // A side panel may not squeeze the text area to nothing in a small window.
      if (!isRatio(panel)) size = Math.max(clampPanelSize(panel, 0), Math.min(size, workbench.clientWidth - 260));
      workbench.style.setProperty(...panelCssVar(panel, size));
    };
    const move = (ev: PointerEvent) => {
      if (isRatio(panel)) {
        const box = track ? track() : bar.parentElement?.getBoundingClientRect();
        if (box && box.width > 0) apply((ev.clientX - box.left) / box.width);
      } else {
        apply(startSize + grow * (ev.clientX - startX));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("resizing");
      setDragging(false);
      if (size !== startSize) save(size);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    document.body.classList.add("resizing");
    setDragging(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    save(sizes[panel] + (e.key === "ArrowRight" ? 1 : -1) * grow * PANEL_STEP[panel]);
  };

  return (
    <div
      ref={el}
      className={`splitter ${dragging ? "dragging" : ""}`}
      data-panel={panel}
      data-edge={edge ?? (grow === 1 ? "before" : "after")}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("幅を変更")}
      aria-valuenow={Math.round(isRatio(panel) ? sizes[panel] * 100 : sizes[panel])}
      tabIndex={0}
      title={t("ドラッグで幅を変更 (ダブルクリックで元の幅に戻す)")}
      onPointerDown={onPointerDown}
      onDoubleClick={() => save(DEFAULT_PANEL_SIZES[panel])}
      onKeyDown={onKeyDown}
    />
  );
}

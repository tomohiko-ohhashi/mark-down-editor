import { useEffect, useRef, useState } from "react";
import { useDocStore, isDirty } from "../store/useDocStore";
import { closeDocument, newDocument } from "../features/files/fileOps";
import { tabLabels } from "../features/files/names";
import { t } from "../i18n";
import { IconClose, IconPlus } from "./icons";

export function TabBar() {
  const docs = useDocStore((s) => s.docs);
  const activeId = useDocStore((s) => s.activeId);
  const setActive = useDocStore((s) => s.setActive);
  const labels = tabLabels(docs.map((d) => d.path));
  const moveDoc = useDocStore((s) => s.moveDoc);
  const [dragging, setDragging] = useState<string | null>(null);
  // Set when a press turned into a drag, so the click that ends it does not also select a tab.
  const dragged = useRef(false);
  const bar = useRef<HTMLDivElement>(null);
  // With more tabs than fit, bring the one in front into view.
  useEffect(() => {
    bar.current?.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, docs.length]);

  /** Press on a tab; once the pointer has moved a little, the tab follows it over the others. */
  const startDrag = (id: string, e: React.PointerEvent) => {
    // Not for touch: there a sideways swipe scrolls the tab bar.
    if (e.button !== 0 || e.pointerType === "touch" || (e.target as HTMLElement).closest(".tab-close")) return;
    const startX = e.clientX;
    dragged.current = false;
    const move = (ev: PointerEvent) => {
      if (!dragged.current && Math.abs(ev.clientX - startX) < 6) return;
      dragged.current = true;
      setDragging(id);
      const over = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>(".tab");
      const overId = over?.dataset.id;
      if (!over || !overId || overId === id) return;
      // Swap only once the pointer is past the middle of the other tab. Without this a narrow tab
      // dragged over a wide one would still be over it after the swap, and jump back and forth.
      const ids = useDocStore.getState().docs.map((d) => d.id);
      const box = over.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      if (ids.indexOf(id) < ids.indexOf(overId) ? ev.clientX > middle : ev.clientX < middle) moveDoc(id, overId);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDragging(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  return (
    <div className="tabbar" role="tablist" ref={bar}>
      {docs.map((d, i) => (
        <div
          key={d.id}
          role="tab"
          aria-selected={d.id === activeId}
          data-id={d.id}
          className={`tab ${d.id === activeId ? "active" : ""} ${dragging === d.id ? "dragging" : ""}`}
          onPointerDown={(e) => startDrag(d.id, e)}
          title={d.path ?? t("未保存のドキュメント")}
          onClick={() => {
            if (!dragged.current) setActive(d.id);
          }}
          onAuxClick={(e) => {
            if (e.button === 1) void closeDocument(d.id);
          }}
        >
          <span className="tab-name">
            {isDirty(d) ? "● " : ""}
            {labels[i]}
          </span>
          <button
            className="tab-close"
            title={t("閉じる")}
            onClick={(e) => {
              e.stopPropagation();
              void closeDocument(d.id);
            }}
          >
            <IconClose size={13} />
          </button>
        </div>
      ))}
      <button className="tab-new" title={t("新規タブ (Ctrl/⌘+N)")} aria-label={t("新規タブ (Ctrl/⌘+N)")} onClick={() => newDocument()}>
        <IconPlus />
      </button>
    </div>
  );
}

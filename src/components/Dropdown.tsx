import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { IconMore, IconCaret } from "./icons";

interface Props {
  label: ReactNode;
  title?: string;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  /** Open upwards (for a bar at the bottom of the screen). */
  up?: boolean;
}

/** Minimal toolbar dropdown; closes on outside click or Escape. */
export function Dropdown({ label, title, children, align = "left", up = false }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [fixed, setFixed] = useState<CSSProperties | undefined>(undefined);
  // On a phone the toolbar scrolls sideways, and a bar that scrolls cuts off whatever hangs below it.
  // There the menu is placed against the window instead, under its button and kept inside the screen.
  useLayoutEffect(() => {
    const button = ref.current?.querySelector("button");
    const menu = menuRef.current;
    const bar = ref.current?.closest<HTMLElement>(".toolbar");
    if (!open || up || !button || !menu || !bar || bar.scrollWidth <= bar.clientWidth) {
      setFixed(undefined);
      return;
    }
    const box = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(box.left, window.innerWidth - menu.offsetWidth - 8));
    setFixed({ position: "fixed", top: box.bottom + 4, left, right: "auto", marginTop: 0, maxHeight: `calc(100vh - ${Math.round(box.bottom) + 16}px)`, overflowY: "auto" });
    // The button moves away when the bar is scrolled: close rather than leave the menu behind.
    const onScroll = () => setOpen(false);
    bar.addEventListener("scroll", onScroll, { passive: true });
    return () => bar.removeEventListener("scroll", onScroll);
  }, [open, up]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="dropdown" ref={ref}>
      <button className={open ? "active" : ""} title={title} aria-label={label === "" ? title : undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label === "" ? <IconMore /> : <>{label} <IconCaret /></>}
      </button>
      {open && (
        <div className={`dropdown-menu ${align} ${up ? "up" : ""}`} ref={menuRef} style={fixed}>{children(() => setOpen(false))}</div>
      )}
    </div>
  );
}

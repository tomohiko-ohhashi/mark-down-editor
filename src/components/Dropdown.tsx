import { useEffect, useRef, useState, type ReactNode } from "react";

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
      <button className={open ? "active" : ""} title={title} onClick={() => setOpen((o) => !o)}>
        {label} ▾
      </button>
      {open && (
        <div className={`dropdown-menu ${align} ${up ? "up" : ""}`}>{children(() => setOpen(false))}</div>
      )}
    </div>
  );
}

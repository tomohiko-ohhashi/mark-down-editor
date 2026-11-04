import { useEffect, type RefObject } from "react";

/**
 * Percentage-based scroll synchronisation between the editor and preview panes.
 * Each pane publishes its scroll ratio; the other follows it.
 */
export type Side = "editor" | "preview";
type Listener = (from: Side, ratio: number) => void;

const listeners = new Set<Listener>();
let lastSource: Side | null = null;
let lastSourceAt = 0;

export function publishScroll(from: Side, el: HTMLElement) {
  const now = performance.now();
  // Ignore scroll events caused by our own programmatic scroll on the other pane.
  if (lastSource && lastSource !== from && now - lastSourceAt < 100) return;
  lastSource = from;
  lastSourceAt = now;
  const max = el.scrollHeight - el.clientHeight;
  const ratio = max > 0 ? el.scrollTop / max : 0;
  listeners.forEach((l) => l(from, ratio));
}

/** Make `el` follow scrolls published by the other side. Returns an unsubscribe function. */
export function followScroll(side: Side, el: HTMLElement): () => void {
  const listener: Listener = (from, ratio) => {
    if (from === side) return;
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = ratio * max;
  };
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hook form for React-managed panes: publish own scrolls and follow the other side. */
export function useScrollSync(side: Side, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => publishScroll(side, el);
    el.addEventListener("scroll", onScroll, { passive: true });
    const unfollow = followScroll(side, el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      unfollow();
    };
  }, [side, ref]);
}

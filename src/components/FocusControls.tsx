import { useEffect, useState } from "react";
import { useDocStore } from "../store/useDocStore";
import { editorRef } from "../editor/Editor";

interface MenuPos {
  x: number;
  y: number;
  hasSelection: boolean;
}

const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

/**
 * Ways out of focus mode other than Esc: a small button in the corner (the
 * only option on phones, which have no Esc key) and a right-click menu.
 * Shift+right-click still opens the browser's own menu.
 */
export function FocusControls() {
  const focusMode = useDocStore((s) => s.focusMode);
  const typewriter = useDocStore((s) => s.typewriterMode);
  const toggle = useDocStore((s) => s.toggle);
  const [menu, setMenu] = useState<MenuPos | null>(null);

  useEffect(() => {
    if (!focusMode) {
      setMenu(null);
      return;
    }
    const onContextMenu = (e: MouseEvent) => {
      if (e.shiftKey) return;
      e.preventDefault();
      const view = editorRef.view;
      const hasSelection = !!view && !view.state.selection.main.empty;
      // Keep the menu inside the window.
      setMenu({
        x: Math.min(e.clientX, window.innerWidth - 240),
        y: Math.min(e.clientY, window.innerHeight - 220),
        hasSelection,
      });
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, [focusMode]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    // Capture phase: Esc closes the menu first instead of leaving focus mode.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  if (!focusMode) return null;

  const run = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };
  const clipboard = (command: "copy" | "cut") =>
    run(() => {
      editorRef.view?.focus();
      document.execCommand(command);
    });
  const paste = run(() => {
    const view = editorRef.view;
    if (!view) return;
    void navigator.clipboard.readText().then((text) => {
      if (!text) return;
      view.dispatch(view.state.replaceSelection(text), { userEvent: "input.paste", scrollIntoView: true });
      view.focus();
    });
  });

  return (
    <>
      <button className="focus-exit" onClick={() => toggle("focusMode")} title="フォーカスモードを終了 (Esc)">
        ✕ <span>フォーカス解除</span>
      </button>
      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          // Keep the editor selection while the menu is used.
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button className="menu-item" role="menuitem" onClick={run(() => toggle("focusMode"))}>
            フォーカスモードを終了 <kbd>Esc</kbd>
          </button>
          <button className="menu-item" role="menuitem" onClick={run(() => toggle("typewriterMode"))}>
            {typewriter ? "✓ " : ""}タイプライターモード
          </button>
          <hr />
          <button className="menu-item" role="menuitem" disabled={!menu.hasSelection} onClick={clipboard("cut")}>
            切り取り
          </button>
          <button className="menu-item" role="menuitem" disabled={!menu.hasSelection} onClick={clipboard("copy")}>
            コピー
          </button>
          {canPaste && (
            <button className="menu-item" role="menuitem" onClick={paste}>
              貼り付け
            </button>
          )}
          <div className="menu-hint">Shift+右クリックで通常のメニュー</div>
        </div>
      )}
    </>
  );
}

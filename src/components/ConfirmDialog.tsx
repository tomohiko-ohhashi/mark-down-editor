import { useEffect, useRef } from "react";
import { create } from "zustand";
import { t } from "../i18n";

export interface Choice {
  id: string;
  label: string;
  /** "primary" is the default action (Enter); "danger" marks a destructive one. */
  /** "danger-primary": the main action, and a destructive one (delete). */
  kind?: "primary" | "danger" | "danger-primary";
}

interface ChoiceRequest {
  title: string;
  message: string;
  choices: Choice[];
}

interface ChoiceState {
  request: ChoiceRequest | null;
  resolve: ((id: string | null) => void) | null;
}

const useChoiceStore = create<ChoiceState>(() => ({ request: null, resolve: null }));

/**
 * Ask a question with labelled buttons. Resolves with the id of the chosen
 * button, or null when the dialog was dismissed (Esc, ×, click outside).
 * Native dialogs offer two unlabelled-ish buttons at best (a browser's
 * confirm() only "OK" / "Cancel"), which is not enough for "save / don't
 * save / cancel".
 */
export function choose(request: ChoiceRequest): Promise<string | null> {
  return new Promise((resolve) => {
    useChoiceStore.getState().resolve?.(null);
    useChoiceStore.setState({ request, resolve });
  });
}

function finish(id: string | null) {
  const { resolve } = useChoiceStore.getState();
  useChoiceStore.setState({ request: null, resolve: null });
  resolve?.(id);
}

export function ConfirmDialog() {
  const request = useChoiceStore((s) => s.request);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    const before = document.activeElement as HTMLElement | null;
    setTimeout(() => primaryRef.current?.focus(), 0);
    // Capture phase, so Esc answers this dialog instead of leaving focus mode behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      finish(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      before?.focus?.();
    };
  }, [request]);

  if (!request) return null;
  const focusIndex = Math.max(
    0,
    // A destructive main action is not pre-selected: Enter must not delete by accident.
    request.choices.findIndex((c) => c.kind === "primary"),
  );
  return (
    <div className="modal-backdrop" onMouseDown={() => finish(null)}>
      <div className="modal confirm" onMouseDown={(e) => e.stopPropagation()} role="alertdialog" aria-label={request.title}>
        <div className="modal-header">
          <h2>{request.title}</h2>
          <button onClick={() => finish(null)} title={t("閉じる (Esc)")}>×</button>
        </div>
        <div className="modal-body">
          <p className="confirm-message">{request.message}</p>
          <div className="prompt-actions">
            {request.choices.map((c, i) => (
              <button
                key={c.id}
                ref={i === focusIndex ? primaryRef : undefined}
                className={c.kind === "primary" ? "primary" : c.kind === "danger-primary" ? "secondary danger solid" : c.kind === "danger" ? "secondary danger" : "secondary"}
                onClick={() => finish(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { t } from "../i18n";

interface PromptRequest {
  title: string;
  label?: string;
  defaultValue?: string;
  okLabel?: string;
  /** Returns an error message to show, or null when the value is acceptable. */
  validate?: (value: string) => string | null;
}

interface PromptState {
  request: PromptRequest | null;
  resolve: ((value: string | null) => void) | null;
}

const usePromptStore = create<PromptState>(() => ({ request: null, resolve: null }));

/** Ask the user for a line of text (Tauri has no native prompt dialog). */
export function promptText(request: PromptRequest): Promise<string | null> {
  return new Promise((resolve) => {
    usePromptStore.getState().resolve?.(null);
    usePromptStore.setState({ request, resolve });
  });
}

function finish(value: string | null) {
  const { resolve } = usePromptStore.getState();
  usePromptStore.setState({ request: null, resolve: null });
  resolve?.(value);
}

export function PromptDialog() {
  const request = usePromptStore((s) => s.request);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setValue(request.defaultValue ?? "");
    setError(null);
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // Select the name without its extension so typing replaces just that.
      const dot = el.value.lastIndexOf(".");
      el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
    }, 0);
  }, [request]);

  if (!request) return null;
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    const err = request.validate?.(v) ?? null;
    if (err) {
      setError(err);
      return;
    }
    finish(v);
  };
  return (
    <div className="modal-backdrop" onMouseDown={() => finish(null)}>
      <div className="modal prompt" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={request.title}>
        <div className="modal-header">
          <h2>{request.title}</h2>
          <button onClick={() => finish(null)} title={t("閉じる (Esc)")}>×</button>
        </div>
        <div className="modal-body">
          <label>
            {request.label ?? t("名前")}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") finish(null);
              }}
            />
          </label>
          {error && <div className="prompt-error">{error}</div>}
          <div className="prompt-actions">
            <button className="secondary" onClick={() => finish(null)}>{t("キャンセル")}</button>
            <button className="primary" onClick={submit}>{request.okLabel ?? "OK"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

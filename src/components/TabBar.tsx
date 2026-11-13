import { useDocStore, isDirty } from "../store/useDocStore";
import { closeDocument, newDocument } from "../features/files/fileOps";
import { tabLabels } from "../features/files/names";
import { t } from "../i18n";

export function TabBar() {
  const docs = useDocStore((s) => s.docs);
  const activeId = useDocStore((s) => s.activeId);
  const setActive = useDocStore((s) => s.setActive);
  const labels = tabLabels(docs.map((d) => d.path));
  return (
    <div className="tabbar" role="tablist">
      {docs.map((d, i) => (
        <div
          key={d.id}
          role="tab"
          aria-selected={d.id === activeId}
          className={`tab ${d.id === activeId ? "active" : ""}`}
          title={d.path ?? t("未保存のドキュメント")}
          onClick={() => setActive(d.id)}
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
            ×
          </button>
        </div>
      ))}
      <button className="tab-new" title={t("新規タブ (Ctrl/⌘+N)")} onClick={() => newDocument()}>
        +
      </button>
    </div>
  );
}

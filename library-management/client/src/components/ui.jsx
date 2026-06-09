export function StatusBadge({ tone = "neutral", children, className = "" }) {
 return <span className={`ui-status-badge ${tone} ${className}`.trim()}>{children}</span>;
}

export function StatCard({ label, value, meta, tone = "neutral", icon: Icon }) {
 return (
 <article className={`ui-stat-card ${tone}`}>
 <div>
 <span>{label}</span>
 <strong>{value}</strong>
 {meta && <small>{meta}</small>}
 </div>
 {Icon && (
 <div className="ui-stat-icon">
 <Icon size={18} />
 </div>
 )}
 </article>
 );
}

export function PageHeader({ eyebrow, title, description, actions }) {
 return (
 <div className="ui-page-header">
 <div>
 {eyebrow && <span>{eyebrow}</span>}
 <h2>{title}</h2>
 {description && <p>{description}</p>}
 </div>
 {actions && <div className="ui-page-header-actions">{actions}</div>}
 </div>
 );
}

export function DataToolbar({ children, summary, actions }) {
 return (
 <section className="ui-data-toolbar">
 <div className="ui-data-toolbar-main">{children}</div>
 {(summary || actions) && (
 <div className="ui-data-toolbar-side">
 {summary}
 {actions}
 </div>
 )}
 </section>
 );
}

export function Drawer({ open, title, children, footer, onClose }) {
 if (!open) return null;

 return (
 <aside className="ui-drawer" role="dialog" aria-modal="true" aria-label={title}>
 <div className="ui-drawer-header">
 <h3>{title}</h3>
 {onClose && (
 <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
 X
 </button>
 )}
 </div>
 <div className="ui-drawer-body">{children}</div>
 {footer && <div className="ui-drawer-footer">{footer}</div>}
 </aside>
 );
}

export function ConfirmModal({ open, title, message, confirmLabel = "Xác nhận", cancelLabel = "Hủy", busy = false, onConfirm, onCancel }) {
 if (!open) return null;

 return (
 <div className="app-modal-backdrop" role="dialog" aria-modal="true">
 <div className="app-modal">
 <h3>{title}</h3>
 {message && <p>{message}</p>}
 <div className="form-actions">
 <button className="primary-button" type="button" onClick={onConfirm} disabled={busy}>
 {busy ? "Đang xử lý..." : confirmLabel}
 </button>
 <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>
 {cancelLabel}
 </button>
 </div>
 </div>
 </div>
 );
}

export function EmptyState({ title = "Chưa có dữ liệu", description, action }) {
 return (
 <div className="ui-empty-state">
 <strong>{title}</strong>
 {description && <span>{description}</span>}
 {action}
 </div>
 );
}

export function LoadingState({ lines = 3 }) {
 return (
 <div className="ui-loading-state" aria-label="Đang tải dữ liệu">
 {Array.from({ length: lines }).map((_, index) => (
 <span key={index} />
 ))}
 </div>
 );
}

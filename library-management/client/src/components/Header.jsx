import { useMemo, useState } from "react";
import { Bell, Search, X } from "lucide-react";
import { StatusBadge } from "./ui";

function Header({
  title,
  subtitle,
  user,
  roleLabel,
  currentPageLabel,
  notifications = [],
  globalSearchItems = [],
  onNavigate,
  onLogout,
}) {
  const [globalQuery, setGlobalQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const urgentCount = notifications.filter((item) => item.tone === "danger" || item.tone === "warning").length;
  const normalizedQuery = globalQuery.trim().toLowerCase();
  const roleTone = user.role === "admin" ? "danger" : user.role === "librarian" ? "warning" : "success";
  const notificationSummary = useMemo(
    () =>
      notifications.reduce(
        (summary, item) => {
          const tone = item.tone || "info";
          summary[tone] = (summary[tone] || 0) + 1;
          return summary;
        },
        { danger: 0, warning: 0, success: 0, info: 0 }
      ),
    [notifications]
  );
  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort((first, second) => {
        const rank = { danger: 0, warning: 1, info: 2, success: 3 };
        return (rank[first.tone || "info"] ?? 2) - (rank[second.tone || "info"] ?? 2);
      }),
    [notifications]
  );

  const globalResults = useMemo(() => {
    if (!normalizedQuery) return [];

    return globalSearchItems
      .filter((item) => [item.title, item.meta, item.keywords].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery))
      .slice(0, 6);
  }, [globalSearchItems, normalizedQuery]);

  const handlePickResult = (item) => {
    const targetPage = item.page || item.target;
    if (targetPage && typeof onNavigate === "function") {
      onNavigate(targetPage);
    }
    setGlobalQuery("");
  };

  return (
    <header className="header bg-white shadow-sm py-3">
      <div className="container header-shell">
        <div className="header-title-block">
          <div className="breadcrumb-line">Trang chủ / {currentPageLabel}</div>
          <h1 className="h4 mb-0">{title}</h1>
          <p className="text-muted mb-0 small">{subtitle}</p>
        </div>

        <div className="header-global-search">
          <div className="global-search-control">
            <Search size={17} />
            <input
              type="search"
              value={globalQuery}
              onChange={(event) => setGlobalQuery(event.target.value)}
              placeholder="Tìm trang, tác vụ, cảnh báo..."
              aria-label="Tìm kiếm toàn cục"
            />
            {globalQuery && (
              <button type="button" onClick={() => setGlobalQuery("")} aria-label="Xóa tìm kiếm">
                <X size={15} />
              </button>
            )}
          </div>

          {normalizedQuery && (
            <div className="global-search-results">
              {globalResults.length > 0 ? (
                globalResults.map((item) => (
                  <button type="button" className="global-search-result" key={item.id} onClick={() => handlePickResult(item)}>
                    <strong>{item.title}</strong>
                    <span>{item.meta}</span>
                  </button>
                ))
              ) : (
                <div className="global-search-empty">Không tìm thấy mục phù hợp.</div>
              )}
            </div>
          )}
        </div>

        <div className="header-actions">
          <div className="header-notifications">
            <button
              className={"notification-button" + (notificationsOpen ? " active" : "")}
              type="button"
              aria-label="Thông báo"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell size={18} />
              {notifications.length > 0 && <span>{urgentCount || notifications.length}</span>}
            </button>
            <div className={"notification-popover" + (notificationsOpen ? " open" : "")}>
              <div className="notification-popover-header">
                <div>
                  <strong>Trung tâm thông báo</strong>
                  <small>{urgentCount > 0 ? `${urgentCount} cảnh báo cần xử lý` : "Không có cảnh báo khẩn"}</small>
                </div>
                <button type="button" className="icon-button" aria-label="Đóng thông báo" onClick={() => setNotificationsOpen(false)}>
                  <X size={15} />
                </button>
              </div>
              <div className="notification-summary-row">
                <span className="danger">{notificationSummary.danger} quá hạn</span>
                <span className="warning">{notificationSummary.warning} sắp hạn</span>
                <span>{notifications.length} tổng</span>
              </div>
              {notifications.length > 0 ? (
                sortedNotifications.slice(0, 6).map((item) => (
                  <button
                    type="button"
                    className={`notification-item ${item.tone || "info"}`}
                    key={item.id}
                    onClick={() => {
                      const targetPage = item.page || item.target;
                      if (targetPage && typeof onNavigate === "function") onNavigate(targetPage);
                      setNotificationsOpen(false);
                    }}
                  >
                    <span>{item.title}</span>
                    <small>{item.message}</small>
                  </button>
                ))
              ) : (
                <div className="notification-empty-state">Không có thông báo mới.</div>
              )}
              {notifications.length > 0 && (
                <div className="notification-footer-actions">
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate?.("borrow");
                      setNotificationsOpen(false);
                    }}
                  >
                    Mở mượn/trả
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate?.("overdue");
                      setNotificationsOpen(false);
                    }}
                  >
                    Xem quá hạn
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="header-user-copy">
            <div className="fw-semibold">Xin chào, {user.fullName}</div>
            <div className="text-muted small">
              {user.email} · <StatusBadge tone={roleTone}>{roleLabel}</StatusBadge>
            </div>
          </div>

          <div className="avatar rounded-circle bg-primary text-white d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
            {user.fullName?.charAt(0) ?? "A"}
          </div>

          <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onLogout}>
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pin, PinOff, Search, Star, Wifi, WifiOff, X } from "lucide-react";
import { sidebarMenuItems, sidebarSections } from "../constants/sidebarMenu";

function Sidebar({
  currentPage,
  onChangePage,
  user,
  roleLabel,
  badgeCounts = {},
  isOnline = true,
  pinned = false,
  recentPages = [],
  favoritePages = [],
  collapsed = false,
  loadingUser = false,
  onTogglePin,
  onToggleFavorite,
  onToggleCollapse,
}) {
  const [menuQuery, setMenuQuery] = useState("");
  const searchInputRef = useRef(null);
  const userRole = user?.role;
  const userName = user?.fullName ?? "Người dùng";
  const canChangePage = typeof onChangePage === "function";
  const showUserSkeleton = loadingUser || !user;
  const normalizedQuery = menuQuery.trim().toLowerCase();
  const visibleItems = sidebarMenuItems
    .filter((item) => (!item.adminOnly || userRole === "admin") && (!item.userOnly || userRole !== "admin"))
    .filter((item) => {
      if (!normalizedQuery) return true;

      const sectionLabel = sidebarSections.find((section) => section.id === item.section)?.label ?? "";
      return [item.label, sectionLabel, item.shortcut ? `alt ${item.shortcut}` : ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  const visibleSections = sidebarSections
    .map((section) => ({
      ...section,
      items: visibleItems.filter((item) => item.section === section.id),
    }))
    .filter((section) => section.items.length > 0);
  const recentItems = recentPages
    .filter((page) => page !== currentPage)
    .map((page) => sidebarMenuItems.find((item) => item.id === page))
    .filter(Boolean)
    .filter((item) => (!item.adminOnly || userRole === "admin") && (!item.userOnly || userRole !== "admin"))
    .slice(0, 3);
  const favoriteItems = favoritePages
    .map((page) => sidebarMenuItems.find((item) => item.id === page))
    .filter(Boolean)
    .filter((item) => (!item.adminOnly || userRole === "admin") && (!item.userOnly || userRole !== "admin"));
  const canToggleFavorite = typeof onToggleFavorite === "function";

  const renderMenuButton = (item, options = {}) => {
    const Icon = item.icon;
    const active = item.id === currentPage;
    const badgeValue = item.badgeKey ? Number(badgeCounts[item.badgeKey] || 0) : 0;
    const shortcutLabel = item.shortcut ? `Alt + ${item.shortcut}` : "";
    const tooltip = [item.label, shortcutLabel].filter(Boolean).join(" - ");
    const isFavorite = favoritePages.includes(item.id);

    return (
      <div className="sidebar-menu-row" key={options.key ?? item.id}>
        <button
          type="button"
          title={tooltip}
          aria-label={collapsed ? tooltip : undefined}
          aria-current={active ? "page" : undefined}
          data-tooltip={collapsed ? tooltip : undefined}
          disabled={!canChangePage}
          className={
            "list-group-item list-group-item-action d-flex align-items-center gap-2 " +
            (active ? "active " : "") +
            (options.recent ? "recent " : "")
          }
          onClick={() => canChangePage && onChangePage(item.id)}
        >
          <Icon size={18} />
          {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
          {badgeValue > 0 && (
            <span className="sidebar-badge" aria-label={`${badgeValue} mục cần chú ý`}>
              {badgeValue > 99 ? "99+" : badgeValue}
            </span>
          )}
          {!collapsed && shortcutLabel && <kbd className="sidebar-shortcut">{shortcutLabel}</kbd>}
        </button>
        {!collapsed && canToggleFavorite && (
          <button
            type="button"
            className={"sidebar-favorite-button" + (isFavorite ? " active" : "")}
            aria-label={isFavorite ? `Bỏ yêu thích ${item.label}` : `Yêu thích ${item.label}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(item.id);
            }}
          >
            <Star size={14} fill={isFavorite ? "currentColor" : "none"} />
          </button>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (collapsed) return undefined;

    const onKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      const isTyping = tagName === "input" || tagName === "textarea" || tagName === "select";

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (event.key === "Escape" && document.activeElement === searchInputRef.current) {
        setMenuQuery("");
        searchInputRef.current?.blur();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapsed]);

  return (
    <div className={"sidebar h-100 d-flex flex-column p-3" + (collapsed ? " collapsed" : "")}>
      <div className="brand d-flex align-items-center gap-3 mb-3">
        <div className="brand-logo">L</div>
        {!collapsed && (
          <div>
            <h1 className="h5 mb-0">Library</h1>
            <p className="text-white-50 small mb-0">Management</p>
          </div>
        )}
      </div>

      <div className="sidebar-user">
        <div className={"sidebar-avatar" + (showUserSkeleton ? " skeleton-dot" : "")}>
          {!showUserSkeleton && (userName.charAt(0) || "U")}
        </div>
        {!collapsed && showUserSkeleton && (
          <div className="sidebar-user-loading" aria-label="Đang tải thông tin người dùng">
            <span />
            <span />
          </div>
        )}
        {!collapsed && !showUserSkeleton && (
          <div>
            <strong>{userName}</strong>
            <span>{roleLabel}</span>
            <span className={"sidebar-session " + (isOnline ? "online" : "offline")}>
              {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              {isOnline ? "Đang trực tuyến" : "Mất kết nối"}
            </span>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="sidebar-tools">
          <button
            type="button"
            className={"sidebar-tool-button" + (pinned ? " active" : "")}
            onClick={onTogglePin}
            disabled={typeof onTogglePin !== "function"}
            aria-pressed={pinned}
          >
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
            <span>{pinned ? "Bỏ ghim sidebar" : "Ghim sidebar"}</span>
          </button>
        </div>
      )}

      {!collapsed && (
        <label className="sidebar-search">
          <span>Tìm menu</span>
          <div className="sidebar-search-control">
            <Search size={15} />
            <input
              ref={searchInputRef}
              type="search"
              value={menuQuery}
              onChange={(event) => setMenuQuery(event.target.value)}
              placeholder="Tên chức năng hoặc phím tắt"
            />
            {menuQuery && (
              <button
                type="button"
                className="sidebar-search-clear"
                onClick={() => {
                  setMenuQuery("");
                  searchInputRef.current?.focus();
                }}
                aria-label="Xóa tìm kiếm menu"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </label>
      )}

      <div className="list-group mb-3">
        {!collapsed && !normalizedQuery && favoriteItems.length > 0 && (
          <div className="sidebar-menu-section">
            <div className="sidebar-section-label">Yêu thích</div>
            {favoriteItems.map((item) => renderMenuButton(item, { key: `favorite-${item.id}` }))}
          </div>
        )}
        {!collapsed && !normalizedQuery && recentItems.length > 0 && (
          <div className="sidebar-menu-section">
            <div className="sidebar-section-label">Gần đây</div>
            {recentItems.map((item) => renderMenuButton(item, { key: `recent-${item.id}`, recent: true }))}
          </div>
        )}
        {visibleSections.map((section) => (
          <div className="sidebar-menu-section" key={section.id}>
            {!collapsed && <div className="sidebar-section-label">{section.label}</div>}
            {section.items.map((item) => renderMenuButton(item))}
          </div>
        ))}
        {!collapsed && visibleSections.length === 0 && (
          <div className="sidebar-empty-state">Không tìm thấy mục phù hợp.</div>
        )}
      </div>

      <div className="mt-auto d-flex align-items-center gap-2">
        <div className="text-white-50 small flex-grow-1">
          {!collapsed && (userRole === "admin" ? "Toàn quyền quản lý thư viện." : "Chế độ tra cứu và mượn sách.")}
        </div>
        <button
          className="btn btn-sm btn-outline-light sidebar-toggle"
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          aria-pressed={collapsed}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </div>
  );
}

export default Sidebar;

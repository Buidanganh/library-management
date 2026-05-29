import {
  AlertTriangle,
  BookOpen,
  BookPlus,
  LayoutDashboard,
  Repeat,
  UserRound,
} from "lucide-react";

const menuItems = [
  { id: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { id: "books", label: "Quản lý sách", icon: BookOpen },
  { id: "add-book", label: "Thêm sách", icon: BookPlus, adminOnly: true },
  { id: "readers", label: "Độc giả", icon: UserRound, adminOnly: true },
  { id: "borrow", label: "Mượn / Trả sách", icon: Repeat },
  { id: "overdue", label: "Sách quá hạn", icon: AlertTriangle },
];

function Sidebar({ currentPage, onChangePage, user, collapsed = false, onToggleCollapse }) {
  const visibleItems = menuItems.filter((item) => !item.adminOnly || user.role === "admin");

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

      <div className="list-group mb-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === currentPage;

          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              className={"list-group-item list-group-item-action d-flex align-items-center gap-2 " + (active ? "active" : "")}
              onClick={() => onChangePage(item.id)}
            >
              <Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-auto d-flex align-items-center gap-2">
        <div className="text-white-50 small flex-grow-1">{!collapsed && "Quản lý thư viện thân thiện và trực quan."}</div>
        <button className="btn btn-sm btn-outline-light" type="button" onClick={onToggleCollapse} aria-pressed={collapsed}>
          {collapsed ? "»" : "‹"}
        </button>
      </div>
    </div>
  );
}

export default Sidebar;

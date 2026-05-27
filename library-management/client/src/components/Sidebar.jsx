import {
  LayoutDashboard,
  BookOpen,
  BookPlus,
  UserRound,
  Repeat,
  AlertTriangle,
} from "lucide-react";

const menuItems = [
  { id: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { id: "books", label: "Quản lý sách", icon: BookOpen },
  { id: "add-book", label: "Thêm sách", icon: BookPlus, adminOnly: true },
  { id: "readers", label: "Độc giả", icon: UserRound, adminOnly: true },
  { id: "borrow", label: "Mượn / Trả sách", icon: Repeat },
  { id: "overdue", label: "Sách quá hạn", icon: AlertTriangle },
];

function Sidebar({ currentPage, onChangePage, user }) {
  const visibleItems = menuItems.filter((item) => !item.adminOnly || user.role === "admin");

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">L</div>
        <div>
          <h1>Library</h1>
          <p>Management</p>
        </div>
      </div>

      <nav className="nav-menu">
        {visibleItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              className={item.id === currentPage ? "nav-item active" : "nav-item"}
              onClick={() => onChangePage(item.id)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        Quản lý thư viện thân thiện và trực quan.
      </div>
    </aside>
  );
}

export default Sidebar;

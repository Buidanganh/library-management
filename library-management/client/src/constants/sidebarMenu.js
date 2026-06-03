import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  BookPlus,
  ClipboardList,
  History,
  LayoutDashboard,
  Repeat,
  UserCircle,
  UserRound,
} from "lucide-react";

export const sidebarSections = [
  { id: "main", label: "Chung" },
  { id: "reader", label: "Người dùng" },
  { id: "admin", label: "Quản trị" },
];

export const sidebarMenuItems = [
  { id: "dashboard", label: "Tổng quan", icon: LayoutDashboard, section: "main", shortcut: "1" },
  { id: "books", label: "Quản lý sách", icon: BookOpen, section: "main", shortcut: "2" },
  { id: "analytics", label: "Phân tích", icon: BarChart3, section: "main", shortcut: "0" },
  { id: "profile", label: "Cá nhân", icon: UserCircle, section: "reader", shortcut: "3", userOnly: true },
  { id: "borrow", label: "Mượn / Trả sách", icon: Repeat, section: "reader", shortcut: "4", badgeKey: "borrow" },
  { id: "overdue", label: "Sách quá hạn", icon: AlertTriangle, section: "reader", shortcut: "5", badgeKey: "overdue" },
  { id: "add-book", label: "Thêm sách", icon: BookPlus, section: "admin", shortcut: "6", adminOnly: true },
  { id: "readers", label: "Độc giả", icon: UserRound, section: "admin", shortcut: "7", adminOnly: true },
  { id: "catalog", label: "Danh mục", icon: ClipboardList, section: "admin", shortcut: "8", adminOnly: true },
  { id: "activity", label: "Nhật ký", icon: History, section: "admin", shortcut: "9", adminOnly: true, systemAdminOnly: true },
];

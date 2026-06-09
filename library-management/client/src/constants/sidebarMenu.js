import {
 AlertTriangle,
 BarChart3,
 BookOpen,
 BookPlus,
 ClipboardList,
 History,
 LayoutDashboard,
 Radar,
 Repeat,
 ShieldCheck,
 UserCircle,
 UserRound,
} from "lucide-react";

export const sidebarSections = [
 { id: "overview", label: "Tổng quan", description: "Cockpit & phân tích" },
 { id: "operations", label: "Vận hành", description: "Workflow mượn trả" },
 { id: "data", label: "Dữ liệu", description: "Kho sách & catalog" },
 { id: "admin", label: "Quản trị", description: "Người dùng & quyền" },
];

export const sidebarMenuItems = [
 { id: "dashboard", label: "Tổng quan", description: "Sức khỏe thư viện và việc cần làm", icon: LayoutDashboard, section: "overview", shortcut: "1" },
 { id: "analytics", label: "Phân tích", description: "Xu hướng mượn, tồn kho và hiệu suất", icon: BarChart3, section: "overview", shortcut: "0" },
 { id: "operations", label: "Vận hành", description: "Bảng điều phối nghiệp vụ trong ngày", icon: Radar, section: "operations", shortcut: "o" },
 { id: "borrow", label: "Mượn / Trả sách", description: "Tạo phiếu, trả sách và gia hạn", icon: Repeat, section: "operations", shortcut: "4", badgeKey: "borrow" },
 { id: "overdue", label: "Sách quá hạn", description: "Theo dõi nhắc trả và tiền phạt", icon: AlertTriangle, section: "operations", shortcut: "5", badgeKey: "overdue" },
 { id: "books", label: "Kho sách", description: "Tìm kiếm, lọc, demand planner", icon: BookOpen, section: "data", shortcut: "2" },
 { id: "catalog", label: "Catalog", description: "Kiểm định metadata và chuẩn hóa dữ liệu", icon: ClipboardList, section: "data", shortcut: "8", adminOnly: true },
 { id: "add-book", label: "Thêm sách", description: "Nhập sách mới và xem danh sách hiện có", icon: BookPlus, section: "data", shortcut: "6", adminOnly: true },
 { id: "profile", label: "Cá nhân", description: "Hồ sơ mượn sách của độc giả", icon: UserCircle, section: "admin", shortcut: "3", userOnly: true },
 { id: "readers", label: "Độc giả", description: "Reader 360, tài khoản và lịch sử mượn", icon: UserRound, section: "admin", shortcut: "7", adminOnly: true },
 { id: "permissions", label: "Phân quyền", description: "Vai trò, quyền truy cập và bảo mật", icon: ShieldCheck, section: "admin", shortcut: "p", adminOnly: true, systemAdminOnly: true },
 { id: "activity", label: "Nhật ký", description: "Audit log và dấu vết thao tác", icon: History, section: "admin", shortcut: "9", adminOnly: true, systemAdminOnly: true },
];

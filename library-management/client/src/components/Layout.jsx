import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import LibraryAssistant from "./LibraryAssistant";
import Dashboard from "../pages/Dashboard";
import Analytics from "../pages/Analytics";
import Books from "../pages/Books";
import BookCreate from "../pages/BookCreate";
import Readers from "../pages/Readers";
import Borrow from "../pages/Borrow";
import Overdue from "../pages/Overdue";
import ActivityLog from "../pages/ActivityLog";
import ReaderProfile from "../pages/ReaderProfile";
import Catalog from "../pages/Catalog";
import Permissions from "../pages/Permissions";
import Operations from "../pages/Operations";
import { sidebarMenuItems, sidebarSections } from "../constants/sidebarMenu";
import {
 borrowBook,
 createBook,
 deleteBook,
 getBooks,
 getCatalog,
 getLoans,
 getNotifications,
 getReaders,
 getReservations,
 getStats,
 updateBook,
} from "../services/api";

const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";
const SIDEBAR_COLLAPSED_MANUAL_KEY = "sidebarCollapsedManual";
const SIDEBAR_PINNED_KEY = "sidebarPinned";
const RECENT_PAGES_KEY = "recentPages";
const FAVORITE_PAGES_KEY = "favoritePages";
const THEME_KEY = "libraryTheme";
const DENSITY_KEY = "libraryDensity";
const FOCUS_MODE_KEY = "libraryFocusMode";
const DEFAULT_PAGE = "dashboard";
const ROUTE_TO_PAGE = {
 "": DEFAULT_PAGE,
 dashboard: "dashboard",
 operations: "operations",
 books: "books",
 analytics: "analytics",
 profile: "profile",
 "add-book": "add-book",
 "books/create": "add-book",
 readers: "readers",
 catalog: "catalog",
 permissions: "permissions",
 borrow: "borrow",
 overdue: "overdue",
 activity: "activity",
};
const PAGE_TO_ROUTE = {
 dashboard: DEFAULT_PAGE,
 operations: "operations",
 books: "books",
 analytics: "analytics",
 profile: "profile",
 "add-book": "books/create",
 readers: "readers",
 catalog: "catalog",
 permissions: "permissions",
 borrow: "borrow",
 overdue: "overdue",
 activity: "activity",
};

function normalizeSearchText(value) {
 return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}

function Layout({ user, onLogout }) {
 const navigate = useNavigate();
 const location = useLocation();
 const getPageFromPath = useCallback(() => {
 const routePath = location.pathname.replace(/^\/+|\/+$/g, "");
 const routeKey = ROUTE_TO_PAGE[routePath] ? routePath : routePath.split("/")[0] || "";
 return ROUTE_TO_PAGE[routeKey] || DEFAULT_PAGE;
 }, [location.pathname]);
 const [currentPage, setCurrentPage] = useState(getPageFromPath);
 const [editingBook, setEditingBook] = useState(null);
 const [returnPage, setReturnPage] = useState("books");
 const [borrowRequest, setBorrowRequest] = useState(null);
 const [notifications, setNotifications] = useState([]);
 const [commandOpen, setCommandOpen] = useState(false);
 const [commandQuery, setCommandQuery] = useState("");
 const [smartSearchData, setSmartSearchData] = useState({
 books: [],
 readers: [],
 loans: [],
 reservations: [],
 catalog: { categories: [], publishers: [] },
 loaded: false,
 });
 const [smartSearchLoading, setSmartSearchLoading] = useState(false);
 const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
 const [density, setDensity] = useState(() => localStorage.getItem(DENSITY_KEY) || "comfortable");
 const [focusMode, setFocusMode] = useState(() => localStorage.getItem(FOCUS_MODE_KEY) === "true");
 const [confirmingBorrow, setConfirmingBorrow] = useState(false);
 const [sidebarBadges, setSidebarBadges] = useState({ borrow: 0, overdue: 0 });
 const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
 const [sidebarPinned, setSidebarPinned] = useState(() => {
 try {
 return JSON.parse(localStorage.getItem(SIDEBAR_PINNED_KEY) || "false");
 } catch {
 return false;
 }
 });
 const [recentPages, setRecentPages] = useState(() => {
 try {
 const raw = JSON.parse(localStorage.getItem(RECENT_PAGES_KEY) || "[]");
 return Array.isArray(raw) ? raw.slice(0, 3) : [];
 } catch {
 return [];
 }
 });
 const [favoritePages, setFavoritePages] = useState(() => {
 try {
 const raw = JSON.parse(localStorage.getItem(FAVORITE_PAGES_KEY) || "[]");
 return Array.isArray(raw) ? raw : [];
 } catch {
 return [];
 }
 });
 const isAdmin = user?.role === "admin";
 const canManageLibrary = ["admin", "librarian"].includes(user?.role);
 const userRoleLabel = isAdmin ? "Quản trị viên" : user?.role === "librarian" ? "Thủ thư" : "Độc giả";
 const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
 try {
 const pinned = JSON.parse(localStorage.getItem(SIDEBAR_PINNED_KEY) || "false");
 if (pinned) return false;

 const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
 const manualRaw = localStorage.getItem(SIDEBAR_COLLAPSED_MANUAL_KEY);

 if (raw !== null) return JSON.parse(raw);

 // If user didn't set a preference manually, default to collapsed on narrow screens
 const manual = manualRaw ? JSON.parse(manualRaw) : false;
 if (!manual && typeof window !== "undefined") {
 return window.innerWidth < 1100;
 }

 return false;
 } catch {
 return false;
 }
 });

 const handleSaveBook = async (bookData) => {
 if (!canManageLibrary) return;

 if (bookData.id) {
 await updateBook(bookData.id, bookData);
 } else {
 await createBook(bookData);
 }
 setEditingBook(null);
 };

 const handleDeleteBook = async (bookId) => {
 if (!canManageLibrary) return;
 await deleteBook(bookId);
 };

 const handleBorrowBook = async (book) => {
 if (canManageLibrary) return;

 return new Promise((resolve, reject) => {
 setBorrowRequest({ book, resolve, reject });
 });
 };

 const cancelBorrowBook = () => {
 borrowRequest?.resolve?.(false);
 setBorrowRequest(null);
 };

 const confirmBorrowBook = async () => {
 if (!borrowRequest?.book) return;

 const { book, resolve, reject } = borrowRequest;
 const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

 setConfirmingBorrow(true);

 try {
 await borrowBook({
 bookId: book.id,
 dueDate,
 });
 getStats().then(applySidebarStats).catch(() => {});
 refreshNotifications();

 window.alert("Mượn sách thành công. Bạn có thể xem phiếu mượn trong mục Mượn / Trả sách.");
 resolve?.(true);
 setBorrowRequest(null);
 } catch (err) {
 reject?.(err);
 } finally {
 setConfirmingBorrow(false);
 }
 };

 const handleNavigateToCreate = useCallback((page = "books") => {
 if (!canManageLibrary) return;

 setEditingBook(null);
 setReturnPage(page);
 setCurrentPage("add-book");
 if (location.pathname !== "/books/create") {
 navigate("/books/create");
 }
 }, [canManageLibrary, location.pathname, navigate]);

 const handleEditBook = (book, page = "books") => {
 if (!canManageLibrary) return;

 setEditingBook(book);
 setReturnPage(page);
 setCurrentPage("add-book");
 if (location.pathname !== "/books/create") {
 navigate("/books/create");
 }
 };

 const handleCancelCreate = () => {
 setEditingBook(null);
 handleChangePage(returnPage);
 };

 const resolveAllowedPage = useCallback((page) => {
 const knownPages = ["dashboard", "operations", "books", "analytics", "profile", "add-book", "readers", "catalog", "permissions", "borrow", "overdue", "activity"];
 if (!knownPages.includes(page)) {
 return DEFAULT_PAGE;
 }

 const adminPages = ["add-book", "readers", "catalog", "permissions", "activity"];
 if (!canManageLibrary && adminPages.includes(page)) {
 return DEFAULT_PAGE;
 }

 if (canManageLibrary && page === "profile") {
 return DEFAULT_PAGE;
 }

 if (!isAdmin && page === "activity") {
 return DEFAULT_PAGE;
 }

 return page;
 }, [canManageLibrary, isAdmin]);

 const handleChangePage = useCallback((page, options = {}) => {
 const nextPage = resolveAllowedPage(page);
 setCurrentPage(nextPage);

 const nextPath = `/${PAGE_TO_ROUTE[nextPage] || DEFAULT_PAGE}`;
 if (location.pathname !== nextPath) {
 navigate(nextPath, { replace: Boolean(options.replace) });
 }
 }, [location.pathname, navigate, resolveAllowedPage]);

 const canUseMenuItem = useCallback((item) =>
 (!item.adminOnly || canManageLibrary) &&
 (!item.systemAdminOnly || isAdmin) &&
 (!item.userOnly || !canManageLibrary),
 [canManageLibrary, isAdmin]);

 const globalSearchItems = useMemo(() => {
 const pageItems = sidebarMenuItems.filter(canUseMenuItem).map((item) => ({
 id: `page-${item.id}`,
 page: item.id,
 title: item.label,
 meta: item.shortcut ? `Trang trong hệ thống · Alt + ${item.shortcut}` : "Trang trong hệ thống",
 keywords: [item.label, item.id].join(" "),
 }));

 const notificationItems = notifications.map((item) => ({
 id: `notification-${item.id}`,
 page: item.page || item.target,
 title: item.title,
 meta: item.message,
 keywords: [item.title, item.message, item.tone].filter(Boolean).join(" "),
 }));

 return [...notificationItems,...pageItems];
 }, [canUseMenuItem, notifications]);

 const commandItems = useMemo(
 () => [...globalSearchItems.map((item) => ({...item,
 kind: "Trang",
 run: () => item.page && handleChangePage(item.page),
 })),
 { id: "cmd-operations", title: "Mở trung tâm vận hành", meta: "Library OS, cảnh báo, workflow, gợi ý", kind: "Vận hành", run: () => handleChangePage("operations") },
 { id: "cmd-books-attention", title: "Mở kho sách cần xử lý", meta: "Sách sắp hết, hết, thiếu ảnh", kind: "Tác vụ", run: () => handleChangePage("books") },
 { id: "cmd-borrow", title: "Mở kanban mượn trả", meta: "Điều phối phiếu đang mượn", kind: "Tác vụ", run: () => handleChangePage("borrow") },
 { id: "cmd-analytics", title: "Mở phân tích thư viện", meta: "Biểu đồ thể loại, mượn trả, quá hạn", kind: "Báo cáo", run: () => handleChangePage("analytics") },
 isAdmin && { id: "cmd-permissions", title: "Mở ma trận phân quyền", meta: "Vai trò admin, thủ thư, độc giả", kind: "Quản trị", run: () => handleChangePage("permissions") },
 canManageLibrary && { id: "cmd-add-book", title: "Thêm sách mới", meta: "Biên mục đầu sách", kind: "Tác vụ", run: () => handleNavigateToCreate("books") },
 { id: "cmd-toggle-theme", title: theme === "dark" ? "Chuyển giao diện sáng" : "Chuyển giao diện tối", meta: "Theme", kind: "Hiển thị", run: () => setTheme((value) => (value === "dark" ? "light" : "dark")) },
 { id: "cmd-toggle-density", title: density === "compact" ? "Chuyển giao diện thoáng" : "Chuyển giao diện gọn", meta: "Density", kind: "Hiển thị", run: () => setDensity((value) => (value === "compact" ? "comfortable" : "compact")) },
 { id: "cmd-toggle-focus", title: focusMode ? "Tắt Focus mode" : "Bật Focus mode", meta: "Ẩn sidebar/header phụ", kind: "Hiển thị", run: () => setFocusMode((value) => !value) },
 ].filter(Boolean),
 [globalSearchItems, handleChangePage, handleNavigateToCreate, canManageLibrary, isAdmin, theme, density, focusMode]
 );

 const smartSearchItems = useMemo(() => {
 const bookItems = (smartSearchData.books || []).slice(0, 250).map((book) => ({
 id: `smart-book-${book.id}`,
 title: book.title || "Sách chưa đặt tên",
 meta: [book.author, book.category, `${book.availableQuantity ?? book.quantity ?? 0} bản còn sẵn`].filter(Boolean).join(" · "),
 kind: "Sách",
 keywords: [
 book.title,
 book.author,
 book.category,
 book.publisher,
 book.isbn,
 book.shelfLocation,
 Number(book.availableQuantity ?? book.quantity ?? 0) > 0 ? "còn hàng còn sẵn" : "hết sách hết hàng",
 !book.imageUrl ? "thiếu ảnh bìa" : "",
 ].filter(Boolean).join(" "),
 run: () => handleChangePage("books"),
 }));

 const readerItems = (smartSearchData.readers || []).slice(0, 180).map((reader) => ({
 id: `smart-reader-${reader.id}`,
 title: reader.name || reader.email || "Độc giả",
 meta: [reader.email, reader.phone, reader.accountStatus === "locked" ? "Đang khóa" : reader.hasAccount ? "Có tài khoản" : "Chưa có tài khoản"].filter(Boolean).join(" · "),
 kind: "Độc giả",
 keywords: [reader.name, reader.email, reader.phone, reader.accountStatus, reader.role].filter(Boolean).join(" "),
 run: () => handleChangePage("readers"),
 }));

 const loanItems = (smartSearchData.loans || []).slice(0, 220).map((loan) => ({
 id: `smart-loan-${loan.id}`,
 title: loan.bookTitle || `Phiếu #${loan.id}`,
 meta: [loan.readerName, loan.status === "overdue" ? "Quá hạn" : loan.status === "borrowed" ? "Đang mượn" : "Đã trả", loan.dueDate ? `hạn ${loan.dueDate}` : ""].filter(Boolean).join(" · "),
 kind: loan.status === "overdue" ? "Quá hạn" : "Mượn trả",
 keywords: [loan.bookTitle, loan.readerName, loan.readerEmail, loan.status, loan.status === "overdue" ? "quá hạn trễ hạn phạt" : "đang mượn chưa trả", loan.dueDate].filter(Boolean).join(" "),
 run: () => handleChangePage(loan.status === "overdue" ? "overdue" : "borrow"),
 }));

 const reservationItems = (smartSearchData.reservations || []).slice(0, 120).map((reservation) => ({
 id: `smart-reservation-${reservation.id}`,
 title: reservation.bookTitle || `Đặt trước #${reservation.id}`,
 meta: [reservation.readerName, reservation.status === "waiting" ? "Đang chờ" : reservation.status, `${reservation.availableQuantity || 0} bản sẵn`].filter(Boolean).join(" · "),
 kind: "Đặt trước",
 keywords: [reservation.bookTitle, reservation.readerName, reservation.status, reservation.status === "waiting" ? "đang chờ hàng chờ đặt trước" : "", Number(reservation.availableQuantity || 0) > 0 ? "có sẵn có thể xử lý" : ""].filter(Boolean).join(" "),
 run: () => handleChangePage("borrow"),
 }));

 const categoryItems = (smartSearchData.catalog?.categories || []).map((category) => ({
 id: `smart-category-${category}`,
 title: category,
 meta: "Thể loại trong danh mục sách",
 kind: "Danh mục",
 keywords: category,
 run: () => handleChangePage("catalog"),
 }));

 const publisherItems = (smartSearchData.catalog?.publishers || []).map((publisher) => ({
 id: `smart-publisher-${publisher}`,
 title: publisher,
 meta: "Nhà xuất bản trong danh mục sách",
 kind: "Danh mục",
 keywords: publisher,
 run: () => handleChangePage("catalog"),
 }));

 const quickInsightItems = [
 { id: "smart-low-stock", title: "Sách sắp hết hoặc hết bản", meta: "Lọc kho sách cần kiểm", kind: "Cảnh báo", keywords: "sach sap het het sach thieu ton kho kiem kho", run: () => handleChangePage("books") },
 { id: "smart-missing-cover", title: "Sách thiếu ảnh bìa", meta: "Bổ sung dữ liệu hiển thị", kind: "Cảnh báo", keywords: "sach thieu anh bia cover image", run: () => handleChangePage("books") },
 { id: "smart-overdue", title: "Phiếu mượn quá hạn", meta: "Mở danh sách quá hạn", kind: "Cảnh báo", keywords: "qua han tre han phat phieu chua tra", run: () => handleChangePage("overdue") },
 { id: "smart-ready-reservations", title: "Đặt trước có thể xử lý", meta: "Sách đã có bản sẵn", kind: "Cảnh báo", keywords: "dat truoc co san hang cho xu ly", run: () => handleChangePage("borrow") },
 ];

 return [...quickInsightItems,...bookItems,...readerItems,...loanItems,...reservationItems,...categoryItems,...publisherItems,
 ];
 }, [handleChangePage, smartSearchData]);

 const commandResults = useMemo(() => {
 const query = normalizeSearchText(commandQuery.trim());
 const queryTerms = query.split(/\s+/).filter(Boolean);
 const allItems = [...commandItems,...smartSearchItems];

 return allItems.map((item) => {
 const haystack = normalizeSearchText([item.title, item.meta, item.kind, item.keywords].filter(Boolean).join(" "));
 const title = normalizeSearchText(item.title);
 const termMatch = queryTerms.length > 0 && queryTerms.every((term) => haystack.includes(term));
 const score = !query
 ? item.kind === "Cảnh báo" || item.kind === "Tác vụ" ? 2 : 1
 : haystack.includes(query) || termMatch
 ? haystack.startsWith(query) || title.includes(query) ? 5 : termMatch ? 4 : 3
 : 0;
 return {...item, score };
 }).filter((item) => item.score > 0).sort((first, second) => second.score - first.score).slice(0, 12);
 }, [commandItems, commandQuery, smartSearchItems]);

 const handleSidebarChangePage = useCallback((page) => {
 handleChangePage(page);

 if (!sidebarPinned && typeof window !== "undefined" && window.innerWidth < 768) {
 setSidebarCollapsed(true);
 }
 }, [handleChangePage, sidebarPinned]);

 const applySidebarStats = useCallback((stats) => {
 setSidebarBadges({
 borrow: Number(stats?.borrowed || 0),
 overdue: Number(stats?.overdue || 0),
 });
 }, []);

 const refreshNotifications = useCallback(() => {
 getNotifications().then(setNotifications).catch(() => setNotifications([]));
 }, []);

 useEffect(() => {
 const routePage = getPageFromPath();
 const nextPage = resolveAllowedPage(routePage);
 const nextPath = `/${PAGE_TO_ROUTE[nextPage] || DEFAULT_PAGE}`;

 if (currentPage !== nextPage) {
 setCurrentPage(nextPage);
 }

 if (location.pathname !== nextPath) {
 navigate(nextPath, { replace: true });
 }
 }, [currentPage, getPageFromPath, location.pathname, navigate, resolveAllowedPage]);

 const loadSmartSearchData = useCallback(async () => {
 if (smartSearchData.loaded || smartSearchLoading) return;

 setSmartSearchLoading(true);
 const requests = {
 books: getBooks(),
 readers: canManageLibrary ? getReaders() : Promise.resolve([]),
 loans: getLoans(),
 reservations: getReservations(),
 catalog: getCatalog(),
 };

 try {
 const results = await Promise.allSettled(Object.entries(requests).map(async ([key, request]) => [key, await request]));
 const nextData = results.reduce(
 (data, result) => {
 if (result.status === "fulfilled") {
 const [key, value] = result.value;
 data[key] = value;
 }
 return data;
 },
 {
 books: [],
 readers: [],
 loans: [],
 reservations: [],
 catalog: { categories: [], publishers: [] },
 loaded: true,
 }
 );

 setSmartSearchData(nextData);
 } finally {
 setSmartSearchLoading(false);
 }
 }, [canManageLibrary, smartSearchData.loaded, smartSearchLoading]);

 const pageInfo = {
 dashboard: {
 title: "Tổng quan",
 subtitle: "Nhìn tổng quan hoạt động thư viện.",
 },
 operations: {
 title: "Vận hành",
 subtitle: "Library OS gom cảnh báo, workflow và gợi ý hành động.",
 },
 books: {
 title: "Quản lý sách",
 subtitle: canManageLibrary
 ? "Thêm, sửa, xóa và theo dõi sách hiện có."
 : "Tra cứu danh sách sách hiện có trong thư viện.",
 },
 analytics: {
 title: "Phân tích",
 subtitle: "Theo dõi xu hướng mượn trả, thể loại và chất lượng dữ liệu kho.",
 },
 profile: {
 title: "Hồ sơ cá nhân",
 subtitle: "Theo dõi thông tin độc giả, sách đang mượn và lịch sử mượn trả.",
 },
 "add-book": {
 title: editingBook ? "Chỉnh sửa sách" : "Thêm sách mới",
 subtitle: editingBook
 ? "Cập nhật thông tin chi tiết của sách trong thư viện."
 : "Nhập thông tin chi tiết để thêm sách vào thư viện.",
 },
 readers: {
 title: "Độc giả",
 subtitle: "Quản lý danh sách độc giả và thông tin liên hệ.",
 },
 catalog: {
 title: "Danh mục sách",
 subtitle: "Chuẩn hóa thể loại và nhà xuất bản dùng khi nhập sách.",
 },
 permissions: {
 title: "Phân quyền",
 subtitle: "Kiểm tra quyền theo vai trò admin, thủ thư và độc giả.",
 },
 borrow: {
 title: "Mượn / Trả sách",
 subtitle: "Quản lý phiếu mượn, gia hạn và trả sách.",
 },
 overdue: {
 title: "Sách quá hạn",
 subtitle: "Theo dõi các phiếu mượn quá hạn.",
 },
 activity: {
 title: "Nhật ký hoạt động",
 subtitle: "Theo dõi các thay đổi và thao tác quan trọng trong thư viện.",
 },
 };

 const pages = {
 dashboard: (
 <Dashboard
 onAddBook={() => handleNavigateToCreate("books")}
 onAddReader={() => handleChangePage("readers")}
 onNavigateToBooks={() => handleChangePage("books")}
 onNavigateToAnalytics={() => handleChangePage("analytics")}
 onNavigateToReaders={() => handleChangePage("readers")}
 onNavigateToBorrow={() => handleChangePage("borrow")}
 onNavigateToOverdue={() => handleChangePage("overdue")}
 isAdmin={canManageLibrary}
 />
 ),
 operations: (
 <Operations
 isAdmin={canManageLibrary}
 onNavigateToBooks={() => handleChangePage("books")}
 onNavigateToBorrow={() => handleChangePage("borrow")}
 onNavigateToOverdue={() => handleChangePage("overdue")}
 onNavigateToReaders={() => handleChangePage("readers")}
 onNavigateToAnalytics={() => handleChangePage("analytics")}
 />
 ),
 analytics: (
 <Analytics
 onNavigateToBooks={() => handleChangePage("books")}
 onNavigateToBorrow={() => handleChangePage("borrow")}
 onNavigateToOverdue={() => handleChangePage("overdue")}
 />
 ),
 books: (
 <Books
 onSaveBook={canManageLibrary ? handleSaveBook : undefined}
 onDeleteBook={canManageLibrary ? handleDeleteBook : undefined}
 onEditBook={canManageLibrary ? (book) => handleEditBook(book, "books") : undefined}
 onNavigateToCreate={canManageLibrary ? () => handleNavigateToCreate("books") : undefined}
 onBorrowBook={!canManageLibrary ? handleBorrowBook : undefined}
 canManage={canManageLibrary}
 canBorrow={!canManageLibrary}
 />
 ),
 profile: !canManageLibrary ? <ReaderProfile user={user} /> : <Dashboard />,
 "add-book": canManageLibrary ? (
 <BookCreate
 onSaveBook={handleSaveBook}
 onCancel={handleCancelCreate}
 onDeleteBook={handleDeleteBook}
 editingBook={editingBook}
 />
 ) : (
 <Dashboard />
 ),
 readers: canManageLibrary ? (
 <Readers
 onNavigateToCreate={() => handleNavigateToCreate("readers")}
 onEditBook={(book) => handleEditBook(book, "readers")}
 onDeleteBook={handleDeleteBook}
 canManageRoles={isAdmin}
 />
 ) : (
 <Dashboard />
 ),
 catalog: canManageLibrary ? <Catalog /> : <Dashboard />,
 permissions: isAdmin ? <Permissions /> : <Dashboard />,
 borrow: <Borrow isAdmin={canManageLibrary} />,
 overdue: <Overdue isAdmin={canManageLibrary} />,
 activity: isAdmin ? <ActivityLog /> : <Dashboard />,
 };
 const activePageInfo = pageInfo[currentPage] || pageInfo.dashboard;
 const activeMenuItem = sidebarMenuItems.find((item) => item.id === currentPage);
 const activeSection = sidebarSections.find((section) => section.id === activeMenuItem?.section);
 const cleanPageSubtitles = {
 dashboard: "Nhìn tổng quan hoạt động thư viện.",
 operations: "Library OS gom cảnh báo, workflow và gợi ý hành động.",
 books: canManageLibrary ? "Theo dõi kho sách, chất lượng catalog và tồn kho." : "Tra cứu danh sách sách hiện có trong thư viện.",
 analytics: "Theo dõi xu hướng mượn trả, thể loại và chất lượng dữ liệu kho.",
 profile: "Theo dõi thông tin độc giả, sách đang mượn và lịch sử mượn trả.",
 "add-book": editingBook ? "Cập nhật thông tin chi tiết của sách." : "Nhập thông tin chi tiết để thêm sách vào thư viện.",
 readers: "Quản lý độc giả, Reader 360 và thông tin liên hệ.",
 catalog: "Chuẩn hóa thể loại và nhà xuất bản dùng khi nhập sách.",
 permissions: "Kiểm tra quyền theo vai trò admin, thủ thư và độc giả.",
 borrow: "Quản lý phiếu mượn, gia hạn và trả sách.",
 overdue: "Theo dõi các phiếu mượn quá hạn.",
 activity: "Theo dõi các thay đổi và thao tác quan trọng trong thư viện.",
 };
 const activePageContent = pages[currentPage] || pages.dashboard;

 const toggleSidebar = () => {
 setSidebarCollapsed((s) => {
 const next = !s;
 try {
 localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(next));
 // Mark that the user manually toggled the sidebar so auto-resize won't override
 localStorage.setItem(SIDEBAR_COLLAPSED_MANUAL_KEY, JSON.stringify(true));
 } catch {}
 return next;
 });
 };

 const toggleSidebarPin = () => {
 setSidebarPinned((pinned) => {
 const next = !pinned;

 try {
 localStorage.setItem(SIDEBAR_PINNED_KEY, JSON.stringify(next));
 localStorage.setItem(SIDEBAR_COLLAPSED_MANUAL_KEY, JSON.stringify(true));
 } catch {}

 if (next) {
 setSidebarCollapsed(false);
 try {
 localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(false));
 } catch {}
 }

 return next;
 });
 };

 const toggleFavoritePage = (page) => {
 setFavoritePages((pages) => {
 const next = pages.includes(page)
 ? pages.filter((item) => item !== page)
 : [...pages, page];

 try {
 localStorage.setItem(FAVORITE_PAGES_KEY, JSON.stringify(next));
 } catch {}

 return next;
 });
 };

 // Auto-update collapse state on window resize when the user hasn't manually toggled
 useEffect(() => {
 if (sidebarPinned) return undefined;

 let manual = false;
 try {
 manual = JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSED_MANUAL_KEY) || "false");
 } catch {}

 if (manual) return;

 const onResize = () => {
 const should = window.innerWidth < 1100;
 setSidebarCollapsed((current) => (current === should ? current : should));
 };

 window.addEventListener("resize", onResize);
 onResize();
 return () => window.removeEventListener("resize", onResize);
 }, [sidebarPinned]);

 useEffect(() => {
 const onOnline = () => setIsOnline(true);
 const onOffline = () => setIsOnline(false);

 window.addEventListener("online", onOnline);
 window.addEventListener("offline", onOffline);

 return () => {
 window.removeEventListener("online", onOnline);
 window.removeEventListener("offline", onOffline);
 };
 }, []);

 useEffect(() => {
 setRecentPages((pages) => {
 const next = [currentPage,...pages.filter((page) => page !== currentPage)].slice(0, 3);

 try {
 localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(next));
 } catch {}

 return next;
 });
 }, [currentPage]);

 useEffect(() => {
 let active = true;

 getStats().then((stats) => {
 if (active) applySidebarStats(stats);
 }).catch(() => {
 if (active) setSidebarBadges({ borrow: 0, overdue: 0 });
 });

 return () => {
 active = false;
 };
 }, [applySidebarStats, user?.id, user?.role]);

 useEffect(() => {
 refreshNotifications();
 }, [refreshNotifications, currentPage, user?.id, user?.role]);

 useEffect(() => {
 setSmartSearchData({
 books: [],
 readers: [],
 loans: [],
 reservations: [],
 catalog: { categories: [], publishers: [] },
 loaded: false,
 });
 }, [user?.id, user?.role]);

 useEffect(() => {
 if (commandOpen) {
 loadSmartSearchData();
 }
 }, [commandOpen, loadSmartSearchData]);

 useEffect(() => {
 const onKeyDown = (event) => {
 if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

 const tagName = event.target?.tagName?.toLowerCase();
 if (tagName === "input" || tagName === "textarea" || tagName === "select") return;

 const item = sidebarMenuItems.find((menuItem) => menuItem.shortcut === event.key && canUseMenuItem(menuItem));

 if (!item) return;

 event.preventDefault();
 handleChangePage(item.id);
 };

 window.addEventListener("keydown", onKeyDown);
 return () => window.removeEventListener("keydown", onKeyDown);
 }, [handleChangePage, canUseMenuItem]);

 useEffect(() => {
 localStorage.setItem(THEME_KEY, theme);
 localStorage.setItem(DENSITY_KEY, density);
 localStorage.setItem(FOCUS_MODE_KEY, JSON.stringify(focusMode));
 }, [theme, density, focusMode]);

 useEffect(() => {
 const onKeyDown = (event) => {
 const tagName = event.target?.tagName?.toLowerCase();
 const isTyping = tagName === "input" || tagName === "textarea" || tagName === "select";

 if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
 event.preventDefault();
 setCommandOpen(true);
 return;
 }

 if (event.key === "Escape" && commandOpen) {
 setCommandOpen(false);
 setCommandQuery("");
 }

 if (!isTyping && event.key === "?") {
 setCommandOpen(true);
 }
 };

 window.addEventListener("keydown", onKeyDown);
 return () => window.removeEventListener("keydown", onKeyDown);
 }, [commandOpen]);

 return (
 <div className={`app-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${focusMode ? "focus-mode" : ""} theme-${theme} density-${density}`}>
 <Sidebar
 currentPage={currentPage}
 onChangePage={handleSidebarChangePage}
 user={user}
 roleLabel={userRoleLabel}
 badgeCounts={sidebarBadges}
 isOnline={isOnline}
 pinned={sidebarPinned}
 recentPages={recentPages}
 favoritePages={favoritePages}
 collapsed={sidebarCollapsed}
 onTogglePin={toggleSidebarPin}
 onToggleFavorite={toggleFavoritePage}
 onToggleCollapse={toggleSidebar}
 />

 <main className="main-content">
 <Header
 title={activeMenuItem?.label || activePageInfo.title}
 subtitle={cleanPageSubtitles[currentPage] || activePageInfo.subtitle}
 user={user}
 roleLabel={userRoleLabel}
 currentPageLabel={activeMenuItem?.label || activePageInfo.title}
 currentPageId={currentPage}
 pageSectionLabel={activeSection?.label || "Library OS"}
 density={density}
 theme={theme}
 notifications={notifications}
 globalSearchItems={globalSearchItems}
 onNavigate={handleChangePage}
 onOpenCommand={() => setCommandOpen(true)}
 onLogout={onLogout}
 />

 <div className="workspace-preferences">
 <button type="button" onClick={() => setCommandOpen(true)}>Ctrl K</button>
 <button type="button" onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}>
 {theme === "dark" ? "Sáng" : "Tối"}
 </button>
 <button type="button" onClick={() => setDensity((value) => (value === "compact" ? "comfortable" : "compact"))}>
 {density === "compact" ? "Thoáng" : "Gọn"}
 </button>
 <button type="button" onClick={() => setFocusMode((value) => !value)}>
 {focusMode ? "Thoát focus" : "Focus"}
 </button>
 </div>

 <section className="page-content">
 {!canManageLibrary && (
 <div className="permission-banner">
 <strong>Quyền độc giả</strong>
 <span>Bạn có thể tra cứu sách, mượn sách và theo dõi phiếu mượn của mình. Các chức năng quản trị sách và độc giả được ẩn.</span>
 </div>
 )}
 {activePageContent}
 </section>
 </main>

 {borrowRequest?.book && (
 <div className="app-modal-backdrop" role="dialog" aria-modal="true">
 <div className="app-modal">
 <h3>Xác nhận mượn sách</h3>
 <p>
 Bạn muốn mượn sách "{borrowRequest.book.title}" trong 14 ngày?
 </p>
 <div className="modal-summary">
 <span>Tác giả: <strong>{borrowRequest.book.author || "-"}</strong></span>
 <span>Hạn trả: <strong>14 ngày</strong></span>
 </div>
 <div className="form-actions">
 <button className="primary-button" type="button" onClick={confirmBorrowBook} disabled={confirmingBorrow}>
 {confirmingBorrow ? "Đang mượn..." : "Xác nhận mượn"}
 </button>
 <button className="secondary-button" type="button" onClick={cancelBorrowBook} disabled={confirmingBorrow}>
 Hủy
 </button>
 </div>
 </div>
 </div>
 )}

 {commandOpen && (
 <div className="command-palette-backdrop" role="dialog" aria-modal="true">
 <div className="command-palette">
 <input
 autoFocus
 value={commandQuery}
 onChange={(event) => setCommandQuery(event.target.value)}
 placeholder="Tìm sách, độc giả, phiếu mượn, đặt trước, tác vụ..."
 />
 <div className="command-palette-meta">
 <span>Smart Search</span>
 <small>{smartSearchLoading ? "Đang nạp dữ liệu..." : `${commandResults.length} kết quả`}</small>
 </div>
 <div className="command-palette-list">
 {commandResults.map((item) => (
 <button
 type="button"
 key={item.id}
 onClick={() => {
 item.run?.();
 setCommandOpen(false);
 setCommandQuery("");
 }}
 >
 <span className={`command-kind ${String(item.kind || "item").toLowerCase().replace(/\s+/g, "-")}`}>{item.kind}</span>
 <strong>{item.title}</strong>
 <small>{item.meta}</small>
 </button>
 ))}
 {commandResults.length === 0 && <div className="command-empty">Không có lệnh phù hợp.</div>}
 </div>
 </div>
 </div>
 )}

 <LibraryAssistant canManageLibrary={canManageLibrary} isAdmin={isAdmin} onNavigate={handleChangePage} />
 </div>
 );
}

export default Layout;

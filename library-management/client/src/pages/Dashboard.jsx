import { useCallback, useEffect, useMemo, useState } from "react";
import {
 AlertTriangle,
 ArrowRight,
 BarChart3,
 BookCopy,
 BookOpen,
 CalendarClock,
 CheckCircle2,
 CircleDollarSign,
 Clock3,
 LibraryBig,
 PackagePlus,
 RefreshCw,
 Sparkles,
 Upload,
 UserPlus,
 Users,
} from "lucide-react";
import { read, utils } from "xlsx";
import { getStats, createBook, createReader, createBooksBulk } from "../services/api";

const formatCurrency = (value) =>
 new Intl.NumberFormat("vi-VN", {
 style: "currency",
 currency: "VND",
 maximumFractionDigits: 0,
 }).format(value || 0);

function getStatusLabel(status) {
 if (status === "borrowed") return "Đang mượn";
 if (status === "overdue") return "Quá hạn";
 if (status === "returned") return "Đã trả";
 return status;
}

function getDueSoonLabel(dueDate) {
 const today = new Date(new Date().toISOString().split("T")[0]);
 const due = new Date(dueDate);
 const daysLeft = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

 if (daysLeft <= 0) {
 return "Hôm nay";
 }

 return `Còn ${daysLeft} ngày`;
}

function clampPercentage(value) {
 if (!Number.isFinite(value)) return 0;
 return Math.min(100, Math.max(0, Math.round(value)));
}

function getInitial(value) {
 return String(value || "?").trim().charAt(0).toUpperCase() || "?";
}

function ImageUrlPreview({ url, alt, label, fallbackText = "Ảnh", shape = "cover" }) {
 const [failed, setFailed] = useState(false);

 useEffect(() => {
 setFailed(false);
 }, [url]);

 if (!url) return null;

 return (
 <div className={`inline-image-preview ${shape}`}>
 {!failed ? (
 <img src={url} alt={alt} onError={() => setFailed(true)} />
 ) : (
 <div className="inline-image-preview-empty">{fallbackText}</div>
 )}
 <span>
 <strong>{failed ? "URL ảnh không hợp lệ" : label}</strong>
 <small>{failed ? "Kiểm tra lại đường dẫn ảnh trước khi lưu." : "Ảnh sẽ được dùng trong hồ sơ hiển thị."}</small>
 </span>
 </div>
 );
}

function getLoanBadgeClass(status) {
 if (status === "borrowed") return "badge bg-success";
 if (status === "overdue") return "badge bg-danger";
 return "badge bg-secondary";
}

function splitCsvLine(line) {
 const values = [];
 let current = "";
 let inQuotes = false;

 for (let i = 0; i < line.length; i += 1) {
 const char = line[i];
 const nextChar = line[i + 1];

 if (char === '"') {
 if (inQuotes && nextChar === '"') {
 current += '"';
 i += 1;
 } else {
 inQuotes = !inQuotes;
 }
 continue;
 }

 if (char === "," && !inQuotes) {
 values.push(current);
 current = "";
 continue;
 }

 current += char;
 }

 values.push(current);
 return values;
}

function parseCsvToBooks(csvText) {
 const rows = csvText.trim().split(/\r?\n/).filter((line) => line.trim() !== "");
 if (rows.length < 2) {
 throw new Error("CSV phải có hàng header và ít nhất một dòng dữ liệu.");
 }

 const headers = splitCsvLine(rows[0]).map((header) => header.trim().toLowerCase());

 return rows.slice(1).map((line) => {
 const values = splitCsvLine(line).map((value) => value.trim());
 const book = {};
 headers.forEach((key, i) => {
 book[key] = values[i] ?? "";
 });
 return {
 title: book.title || book.name || "",
 imageUrl: book.imageurl || book.imageUrl || "",
 author: book.author || "",
 category: book.category || "",
 isbn: book.isbn || "",
 condition: book.condition || "good",
 publisher: book.publisher || "",
 year: book.year || "",
 quantity: Number(book.quantity || 0),
 shelfLocation: book.shelflocation || book.shelfLocation || "",
 description: book.description || "",
 };
 });
}

function parseXlsxToBooks(arrayBuffer) {
 const workbook = read(arrayBuffer, { type: "array" });
 const sheet = workbook.Sheets[workbook.SheetNames[0]];
 const jsonData = utils.sheet_to_json(sheet, { defval: "" });

 return jsonData.map((book) => ({
 title: book.title || book.name || "",
 imageUrl: book.imageurl || book.imageUrl || "",
 author: book.author || "",
 category: book.category || "",
 isbn: book.isbn || "",
 condition: book.condition || "good",
 publisher: book.publisher || "",
 year: book.year || "",
 quantity: Number(book.quantity || 0),
 shelfLocation: book.shelflocation || book.shelfLocation || "",
 description: book.description || "",
 }));
}

function validateBookRow(book, index) {
 const errors = [];
 if (!String(book.title || "").trim()) {
 errors.push("Thiếu trường title.");
 }
 if (!String(book.author || "").trim()) {
 errors.push("Thiếu trường author.");
 }
 if (!String(book.category || "").trim()) {
 errors.push("Thiếu trường category.");
 }
 if (!Number.isFinite(Number(book.quantity)) || Number(book.quantity) < 0) {
 errors.push("Trường quantity phải là số >= 0.");
 }

 return {
 index,
 errors,
 book,
 };
}

function validateBulkRows(rows) {
 return rows.map((book, index) => validateBookRow(book, index));
}

function downloadFile(content, filename, type) {
 const blob = new Blob([content], { type });
 const url = URL.createObjectURL(blob);
 const link = document.createElement("a");
 link.href = url;
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
}

function downloadCsvTemplate() {
 const headers = [
 "title",
 "author",
 "category",
 "publisher",
 "year",
 "quantity",
 "shelfLocation",
 "description",
 "imageUrl",
 ];
 const exampleRow = [
 "Clean Code",
 "Robert C. Martin",
 "Lập trình",
 "Prentice Hall",
 "2008",
 "10",
 "Kệ A1",
 "Sách về mã sạch và thiết kế phần mềm",
 "https://example.com/clean-code.jpg",
 ];
 downloadFile([headers.join(","), exampleRow.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")].join("\n"), "template-sach.csv", "text/csv;charset=utf-8;");
}

function Dashboard({
 onAddBook,
 onAddReader,
 onNavigateToBooks,
 onNavigateToAnalytics,
 onNavigateToReaders,
 onNavigateToBorrow,
 onNavigateToOverdue,
 isAdmin,
}) {
 const [summary, setSummary] = useState({
 totalBooks: 0,
 readers: 0,
 borrowed: 0,
 overdue: 0,
 dueSoon: 0,
 totalFines: 0,
 waitingReservations: 0,
 availableBooks: 0,
 lowStockBooks: [],
 popularBooks: [],
 topReaders: [],
 todayActivity: {
 borrowed: 0,
 returned: 0,
 fines: 0,
 },
 fineSummary: {
 unpaid: 0,
 paid: 0,
 waived: 0,
 paidAmount: 0,
 },
 missingImageBooks: 0,
 monthlyActivity: [],
 monthlyFines: [],
 reminders: [],
 recentLoans: [],
 dueSoonLoans: [],
 roleSummary: { admins: 0, librarians: 0, members: 0, locked: 0 },
 notificationDigest: { total: 0, danger: 0, warning: 0, success: 0, info: 0 },
 reservationQueue: { totalWaiting: 0, readyToFulfill: 0, blockedByStock: 0 },
 bookForecast: [],
 hotCategories: [],
 topReservationBooks: [],
 });
 const [error, setError] = useState("");
 const [loadingStats, setLoadingStats] = useState(true);
 const [showBookModal, setShowBookModal] = useState(false);
 const [showReaderModal, setShowReaderModal] = useState(false);

 const [bookForm, setBookForm] = useState({
 title: "",
 imageUrl: "",
 author: "",
 category: "",
 publisher: "",
 year: "",
 quantity: 1,
 shelfLocation: "",
 description: "",
 });

 const [readerForm, setReaderForm] = useState({ name: "", email: "", phone: "", profileImageUrl: "" });
 const [bulkImporting, setBulkImporting] = useState(false);
 const [showBulkModal, setShowBulkModal] = useState(false);
 const [bulkInput, setBulkInput] = useState("");
 const [bulkFileName, setBulkFileName] = useState("");
 const [bulkError, setBulkError] = useState("");
 const [bulkPreviewRows, setBulkPreviewRows] = useState([]);
 const [bulkRowErrors, setBulkRowErrors] = useState([]);

 const refreshStats = useCallback(async () => {
 setLoadingStats(true);
 setError("");

 try {
 const data = await getStats();
 setSummary({
 totalBooks: data.totalBooks ?? 0,
 readers: data.readers ?? 0,
 borrowed: data.borrowed ?? 0,
 overdue: data.overdue ?? 0,
 dueSoon: data.dueSoon ?? 0,
 waitingReservations: data.waitingReservations ?? 0,
 totalFines: data.totalFines ?? 0,
 availableBooks: data.availableBooks ?? 0,
 missingImageBooks: data.missingImageBooks ?? 0,
 lowStockBooks: data.lowStockBooks ?? [],
 popularBooks: data.popularBooks ?? [],
 topReaders: data.topReaders ?? [],
 todayActivity: data.todayActivity ?? { borrowed: 0, returned: 0, fines: 0 },
 fineSummary: data.fineSummary ?? { unpaid: 0, paid: 0, waived: 0, paidAmount: 0 },
 monthlyActivity: data.monthlyActivity ?? [],
 monthlyFines: data.monthlyFines ?? [],
 reminders: data.reminders ?? [],
 recentLoans: data.recentLoans ?? [],
 dueSoonLoans: data.dueSoonLoans ?? [],
 roleSummary: data.roleSummary ?? { admins: 0, librarians: 0, members: 0, locked: 0 },
 notificationDigest: data.notificationDigest ?? { total: 0, danger: 0, warning: 0, success: 0, info: 0 },
 reservationQueue: data.reservationQueue ?? { totalWaiting: 0, readyToFulfill: 0, blockedByStock: 0 },
 bookForecast: data.bookForecast ?? [],
 hotCategories: data.hotCategories ?? [],
 topReservationBooks: data.topReservationBooks ?? [],
 });
 } catch (err) {
 setError(err.message || "Không thể tải thống kê.");
 } finally {
 setLoadingStats(false);
 }
 }, []);

 useEffect(() => {
 refreshStats();
 }, [refreshStats]);

 const dashboardHealth = useMemo(() => {
 const activeLoans = summary.borrowed + summary.overdue;
 const borrowedRate = summary.totalBooks
 ? clampPercentage((activeLoans / summary.totalBooks) * 100)
 : 0;
 const availableRate = summary.totalBooks
 ? clampPercentage((summary.availableBooks / summary.totalBooks) * 100)
 : 0;
 const overdueRate = activeLoans ? clampPercentage((summary.overdue / activeLoans) * 100) : 0;
 const lowStockPenalty = clampPercentage((summary.lowStockBooks.length / Math.max(summary.totalBooks, 1)) * 100);
 const missingImagePenalty = clampPercentage((summary.missingImageBooks / Math.max(summary.totalBooks, 1)) * 60);
 const score = clampPercentage(100 - overdueRate - lowStockPenalty - missingImagePenalty);

 return {
 activeLoans,
 borrowedRate,
 availableRate,
 overdueRate,
 score,
 lowStockPenalty,
 missingImagePenalty,
 };
 }, [summary]);

 const actionItems = useMemo(
 () =>
 [
 summary.overdue > 0 && {
 tone: "danger",
 title: `${summary.overdue} phiếu quá hạn`,
 detail: `Phạt dự kiến ${formatCurrency(summary.totalFines)}.`,
 },
 summary.dueSoon > 0 && {
 tone: "warning",
 title: `${summary.dueSoon} phiếu sắp đến hạn`,
 detail: "Nên nhắc độc giả trả hoặc gia hạn sớm.",
 },
 summary.lowStockBooks.length > 0 && {
 tone: "muted",
 title: `${summary.lowStockBooks.length} sách sắp hết`,
 detail: "Kiểm tra tồn kho và cân nhắc nhập thêm.",
 },
 summary.missingImageBooks > 0 && {
 tone: "muted",
 title: `${summary.missingImageBooks} sách thiếu ảnh`,
 detail: "Bổ sung ảnh bìa để trang tra cứu trực quan hơn.",
 },
 summary.readers === 0 && {
 tone: "muted",
 title: "Chưa có độc giả",
 detail: "Thêm độc giả để bắt đầu quản lý mượn trả.",
 },
 ].filter(Boolean),
 [summary]
 );

 const openBookModal = () => setShowBookModal(true);
 const closeBookModal = () => setShowBookModal(false);
 const openReaderModal = () => setShowReaderModal(true);
 const closeReaderModal = () => setShowReaderModal(false);

 const handleBookChange = (e) => setBookForm({...bookForm, [e.target.name]: e.target.value });
 const handleReaderChange = (e) => setReaderForm({...readerForm, [e.target.name]: e.target.value });

 const submitBook = async (e) => {
 e.preventDefault();
 try {
 await createBook({
 title: bookForm.title,
 imageUrl: bookForm.imageUrl,
 author: bookForm.author,
 category: bookForm.category,
 publisher: bookForm.publisher,
 year: bookForm.year,
 quantity: Number(bookForm.quantity || 0),
 shelfLocation: bookForm.shelfLocation,
 description: bookForm.description,
 });
 closeBookModal();
 await refreshStats();
 } catch (err) {
 alert(err.message || "Không thể tạo sách.");
 }
 };

 const submitReader = async (e) => {
 e.preventDefault();
 try {
 await createReader({
 name: readerForm.name,
 email: readerForm.email,
 phone: readerForm.phone,
 profileImageUrl: readerForm.profileImageUrl,
 });
 setReaderForm({ name: "", email: "", phone: "", profileImageUrl: "" });
 closeReaderModal();
 await refreshStats();
 } catch (err) {
 alert(err.message || "Không thể tạo độc giả.");
 }
 };

 const openBulkModal = () => {
 setBulkInput("");
 setBulkFileName("");
 setBulkError("");
 setShowBulkModal(true);
 };

 const closeBulkModal = () => {
 setShowBulkModal(false);
 };

 const handleBulkFileChange = async (event) => {
 const file = event.target.files?.[0];
 if (!file) {
 setBulkFileName("");
 return;
 }

 setBulkFileName(file.name);
 const lowerFileName = file.name.toLowerCase();

 try {
 let books = [];

 if (lowerFileName.endsWith(".json")) {
 const content = await file.text();
 setBulkInput(content);
 books = JSON.parse(content);
 } else if (lowerFileName.endsWith(".csv")) {
 const content = await file.text();
 books = parseCsvToBooks(content);
 setBulkInput(JSON.stringify(books, null, 2));
 } else if (lowerFileName.endsWith(".xlsx")) {
 const arrayBuffer = await file.arrayBuffer();
 books = parseXlsxToBooks(arrayBuffer);
 setBulkInput(JSON.stringify(books, null, 2));
 } else {
 setBulkError("Chỉ chấp nhận file JSON, CSV hoặc XLSX.");
 return;
 }

 if (!Array.isArray(books)) {
 throw new Error("Dữ liệu phải là mảng các sách.");
 }

 const preview = books.map((book) => ({...book,
 quantity: Number(book.quantity || 0),
 }));
 setBulkPreviewRows(preview);
 setBulkRowErrors(validateBulkRows(preview));
 setBulkError("");
 } catch (err) {
 setBulkError(err.message || "Lỗi khi phân tích file nhập.");
 setBulkInput("");
 setBulkPreviewRows([]);
 setBulkRowErrors([]);
 }
 };

 const handleBulkInputChange = (event) => {
 const value = event.target.value;
 setBulkInput(value);
 setBulkFileName("");
 setBulkError("");

 try {
 const books = JSON.parse(value);
 if (!Array.isArray(books)) {
 throw new Error("Dữ liệu phải là mảng các sách.");
 }
 const preview = books.map((book) => ({...book,
 quantity: Number(book.quantity || 0),
 }));
 setBulkPreviewRows(preview);
 setBulkRowErrors(validateBulkRows(preview));
 } catch {
 setBulkPreviewRows([]);
 setBulkRowErrors([]);
 }
 };

 const submitBulkBooks = async (event) => {
 event.preventDefault();
 if (!bulkInput.trim()) {
 setBulkError("Vui lòng nhập dữ liệu JSON hoặc tải file CSV/JSON.");
 return;
 }

 let books;
 try {
 books = JSON.parse(bulkInput);
 if (!Array.isArray(books)) {
 throw new Error("Dữ liệu phải là mảng các sách.");
 }
 } catch (err) {
 setBulkError(err.message || "Dữ liệu JSON không hợp lệ.");
 return;
 }

 const preview = books.map((book) => ({...book,
 quantity: Number(book.quantity || 0),
 }));
 const rowErrors = validateBulkRows(preview);
 const invalidRows = rowErrors.filter((item) => item.errors.length > 0);

 if (invalidRows.length > 0) {
 setBulkRowErrors(rowErrors);
 setBulkError("Vui lòng sửa lỗi dữ liệu trước khi nhập.");
 return;
 }

 try {
 setBulkImporting(true);
 await createBooksBulk(preview);
 await refreshStats();
 alert(`Đã thêm ${preview.length} sách vào thư viện.`);
 closeBulkModal();
 } catch (err) {
 setBulkError(err.message || "Không thể thêm sách bulk.");
 } finally {
 setBulkImporting(false);
 }
 };

 const sampleBooks = [
 {
 title: "Clean Code",
 author: "Robert C. Martin",
 category: "Lập trình",
 publisher: "Prentice Hall",
 year: "2008",
 quantity: 8,
 shelfLocation: "Kệ A1",
 description: "Hướng dẫn viết mã sạch và dễ bảo trì.",
 },
 {
 title: "Design Patterns",
 author: "Erich Gamma",
 category: "Lập trình",
 publisher: "Addison-Wesley",
 year: "1994",
 quantity: 5,
 shelfLocation: "Kệ A2",
 description: "Các mẫu thiết kế phần mềm phổ biến.",
 },
 {
 title: "JavaScript: The Good Parts",
 author: "Douglas Crockford",
 category: "Lập trình",
 publisher: "O'Reilly Media",
 year: "2008",
 quantity: 6,
 shelfLocation: "Kệ B3",
 description: "Tổng hợp những phần tốt nhất của JavaScript.",
 },
 {
 title: "Deep Learning",
 author: "Ian Goodfellow",
 category: "AI/ML",
 publisher: "MIT Press",
 year: "2016",
 quantity: 4,
 shelfLocation: "Kệ C1",
 description: "Giới thiệu các thuật toán học sâu.",
 },
 {
 title: "Clean Architecture",
 author: "Robert C. Martin",
 category: "Lập trình",
 publisher: "Prentice Hall",
 year: "2017",
 quantity: 7,
 shelfLocation: "Kệ A1",
 description: "Nguyên lý xây dựng kiến trúc phần mềm bền vững.",
 },
 ];

 const importSampleBooks = async () => {
 if (!isAdmin) return;

 setBulkImporting(true);
 try {
 await createBooksBulk(sampleBooks);
 await refreshStats();
 alert("Đã thêm 5 sách mẫu vào thư viện.");
 } catch (err) {
 alert(err.message || "Không thể thêm sách mẫu.");
 } finally {
 setBulkImporting(false);
 }
 };

 const stats = [
 { label: "Tổng số sách", value: summary.totalBooks, helper: "Đầu sách trong kho", tone: "primary", icon: LibraryBig },
 { label: "Sách còn lại", value: summary.availableBooks, helper: "Có thể cho mượn", tone: "success", icon: BookOpen },
 { label: isAdmin ? "Độc giả" : "Hồ sơ độc giả", value: summary.readers, helper: "Hồ sơ đang quản lý", tone: "info", icon: Users },
 { label: "Đang mượn", value: summary.borrowed, helper: "Phiếu còn hạn", tone: "warning", icon: BookCopy },
 { label: "Sắp đến hạn", value: summary.dueSoon, helper: "Trong 3 ngày tới", tone: "warning", icon: CalendarClock },
 { label: "Quá hạn", value: summary.overdue, helper: "Cần xử lý", tone: summary.overdue > 0 ? "danger" : "success", icon: AlertTriangle },
 { label: "Phạt dự kiến", value: formatCurrency(summary.totalFines), helper: "20.000đ/ngày trễ", tone: "danger", icon: CircleDollarSign },
 { label: "Phạt đã thu", value: formatCurrency(summary.fineSummary.paidAmount), helper: `${summary.fineSummary.paid} phiếu`, tone: "success", icon: CheckCircle2 },
 { label: "Phạt chưa thu", value: summary.fineSummary.unpaid, helper: "Phiếu còn nợ phạt", tone: summary.fineSummary.unpaid > 0 ? "danger" : "success", icon: Clock3 },
 ];

 const quickActions = [
 {
 title: "Quản lý sách",
 detail: "Tra cứu tồn kho, lọc trạng thái và xem lịch sử mượn từng sách.",
 meta: `${summary.availableBooks} sách còn sẵn`,
 tone: "primary",
 icon: BookOpen,
 onClick: onNavigateToBooks,
 },
 {
 title: "Phân tích thư viện",
 detail: "Xem biểu đồ thể loại, top sách được mượn và xu hướng mượn trả theo tháng.",
 meta: "Báo cáo",
 tone: "primary",
 icon: BarChart3,
 onClick: onNavigateToAnalytics,
 },
 isAdmin && {
 title: "Thêm sách mới",
 detail: "Tạo đầu sách mới hoặc nhập nhanh bằng form quản trị.",
 meta: "Quản trị",
 tone: "success",
 icon: PackagePlus,
 onClick: onAddBook,
 },
 isAdmin && {
 title: "Độc giả",
 detail: "Quản lý hồ sơ, trạng thái mượn, quá hạn và tiền phạt.",
 meta: `${summary.readers} hồ sơ`,
 tone: "info",
 icon: Users,
 onClick: onNavigateToReaders || onAddReader,
 },
 {
 title: "Mượn / Trả sách",
 detail: "Lập phiếu mượn, trả sách, gia hạn và tính phạt 20.000đ/ngày.",
 meta: `${dashboardHealth.activeLoans} phiếu hoạt động`,
 tone: "warning",
 icon: BookCopy,
 onClick: onNavigateToBorrow,
 },
 {
 title: "Sách quá hạn",
 detail: "Theo dõi các phiếu trễ hạn và tổng tiền phạt dự kiến.",
 meta: `${summary.overdue} quá hạn`,
 tone: summary.overdue > 0 ? "danger" : "muted",
 icon: AlertTriangle,
 onClick: onNavigateToOverdue,
 },
 ].filter(Boolean);

 const bigUpdates = [
 {
 label: "1. Phân quyền rõ ràng",
 value: isAdmin
 ? `${summary.roleSummary.admins} admin / ${summary.roleSummary.librarians} thủ thư`
 : "Tài khoản độc giả",
 detail: isAdmin
 ? `${summary.roleSummary.members} thành viên, ${summary.roleSummary.locked} tài khoản đang khóa`
 : "Bạn chỉ nhìn thấy hồ sơ và nghiệp vụ của mình.",
 tone: summary.roleSummary.locked > 0 ? "warning" : "primary",
 onClick: onNavigateToReaders,
 },
 {
 label: "2. Đặt trước sách",
 value: `${summary.reservationQueue.totalWaiting} đang chờ`,
 detail: `${summary.reservationQueue.readyToFulfill} có thể chuyển sang mượn, ${summary.reservationQueue.blockedByStock} còn chờ sách`,
 tone: summary.reservationQueue.totalWaiting > 0 ? "warning" : "success",
 onClick: onNavigateToBorrow,
 },
 {
 label: "3. Thông báo hệ thống",
 value: `${summary.notificationDigest.total} nhắc việc`,
 detail: `${summary.notificationDigest.danger} khẩn cấp, ${summary.notificationDigest.warning} cần theo dõi`,
 tone: summary.notificationDigest.danger > 0 ? "danger" : summary.notificationDigest.warning > 0 ? "warning" : "success",
 onClick: onNavigateToBorrow,
 },
 {
 label: "4. Dashboard thông minh",
 value: summary.hotCategories[0]?.category || "Chưa có xu hướng",
 detail: summary.hotCategories[0]
 ? `Điểm nhu cầu ${summary.hotCategories[0].demandScore}, ${summary.hotCategories[0].waitingReservations} đặt trước`
 : "Sẽ tự cập nhật khi có dữ liệu mượn/đặt trước.",
 tone: "primary",
 onClick: onNavigateToAnalytics,
 },
 {
 label: "5. UX ổn định hơn",
 value: `${dashboardHealth.score}/100`,
 detail: `${summary.missingImageBooks} sách thiếu ảnh, ${summary.lowStockBooks.length} sách cần kiểm kho`,
 tone: dashboardHealth.score >= 80 ? "success" : dashboardHealth.score >= 55 ? "warning" : "danger",
 onClick: onNavigateToBooks,
 },
 ];

 const commandCenter = isAdmin
 ? {
 eyebrow: "Admin Command Center",
 title: "Trung tâm điều hành thư viện",
 detail: "Ưu tiên nghiệp vụ cho thủ thư: quá hạn, tồn kho, phạt và đặt trước.",
 lanes: [
 {
 tone: "danger",
 title: "Quá hạn",
 detail: `${summary.overdue} phiếu cần xử lý`,
 action: "Mở danh sách",
 onClick: onNavigateToOverdue,
 },
 {
 tone: "warning",
 title: "Sắp đến hạn",
 detail: `${summary.dueSoon} phiếu trong 3 ngày tới`,
 action: "Điều phối mượn trả",
 onClick: onNavigateToBorrow,
 },
 {
 tone: "primary",
 title: "Kho sách",
 detail: `${summary.lowStockBooks.length} sách sắp hết, ${summary.missingImageBooks} thiếu ảnh`,
 action: "Kiểm tra kho",
 onClick: onNavigateToBooks,
 },
 {
 tone: "warning",
 title: "Phạt & đặt trước",
 detail: `${summary.fineSummary.unpaid} phiếu phạt chưa thu, ${summary.waitingReservations} đặt trước đang chờ`,
 action: "Mở nghiệp vụ",
 onClick: onNavigateToBorrow,
 },
 ],
 }
 : {
 eyebrow: "Reader Command Center",
 title: "Trung tâm hồ sơ đọc",
 detail: "Tập trung vào sách đang mượn, hạn trả, tiền phạt và lịch sử đọc của bạn.",
 lanes: [
 {
 tone: summary.overdue > 0 ? "danger" : "success",
 title: "Sách quá hạn",
 detail: `${summary.overdue} phiếu cần xử lý`,
 action: "Xem quá hạn",
 onClick: onNavigateToOverdue,
 },
 {
 tone: summary.dueSoon > 0 ? "warning" : "success",
 title: "Sắp đến hạn",
 detail: `${summary.dueSoon} phiếu trong 3 ngày tới`,
 action: "Xem mượn trả",
 onClick: onNavigateToBorrow,
 },
 {
 tone: "primary",
 title: "Tìm sách",
 detail: `${summary.availableBooks} sách đang có thể mượn`,
 action: "Mở kho sách",
 onClick: onNavigateToBooks,
 },
 {
 tone: summary.totalFines > 0 ? "warning" : "success",
 title: "Tiền phạt",
 detail: `${formatCurrency(summary.totalFines)} phạt dự kiến`,
 action: "Kiểm tra hồ sơ",
 onClick: onNavigateToBorrow,
 },
 ],
 };

 const statusChartTotal = Math.max(1, summary.borrowed + summary.overdue + summary.dueSoon);
 const statusChartItems = [
 { label: "Đang mượn", value: summary.borrowed, tone: "success" },
 { label: "Sắp đến hạn", value: summary.dueSoon, tone: "warning" },
 { label: "Quá hạn", value: summary.overdue, tone: "danger" },
 ];
 const monthlyChartMax = Math.max(
 1,...summary.monthlyActivity.map((item) => Math.max(Number(item.borrowed || 0), Number(item.returned || 0)))
 );
 const monthlyFineMax = Math.max(
 1,...summary.monthlyFines.map((item) =>
 Math.max(Number(item.paid || 0), Number(item.unpaid || 0), Number(item.waived || 0))
 )
 );
 const operatingSnapshot = [
 {
 label: "Ưu tiên hôm nay",
 value: summary.overdue > 0 ? `${summary.overdue} quá hạn` : `${summary.dueSoon} sắp đến hạn`,
 detail: summary.overdue > 0 ? "Xử lý phiếu quá hạn trước" : "Nhắc lịch trả sách sớm",
 tone: summary.overdue > 0 ? "danger" : summary.dueSoon > 0 ? "warning" : "success",
 onClick: summary.overdue > 0 ? onNavigateToOverdue : onNavigateToBorrow,
 },
 {
 label: "Kho sách",
 value: `${summary.availableBooks}/${summary.totalBooks}`,
 detail: `${summary.lowStockBooks.length} sách sắp hết, ${summary.missingImageBooks} thiếu ảnh`,
 tone: summary.lowStockBooks.length || summary.missingImageBooks ? "warning" : "success",
 onClick: onNavigateToBooks,
 },
 {
 label: "Đặt trước",
 value: summary.waitingReservations,
 detail: "Yêu cầu đang chờ xử lý",
 tone: summary.waitingReservations > 0 ? "warning" : "success",
 onClick: onNavigateToBorrow,
 },
 {
 label: "Tiền phạt",
 value: formatCurrency(summary.totalFines),
 detail: `${summary.fineSummary.unpaid} phiếu chưa thu`,
 tone: summary.fineSummary.unpaid > 0 ? "danger" : "success",
 onClick: onNavigateToBorrow,
 },
 ];
 const smartAlerts = [
 {
 label: "Ưu tiên cao",
 title: summary.overdue > 0 ? `${summary.overdue} phiếu quá hạn cần xử lý` : "Không có phiếu quá hạn",
 detail: summary.overdue > 0 ? "Mở danh sách quá hạn để gia hạn, thu phạt hoặc nhắc trả." : "Luồng mượn trả đang trong ngưỡng an toàn.",
 tone: summary.overdue > 0 ? "danger" : "success",
 onClick: onNavigateToOverdue,
 },
 {
 label: "Tồn kho",
 title: summary.lowStockBooks.length > 0 ? `${summary.lowStockBooks.length} sách sắp hết hoặc hết` : "Tồn kho ổn định",
 detail: summary.lowStockBooks.length > 0 ? "Kiểm kê nhóm sách còn rất ít bản để tránh gián đoạn mượn." : "Không có đầu sách cần bổ sung ngay.",
 tone: summary.lowStockBooks.length > 0 ? "warning" : "success",
 onClick: onNavigateToBooks,
 },
 {
 label: "Dữ liệu",
 title: summary.missingImageBooks > 0 ? `${summary.missingImageBooks} sách thiếu ảnh bìa` : "Ảnh bìa đầy đủ",
 detail: summary.missingImageBooks > 0 ? "Bổ sung ảnh giúp card sách và tra cứu trực quan hơn." : "Dữ liệu hiển thị đang gọn gàng.",
 tone: summary.missingImageBooks > 0 ? "warning" : "success",
 onClick: onNavigateToBooks,
 },
 {
 label: "Đặt trước",
 title: summary.waitingReservations > 0 ? `${summary.waitingReservations} yêu cầu đang chờ` : "Không có yêu cầu chờ",
 detail: summary.waitingReservations > 0 ? "Ưu tiên xử lý hàng chờ để giảm thời gian độc giả đợi sách." : "Không có hàng chờ cần điều phối.",
 tone: summary.waitingReservations > 0 ? "warning" : "success",
 onClick: onNavigateToBorrow,
 },
 ];

 const dashboardSlaItems = [
 {
 label: "Quá hạn",
 current: summary.overdue,
 target: "0 phiếu",
 detail: summary.overdue > 0 ? "Cần kéo về 0 trước cuối ngày" : "Đang đạt mục tiêu",
 tone: summary.overdue > 0 ? "danger" : "success",
 percent: summary.overdue > 0 ? Math.max(10, Math.min(100, summary.overdue * 18)) : 100,
 },
 {
 label: "Sắp đến hạn",
 current: summary.dueSoon,
 target: "Nhắc trước 3 ngày",
 detail: summary.dueSoon > 0 ? "Có phiếu cần nhắc độc giả" : "Không có phiếu cần nhắc",
 tone: summary.dueSoon > 0 ? "warning" : "success",
 percent: summary.dueSoon > 0 ? Math.max(12, Math.min(100, summary.dueSoon * 16)) : 100,
 },
 {
 label: "Dữ liệu bìa sách",
 current: summary.missingImageBooks,
 target: "0 thiếu ảnh",
 detail: summary.missingImageBooks > 0 ? "Bổ sung ảnh để cải thiện tra cứu" : "Đã đầy đủ ảnh bìa",
 tone: summary.missingImageBooks > 0 ? "warning" : "success",
 percent: summary.totalBooks ? clampPercentage(((summary.totalBooks - summary.missingImageBooks) / summary.totalBooks) * 100) : 100,
 },
 {
 label: "Tiền phạt chưa thu",
 current: summary.fineSummary.unpaid,
 target: "0 phiếu",
 detail: summary.fineSummary.unpaid > 0 ? "Cần thu hoặc miễn phạt" : "Không có nợ phạt",
 tone: summary.fineSummary.unpaid > 0 ? "danger" : "success",
 percent: summary.fineSummary.unpaid > 0 ? Math.max(10, Math.min(100, summary.fineSummary.unpaid * 18)) : 100,
 },
 ];

 return (
 <div className="page-shell dashboard-page">
 <div className="dashboard-hero d-flex align-items-start justify-content-between mb-3">
 <div className="page-title">
 <span className="dashboard-eyebrow">
 <Sparkles size={16} />
 Bảng điều khiển thư viện
 </span>
 <h2 className="h4">Tổng quan</h2>
 <p className="text-muted">Theo dõi nhanh hoạt động, tồn kho và tình trạng mượn trả của thư viện.</p>
 <div className="dashboard-hero-meta">
 <span>{dashboardHealth.activeLoans} phiếu đang hoạt động</span>
 <span>{summary.availableBooks} sách có thể mượn</span>
 <span>{formatCurrency(summary.totalFines)} phạt dự kiến</span>
 </div>
 </div>

 <div className="dashboard-toolbar btn-group">
 {isAdmin && (
 <>
 <button className="btn btn-primary btn-sm" onClick={openBookModal}>
 <PackagePlus size={16} />
 <span>Thêm sách</span>
 </button>
 <button className="btn btn-outline-primary btn-sm" onClick={openReaderModal}>
 <UserPlus size={16} />
 <span>Thêm độc giả</span>
 </button>
 <button className="btn btn-outline-info btn-sm" onClick={openBulkModal}>
 <Upload size={16} />
 <span>Nhập sách</span>
 </button>
 <button
 className="btn btn-outline-secondary btn-sm"
 onClick={importSampleBooks}
 disabled={bulkImporting}
 >
 <Sparkles size={16} />
 <span>{bulkImporting ? "Đang thêm..." : "Sách mẫu"}</span>
 </button>
 </>
 )}

 <button className="btn btn-outline-success btn-sm" onClick={onNavigateToBorrow}>
 <BookCopy size={16} />
 <span>Mượn sách</span>
 </button>
 <button className="btn btn-outline-secondary btn-sm" onClick={refreshStats} disabled={loadingStats}>
 <RefreshCw size={16} />
 <span>{loadingStats ? "Đang tải..." : "Là m mới"}</span>
 </button>
 </div>
 </div>

 {error && <div className="alert alert-danger">{error}</div>}

 <div className="row g-3 mb-4">
 {stats.map((item) => {
 const Icon = item.icon;

 return (
 <div className="col-6 col-md-4 col-lg-3" key={item.label}>
 <div className={`card h-100 shadow-sm dashboard-stat-card ${item.tone}`}>
 <div className="card-body">
 <span className="dashboard-stat-icon">
 <Icon size={20} />
 </span>
 <p className="mb-1 text-muted small">{item.label}</p>
 <h3 className="mb-0">{item.value}</h3>
 <span>{item.helper}</span>
 </div>
 </div>
 </div>
 );
 })}
 </div>

 <div className="smart-alert-grid mb-4">
 {smartAlerts.map((alert) => (
 <button className={`smart-alert-card ${alert.tone}`} type="button" key={alert.label} onClick={alert.onClick}>
 <span>{alert.label}</span>
 <strong>{alert.title}</strong>
 <small>{alert.detail}</small>
 </button>
 ))}
 </div>

 <div className="dashboard-alert-strip mb-4">
 <button type="button" onClick={onNavigateToOverdue} className={summary.overdue > 0 ? "danger" : "success"}>
 <AlertTriangle size={22} />
 <strong>{summary.overdue}</strong>
 <span>Phiếu quá hạn</span>
 </button>
 <button type="button" onClick={onNavigateToBooks} className={summary.lowStockBooks.length > 0 ? "warning" : "success"}>
 <PackagePlus size={22} />
 <strong>{summary.lowStockBooks.length}</strong>
 <span>Sách sắp hết</span>
 </button>
 <button type="button" onClick={onNavigateToBooks} className={summary.missingImageBooks > 0 ? "warning" : "success"}>
 <BookOpen size={22} />
 <strong>{summary.missingImageBooks}</strong>
 <span>Sách thiếu ảnh</span>
 </button>
 <button type="button" onClick={onNavigateToBorrow} className={summary.waitingReservations > 0 ? "warning" : "success"}>
 <Clock3 size={22} />
 <strong>{summary.waitingReservations}</strong>
 <span>Đặt trước chờ</span>
 </button>
 </div>

 <div className="operating-snapshot-grid mb-4">
 {operatingSnapshot.map((item) => (
 <button className={`operating-snapshot-card ${item.tone}`} type="button" key={item.label} onClick={item.onClick}>
 <span>{item.label}</span>
 <strong>{item.value}</strong>
 <small>{item.detail}</small>
 </button>
 ))}
 </div>

 <div className="dashboard-sla-strip mb-4">
 {dashboardSlaItems.map((item) => (
 <section className={`dashboard-sla-card ${item.tone}`} key={item.label}>
 <div>
 <span>{item.label}</span>
 <strong>{item.current}</strong>
 <small>Mục tiêu: {item.target}</small>
 </div>
 <div className="dashboard-sla-meter" aria-hidden="true">
 <span style={{ width: `${item.percent}%` }} />
 </div>
 <p>{item.detail}</p>
 </section>
 ))}
 </div>

 <div className="dashboard-command-center mb-4">
 <div className="command-center-header">
 <div>
 <span className="page-eyebrow">{commandCenter.eyebrow}</span>
 <h3>{commandCenter.title}</h3>
 <p>{commandCenter.detail}</p>
 </div>
 <button className="secondary-button" type="button" onClick={refreshStats} disabled={loadingStats}>
 <RefreshCw size={16} />
 <span>{loadingStats ? "Đang tải..." : "Là m mới"}</span>
 </button>
 </div>
 <div className="command-lane-grid">
 {commandCenter.lanes.map((lane) => (
 <div className={`command-lane ${lane.tone}`} key={lane.title}>
 <strong>{lane.title}</strong>
 <span>{lane.detail}</span>
 <button type="button" onClick={lane.onClick}>{lane.action}</button>
 </div>
 ))}
 </div>
 </div>

 <div className="table-card big-update-panel mb-4">
 <div className="table-card-header row-between">
 <div>
 <span className="page-eyebrow">5 nâng cấp lớn</span>
 <h3>Trung tâm ưu tiên sản phẩm</h3>
 <p>Mỗi thẻ là một mảng đã được nối với dữ liệu thật của hệ thống để dễ test và mở rộng.</p>
 </div>
 <button className="secondary-button" type="button" onClick={refreshStats} disabled={loadingStats}>
 <RefreshCw size={16} />
 <span>{loadingStats ? "Đang tải..." : "Cập nhật số liệu"}</span>
 </button>
 </div>
 <div className="big-update-grid">
 {bigUpdates.map((item) => (
 <button className={`big-update-card ${item.tone}`} type="button" key={item.label} onClick={item.onClick}>
 <span>{item.label}</span>
 <strong>{item.value}</strong>
 <small>{item.detail}</small>
 </button>
 ))}
 </div>
 </div>

 <div className="dashboard-insight-panel mb-4">
 <div className="library-score-card">
 <div className="library-score-ring" style={{ "--score": dashboardHealth.score }}>
 <strong>{dashboardHealth.score}</strong>
 <span>/100</span>
 </div>
 <div>
 <span className="page-eyebrow">Library health score</span>
 <h3>{dashboardHealth.score >= 80 ? "Vận hành ổn định" : dashboardHealth.score >= 55 ? "Cần theo dõi" : "Ưu tiên xử lý"}</h3>
 <p>Điểm tổng hợp từ quá hạn, sách sắp hết và dữ liệu bìa sách còn thiếu.</p>
 </div>
 </div>

 <div className="insight-priority-grid">
 <button type="button" onClick={onNavigateToOverdue} className={summary.overdue > 0 ? "danger" : "success"}>
 <strong>{summary.overdue}</strong>
 <span>Quá hạn</span>
 <small>{dashboardHealth.overdueRate}% trên phiếu hoạt động</small>
 </button>
 <button type="button" onClick={onNavigateToBooks} className={summary.lowStockBooks.length > 0 ? "warning" : "success"}>
 <strong>{summary.lowStockBooks.length}</strong>
 <span>Sắp hết</span>
 <small>Ưu tiên kiểm kê kho</small>
 </button>
 <button type="button" onClick={onNavigateToBooks} className={summary.missingImageBooks > 0 ? "warning" : "success"}>
 <strong>{summary.missingImageBooks}</strong>
 <span>Thiếu ảnh</span>
 <small>Cải thiện trải nghiệm tra cứu</small>
 </button>
 </div>
 </div>

 <div className="table-card mb-4">
 <div className="table-card-header row-between">
 <div>
 <h3>Chức năng nhanh</h3>
 <p>Đi thẳng tới các nghiệp vụ đang dùng nhiều trong thư viện.</p>
 </div>
 </div>

 <div className="feature-action-grid">
 {quickActions.map((action) => {
 const Icon = action.icon;

 return (
 <button
 className={`feature-action-card ${action.tone}`}
 key={action.title}
 type="button"
 onClick={action.onClick}
 >
 <span className="feature-action-icon">
 <Icon size={20} />
 </span>
 <span className="feature-action-content">
 <strong>{action.title}</strong>
 <span>{action.detail}</span>
 <small>
 {action.meta}
 <ArrowRight size={14} />
 </small>
 </span>
 </button>
 );
 })}
 </div>
 </div>

 <div className="row g-3 mb-4">
 <div className="col-12 col-lg-8">
 <div className="card shadow-sm h-100">
 <div className="card-body">
 <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
 <div>
 <h5 className="card-title mb-1">Sức khỏe thư viện</h5>
 <div className="text-muted small">
 Tổng hợp nhanh tồn kho, lưu thông sách và rủi ro quá hạn.
 </div>
 </div>
 <span className={summary.overdue > 0 ? "badge bg-danger" : "badge bg-success"}>
 {summary.overdue > 0 ? "Cần xử lý" : "Ổn định"}
 </span>
 </div>

 <div className="dashboard-health-grid">
 <div>
 <div className="d-flex justify-content-between small mb-1">
 <span>Sách đang lưu thông</span>
 <strong>{dashboardHealth.borrowedRate}%</strong>
 </div>
 <div className="progress dashboard-progress">
 <div
 className="progress-bar bg-primary"
 style={{ width: `${dashboardHealth.borrowedRate}%` }}
 />
 </div>
 </div>

 <div>
 <div className="d-flex justify-content-between small mb-1">
 <span>Sách còn sẵn</span>
 <strong>{dashboardHealth.availableRate}%</strong>
 </div>
 <div className="progress dashboard-progress">
 <div
 className="progress-bar bg-success"
 style={{ width: `${dashboardHealth.availableRate}%` }}
 />
 </div>
 </div>

 <div>
 <div className="d-flex justify-content-between small mb-1">
 <span>Tỷ lệ quá hạn</span>
 <strong>{dashboardHealth.overdueRate}%</strong>
 </div>
 <div className="progress dashboard-progress">
 <div
 className="progress-bar bg-danger"
 style={{ width: `${dashboardHealth.overdueRate}%` }}
 />
 </div>
 </div>
 </div>

 <div className="dashboard-metrics-row">
 <span>Phiếu đang hoạt động: {dashboardHealth.activeLoans}</span>
 <span>Sách có thể mượn: {summary.availableBooks}</span>
 <span>Tiền phạt dự kiến: {formatCurrency(summary.totalFines)}</span>
 </div>

 <div className="dashboard-status-chart">
 {statusChartItems.map((item) => (
 <div className="status-chart-row" key={item.label}>
 <span>{item.label}</span>
 <div className="status-chart-track">
 <div
 className={`status-chart-fill ${item.tone}`}
 style={{ width: `${Math.max(4, Math.round((item.value / statusChartTotal) * 100))}%` }}
 />
 </div>
 <strong>{item.value}</strong>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>

 <div className="col-12 col-lg-4">
 <div className="card shadow-sm h-100">
 <div className="card-body">
 <h5 className="card-title">Việc cần xử lý</h5>
 {actionItems.length === 0 ? (
 <div className="text-muted">Chưa có việc cần xử lý ngay.</div>
 ) : (
 <div className="dashboard-action-list">
 {actionItems.map((item) => (
 <div className={`dashboard-action-item ${item.tone}`} key={item.title}>
 <strong>{item.title}</strong>
 <span>{item.detail}</span>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 </div>

 <div className="row g-3">
 <div className="col-12 col-lg-6">
 <div className="card shadow-sm">
 <div className="card-body">
 <h5 className="card-title">Hoạt động hôm nay</h5>
 <div className="today-activity-grid">
 <span>
 <strong>{summary.todayActivity.borrowed}</strong>
 Mượn mới
 </span>
 <span>
 <strong>{summary.todayActivity.returned}</strong>
 Đã trả
 </span>
 <span>
 <strong>{formatCurrency(summary.todayActivity.fines)}</strong>
 Phạt phát sinh
 </span>
 </div>
 </div>
 </div>
 </div>

 <div className="col-12 col-lg-6">
 <div className="card shadow-sm h-100">
 <div className="card-body">
 <h5 className="card-title">Nhu cầu sách theo thể loại</h5>
 {summary.hotCategories.length === 0 ? (
 <div className="text-muted">Chưa đủ dữ liệu để dự báo nhu cầu.</div>
 ) : (
 <div className="forecast-list">
 {summary.hotCategories.map((item) => (
 <div className="forecast-item" key={item.category}>
 <div>
 <strong>{item.category}</strong>
 <span>{item.borrowCount} lượt mượn, {item.waitingReservations} đặt trước</span>
 </div>
 <b>{item.demandScore}</b>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="col-12 col-lg-6">
 <div className="card shadow-sm h-100">
 <div className="card-body">
 <h5 className="card-title">Hàng chờ đặt trước</h5>
 {summary.topReservationBooks.length === 0 ? (
 <div className="text-muted">Không có sách nào đang có hàng chờ.</div>
 ) : (
 <div className="forecast-list">
 {summary.topReservationBooks.map((book) => (
 <button className="forecast-item button-reset" type="button" key={book.id} onClick={onNavigateToBorrow}>
 <div>
 <strong>{book.title}</strong>
 <span>{book.author || "Chưa rõ tác giả"}</span>
 </div>
 <b>{book.waitingCount}</b>
 </button>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="col-12 col-lg-6">
 <div className="card shadow-sm">
 <div className="card-body">
 <h5 className="card-title">Mượn / trả theo tháng</h5>
 {summary.monthlyActivity.length === 0 ? (
 <div className="text-muted">Chưa có dữ liệu theo tháng.</div>
 ) : (
 <div className="monthly-chart">
 {summary.monthlyActivity.map((item) => (
 <div className="monthly-chart-row" key={item.month}>
 <span>{item.month}</span>
 <div className="monthly-chart-bars">
 <div
 className="monthly-chart-bar borrowed"
 style={{ width: `${Math.max(4, Math.round((Number(item.borrowed || 0) / monthlyChartMax) * 100))}%` }}
 />
 <div
 className="monthly-chart-bar returned"
 style={{ width: `${Math.max(4, Math.round((Number(item.returned || 0) / monthlyChartMax) * 100))}%` }}
 />
 </div>
 <strong>{item.borrowed}/{item.returned}</strong>
 </div>
 ))}
 <div className="monthly-chart-legend">
 <span><i className="borrowed" /> Mượn</span>
 <span><i className="returned" /> Trả</span>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="col-12 col-lg-6">
 <div className="card shadow-sm">
 <div className="card-body">
 <h5 className="card-title">Báo cáo tiền phạt</h5>
 {summary.monthlyFines.length === 0 ? (
 <div className="text-muted">Chưa có dữ liệu tiền phạt theo tháng.</div>
 ) : (
 <div className="monthly-chart">
 {summary.monthlyFines.map((item) => (
 <div className="monthly-chart-row" key={item.month}>
 <span>{item.month}</span>
 <div className="monthly-chart-bars">
 <div
 className="monthly-chart-bar paid"
 style={{ width: `${Math.max(4, Math.round((Number(item.paid || 0) / monthlyFineMax) * 100))}%` }}
 />
 <div
 className="monthly-chart-bar unpaid"
 style={{ width: `${Math.max(4, Math.round((Number(item.unpaid || 0) / monthlyFineMax) * 100))}%` }}
 />
 <div
 className="monthly-chart-bar waived"
 style={{ width: `${Math.max(4, Math.round((Number(item.waived || 0) / monthlyFineMax) * 100))}%` }}
 />
 </div>
 <strong>{formatCurrency(item.paid)}</strong>
 </div>
 ))}
 <div className="monthly-chart-legend">
 <span><i className="paid" /> Đã thu</span>
 <span><i className="unpaid" /> Chưa thu</span>
 <span><i className="waived" /> Đã miễn</span>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="col-12 col-lg-6">
 <div className="card shadow-sm">
 <div className="card-body">
 <h5 className="card-title">Nhắc hạn trả</h5>
 {summary.reminders.length === 0 ? (
 <div className="text-muted">Không có phiếu cần nhắc.</div>
 ) : (
 <div className="table-responsive">
 <table className="table table-sm">
 <thead>
 <tr>
 <th>Độc giả</th>
 <th>Sách</th>
 <th>Hạn trả</th>
 <th>Trạng thái</th>
 <th>Hành động</th>
 </tr>
 </thead>
 <tbody>
 {summary.reminders.map((loan) => (
 <tr key={loan.id}>
 <td>{loan.readerName}</td>
 <td>{loan.bookTitle}</td>
 <td>{loan.dueDate}</td>
 <td>
 <span className={getLoanBadgeClass(loan.status)}>
 {loan.status === "overdue" ? `Trễ ${loan.lateDays || 0} ngày` : getDueSoonLabel(loan.dueDate)}
 </span>
 </td>
 <td>
 <button
 className="btn btn-sm btn-outline-primary"
 type="button"
 onClick={loan.status === "overdue" ? onNavigateToOverdue : onNavigateToBorrow}
 >
 {loan.status === "overdue" ? "Xử lý quá hạn" : "Xem phiếu"}
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>
 </div>

 {isAdmin && (
 <div className="col-12 col-lg-6">
 <div className="card shadow-sm">
 <div className="card-body">
 <h5 className="card-title">Top độc giả mượn nhiều</h5>

 {summary.topReaders.length === 0 ? (
 <div className="text-muted">Chưa có dữ liệu mượn của độc giả.</div>
 ) : (
 <div className="rank-list">
 {summary.topReaders.map((reader, index) => (
 <div className="rank-list-item" key={reader.id}>
 <strong>#{index + 1}</strong>
 <span>{reader.name}</span>
 <small>{reader.borrowedCount} lượt</small>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 <div className="col-12 col-lg-6">
 <div className="card shadow-sm">
 <div className="card-body">
 <h5 className="card-title">Phiếu mượn gần đây</h5>

 {summary.recentLoans.length === 0 ? (
 <div className="text-muted">Chưa có phiếu mượn nào.</div>
 ) : (
 <div className="table-responsive">
 <table className="table table-sm">
 <thead>
 <tr>
 <th>Mã</th>
 <th>Độc giả</th>
 <th>Sách</th>
 <th>Hạn trả</th>
 <th>Trạng thái</th>
 </tr>
 </thead>
 <tbody>
 {summary.recentLoans.map((loan) => (
 <tr key={loan.id}>
 <td>#{loan.id}</td>
 <td>{loan.readerName}</td>
 <td>{loan.bookTitle}</td>
 <td>{loan.dueDate}</td>
 <td>
 <span className={getLoanBadgeClass(loan.status)}>
 {getStatusLabel(loan.status)}
 </span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="col-12 col-lg-6">
 <div className="card shadow-sm mb-3">
 <div className="card-body">
 <h5 className="card-title">Sắp đến hạn</h5>

 {summary.dueSoonLoans.length === 0 ? (
 <div className="text-muted">Không có phiếu mượn sắp đến hạn.</div>
 ) : (
 <div className="table-responsive">
 <table className="table table-sm">
 <thead>
 <tr>
 <th>Độc giả</th>
 <th>Sách</th>
 <th>Hạn trả</th>
 </tr>
 </thead>
 <tbody>
 {summary.dueSoonLoans.map((loan) => (
 <tr key={loan.id}>
 <td>{loan.readerName}</td>
 <td>{loan.bookTitle}</td>
 <td>
 <div>{loan.dueDate}</div>
 <span className="badge bg-warning text-dark">{getDueSoonLabel(loan.dueDate)}</span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>

 <div className="card shadow-sm">
 <div className="card-body">
 <h5 className="card-title">Sách sắp hết</h5>

 {summary.lowStockBooks.length === 0 ? (
 <div className="text-muted">Không có sách sắp hết.</div>
 ) : (
 <div className="table-responsive">
 <table className="table table-sm">
 <thead>
 <tr>
 <th>Sách</th>
 <th>Còn</th>
 <th>Tổng</th>
 </tr>
 </thead>
 <tbody>
 {summary.lowStockBooks.map((book) => (
 <tr key={book.id}>
 <td>{book.title}</td>
 <td>
 <span className={book.availableQuantity === 0 ? "badge bg-danger" : "badge bg-secondary"}>
 {book.availableQuantity}
 </span>
 </td>
 <td>{book.quantity}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="col-12">
 <div className="card shadow-sm">
 <div className="card-body">
 <h5 className="card-title">Sách được mượn nhiều</h5>

 {summary.popularBooks.length === 0 ? (
 <div className="text-muted">Chưa có dữ liệu mượn sách.</div>
 ) : (
 <div className="table-responsive">
 <table className="table table-sm">
 <thead>
 <tr>
 <th>Sách</th>
 <th>Tác giả</th>
 <th>Lượt mượn</th>
 </tr>
 </thead>
 <tbody>
 {summary.popularBooks.map((book) => (
 <tr key={book.id}>
 <td>{book.title}</td>
 <td>{book.author}</td>
 <td>{book.borrowedCount}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>

 {/* Book Modal */}
 {showBookModal && (
 <div className="modal fade show d-block" tabIndex={-1} role="dialog">
 <div className="modal-dialog modal-lg">
 <div className="modal-content">
 <div className="modal-header">
 <h5 className="modal-title">Thêm sách mới</h5>
 <button type="button" className="btn-close" onClick={closeBookModal}></button>
 </div>
 <form onSubmit={submitBook}>
 <div className="modal-body">
 <div className="row g-3">
 <div className="col-md-6">
 <div className="mb-2">
 <label className="form-label">Tên sách</label>
 <input name="title" className="form-control" value={bookForm.title} onChange={handleBookChange} required />
 </div>
 <div className="mb-2">
 <label className="form-label">Tác giả</label>
 <input name="author" className="form-control" value={bookForm.author} onChange={handleBookChange} required />
 </div>
 <div className="mb-2">
 <label className="form-label">Thể loại</label>
 <input name="category" className="form-control" value={bookForm.category} onChange={handleBookChange} required />
 </div>
 <div className="mb-2">
 <label className="form-label">Số lượng</label>
 <input name="quantity" type="number" min="0" className="form-control" value={bookForm.quantity} onChange={handleBookChange} required />
 </div>
 </div>
 <div className="col-md-6">
 <div className="mb-2">
 <label className="form-label">Ảnh URL</label>
 <input name="imageUrl" type="url" className="form-control" value={bookForm.imageUrl} onChange={handleBookChange} />
 </div>
 <ImageUrlPreview
 url={bookForm.imageUrl}
 alt={`Ảnh bìa ${bookForm.title || "sách"}`}
 label="Xem trước ảnh sách"
 fallbackText={getInitial(bookForm.title)}
 />
 <div className="mb-2">
 <label className="form-label">Nhà xuất bản</label>
 <input name="publisher" className="form-control" value={bookForm.publisher} onChange={handleBookChange} />
 </div>
 <div className="mb-2">
 <label className="form-label">Vị trí kệ</label>
 <input name="shelfLocation" className="form-control" value={bookForm.shelfLocation} onChange={handleBookChange} />
 </div>
 <div className="mb-2">
 <label className="form-label">Năm</label>
 <input name="year" type="number" className="form-control" value={bookForm.year} onChange={handleBookChange} />
 </div>
 </div>
 <div className="col-12">
 <label className="form-label">Mô tả</label>
 <textarea name="description" className="form-control" rows={3} value={bookForm.description} onChange={handleBookChange} />
 </div>
 </div>
 </div>
 <div className="modal-footer">
 <button type="button" className="btn btn-secondary" onClick={closeBookModal}>Hủy</button>
 <button type="submit" className="btn btn-primary">Lưu sách</button>
 </div>
 </form>
 </div>
 </div>
 </div>
 )}

 {/* Reader Modal */}
 {showReaderModal && (
 <div className="modal fade show d-block" tabIndex={-1} role="dialog">
 <div className="modal-dialog">
 <div className="modal-content">
 <div className="modal-header">
 <h5 className="modal-title">Thêm độc giả</h5>
 <button type="button" className="btn-close" onClick={closeReaderModal}></button>
 </div>
 <form onSubmit={submitReader}>
 <div className="modal-body">
 <div className="mb-2">
 <label className="form-label">Họ và tên</label>
 <input name="name" className="form-control" value={readerForm.name} onChange={handleReaderChange} required />
 </div>
 <div className="mb-2">
 <label className="form-label">Email</label>
 <input name="email" type="email" className="form-control" value={readerForm.email} onChange={handleReaderChange} required />
 </div>
 <div className="mb-2">
 <label className="form-label">Số điện thoại</label>
 <input name="phone" className="form-control" value={readerForm.phone} onChange={handleReaderChange} />
 </div>
 <div className="mb-2">
 <label className="form-label">Ảnh profile</label>
 <input
 name="profileImageUrl"
 type="url"
 className="form-control"
 value={readerForm.profileImageUrl}
 onChange={handleReaderChange}
 required
 />
 </div>
 <ImageUrlPreview
 url={readerForm.profileImageUrl}
 alt={`Ảnh profile của ${readerForm.name || "độc giả"}`}
 label="Xem trước ảnh profile"
 fallbackText={getInitial(readerForm.name)}
 shape="avatar"
 />
 </div>
 <div className="modal-footer">
 <button type="button" className="btn btn-secondary" onClick={closeReaderModal}>Hủy</button>
 <button type="submit" className="btn btn-primary">Lưu độc giả</button>
 </div>
 </form>
 </div>
 </div>
 </div>
 )}

 {showBulkModal && (
 <div className="modal fade show d-block" tabIndex={-1} role="dialog">
 <div className="modal-dialog modal-xl">
 <div className="modal-content">
 <div className="modal-header">
 <h5 className="modal-title">Nhập nhiều sách</h5>
 <button type="button" className="btn-close" onClick={closeBulkModal}></button>
 </div>
 <form onSubmit={submitBulkBooks}>
 <div className="modal-body">
 <p>Nhập dữ liệu sách theo dạng JSON array hoặc tải lên file CSV/JSON.</p>
 <div className="mb-3">
 <label className="form-label">Tải file CSV/JSON</label>
 <input type="file" accept=".json,.csv,.xlsx" className="form-control" onChange={handleBulkFileChange} />
 {bulkFileName && <div className="form-text">Đã chọn: {bulkFileName}</div>}
 </div>
 <div className="mb-2 d-flex gap-2 align-items-center">
 <button type="button" className="btn btn-outline-secondary btn-sm" onClick={downloadCsvTemplate}>
 Tải file mẫu CSV
 </button>
 <span className="text-muted">Hoặc dán JSON vào ô phía dưới.</span>
 </div>

 <div className="mb-3">
 <label className="form-label">Dữ liệu JSON</label>
 <textarea
 className="form-control"
 rows={10}
 value={bulkInput}
 onChange={handleBulkInputChange}
 placeholder='[{
 "title": "Clean Code",
 "author": "Robert C. Martin",
 "category": "Lập trình",
 "quantity": 5
}]'
 />
 </div>
 {bulkError && <div className="alert alert-danger">{bulkError}</div>}
 {bulkRowErrors.length > 0 && (
 <div className="alert alert-warning">
 <strong>Kiểm tra dữ liệu:</strong>
 <ul className="mb-0">
 {bulkRowErrors.filter((row) => row.errors.length > 0).map((row) => (
 <li key={row.index}>
 Dòng {row.index + 1}: {row.errors.join("; ")}
 </li>
 ))}
 </ul>
 </div>
 )}
 {bulkPreviewRows.length > 0 && (
 <div className="table-responsive">
 <table className="table table-sm">
 <thead>
 <tr>
 <th>#</th>
 <th>Tên sách</th>
 <th>Tác giả</th>
 <th>Thể loại</th>
 <th>Số lượng</th>
 <th>Nhà xuất bản</th>
 </tr>
 </thead>
 <tbody>
 {bulkPreviewRows.slice(0, 10).map((book, index) => (
 <tr key={index}>
 <td>{index + 1}</td>
 <td>{book.title || "-"}</td>
 <td>{book.author || "-"}</td>
 <td>{book.category || "-"}</td>
 <td>{book.quantity ?? "-"}</td>
 <td>{book.publisher || "-"}</td>
 </tr>
 ))}
 </tbody>
 </table>
 {bulkPreviewRows.length > 10 && (
 <div className="text-muted">Hiển thị 10 dòng đầu tiên trong tổng số {bulkPreviewRows.length} dòng.</div>
 )}
 </div>
 )}

 <div className="alert alert-light">
 <strong>Hướng dẫn CSV:</strong> hàng đầu là header. Các trường hỗ trợ: <code>title,author,category,publisher,year,quantity,shelfLocation,description,imageUrl</code>.
 </div>
 {bulkError && <div className="alert alert-danger">{bulkError}</div>}
 </div>
 <div className="modal-footer">
 <button type="button" className="btn btn-secondary" onClick={closeBulkModal}>
 Hủy
 </button>
 <button type="submit" className="btn btn-primary" disabled={bulkImporting}>
 {bulkImporting ? "Đang nhập..." : "Nhập sách"}
 </button>
 </div>
 </form>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}

export default Dashboard;

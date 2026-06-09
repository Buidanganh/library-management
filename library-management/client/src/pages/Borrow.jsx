import { useCallback, useEffect, useMemo, useState } from "react";
import {
 AlertTriangle,
 ArrowRight,
 BookCopy,
 CalendarClock,
 CheckCircle2,
 CircleDollarSign,
 FileJson,
 FileSpreadsheet,
 RefreshCw,
 Search,
 ShieldAlert,
 Sparkles,
 Target,
} from "lucide-react";
import {
 borrowBook,
 extendLoan,
 getBooks,
 getLoans,
 getReaders,
 getReservations,
 returnLoan,
 updateLoanFineStatus,
 updateReservationStatus,
} from "../services/api";
import { EmptyState, LoadingState } from "../components/ui";

const MAX_ACTIVE_LOANS_PER_READER = 5;
const BANK_OPTIONS = ["Vietcombank", "BIDV", "VietinBank", "Techcombank", "MB Bank", "ACB", "VPBank", "TPBank"];

const getDefaultDueDate = () =>
 new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

const getToday = () => new Date().toISOString().split("T")[0];

const formatCurrency = (value) =>
 new Intl.NumberFormat("vi-VN", {
 style: "currency",
 currency: "VND",
 maximumFractionDigits: 0,
 }).format(value || 0);

function getDateAfterDays(days) {
 return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
}

function getStatusLabel(status) {
 if (status === "borrowed") return "Đang mượn";
 if (status === "overdue") return "Quá hạn";
 if (status === "returned") return "Đã trả";
 return status;
}

function getFineStatusLabel(status) {
 if (status === "paid") return "Đã thu";
 if (status === "waived") return "Đã miễn";
 if (status === "unpaid") return "Chưa thu";
 return "Không phạt";
}

function isDueSoon(loan) {
 if (loan.status !== "borrowed" || !loan.dueDate) return false;

 const today = new Date(getToday());
 const dueDate = new Date(loan.dueDate);
 const diff = dueDate.getTime() - today.getTime();
 return diff >= 0 && diff <= 3 * 24 * 60 * 60 * 1000;
}

function getDaysUntilDue(dueDate) {
 if (!dueDate) return null;

 const today = new Date(getToday());
 const due = new Date(dueDate);
 return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getDueText(loan) {
 if (loan.status === "overdue") {
 return `Trễ ${loan.lateDays || Math.abs(getDaysUntilDue(loan.dueDate) || 0)} ngày`;
 }

 const days = getDaysUntilDue(loan.dueDate);
 if (days === 0) return "Đến hạn hôm nay";
 if (days > 0) return `Còn ${days} ngày`;
 return `Trễ ${Math.abs(days)} ngày`;
}

function getLoanRiskScore(loan) {
 if (loan.status === "returned") return 0;

 const daysUntilDue = getDaysUntilDue(loan.dueDate) ?? 14;
 const lateDays = Number(loan.lateDays || 0);
 const fineAmount = Number(loan.fineAmount || 0);

 let score = 20;
 if (loan.status === "overdue") score += 48;
 if (lateDays > 0) score += Math.min(lateDays * 6, 30);
 if (daysUntilDue <= 0) score += 24;
 else if (daysUntilDue <= 1) score += 18;
 else if (daysUntilDue <= 3) score += 10;
 if (fineAmount > 0 && loan.fineStatus !== "paid" && loan.fineStatus !== "waived") score += 12;

 return Math.min(score, 100);
}

function getLoanRiskTone(score) {
 if (score >= 72) return "danger";
 if (score >= 42) return "warning";
 if (score > 0) return "primary";
 return "success";
}

function getLoanNextAction(loan) {
 if (loan.status === "overdue") return "Thu hồi / gia hạn";
 if (isDueSoon(loan)) return "Nhắc trả trước hạn";
 if (Number(loan.fineAmount || 0) > 0 && loan.fineStatus === "unpaid") return "Thu tiền phạt";
 if (loan.status === "borrowed") return "Theo dõi";
 return "Đã hoàn tất";
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

function exportLoansAsJson(loans) {
 downloadFile(JSON.stringify(loans, null, 2), "loans.json", "application/json");
}

function exportLoansAsCsv(loans) {
 const headers = ["id", "readerName", "bookTitle", "status", "borrowedDate", "dueDate", "lateDays", "fineAmount", "fineStatus"];
 const rows = loans.map((loan) => [
 loan.id,
 loan.readerName,
 loan.bookTitle,
 loan.status,
 loan.borrowedDate || "",
 loan.dueDate || "",
 loan.lateDays ?? 0,
 loan.fineAmount ?? 0,
 loan.fineStatus || "none",
 ]);
 const csv = [headers.join(","),...rows.map((row) => row.map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(","))
 ].join("\n");
 downloadFile(csv, "loans.csv", "text/csv;charset=utf-8;");
}

function Borrow({ isAdmin = false }) {
 const [readers, setReaders] = useState([]);
 const [books, setBooks] = useState([]);
 const [loans, setLoans] = useState([]);
 const [reservations, setReservations] = useState([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const [submitting, setSubmitting] = useState(false);
 const [searchQuery, setSearchQuery] = useState("");
 const [readerSearch, setReaderSearch] = useState("");
 const [bookSearch, setBookSearch] = useState("");
 const [statusFilter, setStatusFilter] = useState("");
 const [quickFilter, setQuickFilter] = useState("");
 const [pageDensity, setPageDensity] = useState("comfortable");
 const [formData, setFormData] = useState({
 readerId: "",
 bookId: "",
 dueDate: "",
 });
 const [extendModal, setExtendModal] = useState({
 loan: null,
 dueDate: "",
 });
 const [returnModal, setReturnModal] = useState(null);
 const [paymentModal, setPaymentModal] = useState({
 loan: null,
 bankName: BANK_OPTIONS[0],
 transactionCode: "",
 paymentNote: "",
 });

 const loadData = useCallback(async () => {
 setLoading(true);
 setError("");

 try {
 const [readerData, bookData, loanData, reservationData] = await Promise.all([
 getReaders(),
 getBooks(),
 getLoans(),
 isAdmin ? getReservations() : Promise.resolve([]),
 ]);

 setReaders(readerData);
 setBooks(bookData);
 setLoans(loanData);
 setReservations(reservationData);
 } catch (err) {
 setError(err.message || "Không thể tải dữ liệu mượn sách.");
 } finally {
 setLoading(false);
 }
 }, [isAdmin]);

 useEffect(() => {
 const initialize = async () => {
 setFormData((prevState) => ({...prevState,
 dueDate: getDefaultDueDate(),
 }));

 await loadData();
 };

 initialize();
 }, [loadData]);

 const selectedReader = useMemo(
 () => readers.find((reader) => reader.id === Number(formData.readerId)),
 [readers, formData.readerId]
 );

 const selectedBook = useMemo(
 () => books.find((book) => book.id === Number(formData.bookId)),
 [books, formData.bookId]
 );

 const selectedReaderActiveLoans = Number(selectedReader?.booksBorrowed || 0);
 const selectedReaderActiveLoanRows = useMemo(
 () =>
 loans.filter((loan) => loan.readerId === Number(formData.readerId) && loan.status !== "returned").sort((first, second) => new Date(first.dueDate) - new Date(second.dueDate)),
 [loans, formData.readerId]
 );
 const selectedReaderOverdueLoans = useMemo(
 () => selectedReaderActiveLoanRows.filter((loan) => loan.status === "overdue"),
 [selectedReaderActiveLoanRows]
 );
 const selectedReaderDueSoonLoans = useMemo(
 () => selectedReaderActiveLoanRows.filter(isDueSoon),
 [selectedReaderActiveLoanRows]
 );
 const selectedBookActiveLoanRows = useMemo(
 () =>
 loans.filter((loan) => loan.bookId === Number(formData.bookId) && loan.status !== "returned").sort((first, second) => new Date(first.dueDate) - new Date(second.dueDate)),
 [loans, formData.bookId]
 );
 const selectedReaderReachedLimit =
 selectedReaderActiveLoanRows.length >= MAX_ACTIVE_LOANS_PER_READER ||
 selectedReaderActiveLoans >= MAX_ACTIVE_LOANS_PER_READER;

 const selectedReaderAlreadyBorrowingBook = useMemo(
 () =>
 Boolean(formData.readerId) &&
 Boolean(formData.bookId) &&
 loans.some(
 (loan) =>
 loan.readerId === Number(formData.readerId) &&
 loan.bookId === Number(formData.bookId) &&
 loan.status !== "returned"
 ),
 [loans, formData.readerId, formData.bookId]
 );

 const filteredLoans = useMemo(() => {
 const query = searchQuery.trim().toLowerCase();

 return loans.filter((loan) => {
 const matchesStatus = !statusFilter || loan.status === statusFilter;
 const matchesQuickFilter =
 !quickFilter ||
 (quickFilter === "due-soon" && isDueSoon(loan)) ||
 (quickFilter === "has-fine" && Number(loan.fineAmount || 0) > 0) ||
 (quickFilter === "fine-unpaid" && Number(loan.fineAmount || 0) > 0 && loan.fineStatus === "unpaid") ||
 (quickFilter === "fine-paid" && loan.fineStatus === "paid") ||
 (quickFilter === "fine-waived" && loan.fineStatus === "waived") ||
 (quickFilter === "risk-high" && getLoanRiskScore(loan) >= 72) ||
 (quickFilter === "active" && loan.status !== "returned");
 const matchesQuery =
 !query ||
 [loan.readerName, loan.bookTitle, String(loan.id)].some((value) =>
 String(value || "").toLowerCase().includes(query)
 );

 return matchesStatus && matchesQuickFilter && matchesQuery;
 });
 }, [loans, searchQuery, statusFilter, quickFilter]);

 const loanSummary = useMemo(() => {
 const borrowed = loans.filter((loan) => loan.status === "borrowed").length;
 const overdue = loans.filter((loan) => loan.status === "overdue").length;

 return {
 borrowed,
 overdue,
 active: borrowed + overdue,
 returned: loans.filter((loan) => loan.status === "returned").length,
 dueSoon: loans.filter(isDueSoon).length,
 totalFines: loans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
 filtered: filteredLoans.length,
 };
 }, [loans, filteredLoans]);

 const reservationSummary = useMemo(() => {
 const waiting = reservations.filter((item) => item.status === "waiting");
 const ready = waiting.filter((item) => Number(item.availableQuantity || 0) > 0);
 const blocked = waiting.filter((item) => Number(item.availableQuantity || 0) <= 0);

 return {
 total: reservations.length,
 waiting: waiting.length,
 ready: ready.length,
 blocked: blocked.length,
 fulfilled: reservations.filter((item) => item.status === "fulfilled").length,
 cancelled: reservations.filter((item) => item.status === "cancelled").length,
 };
 }, [reservations]);

 const kanbanColumns = useMemo(
 () => [
 { id: "borrowed", title: "Đang mượn", tone: "success", loans: filteredLoans.filter((loan) => loan.status === "borrowed" && !isDueSoon(loan)) },
 { id: "due-soon", title: "Sắp đến hạn", tone: "warning", loans: filteredLoans.filter(isDueSoon) },
 { id: "overdue", title: "Quá hạn", tone: "danger", loans: filteredLoans.filter((loan) => loan.status === "overdue") },
 { id: "returned", title: "Đã trả", tone: "neutral", loans: filteredLoans.filter((loan) => loan.status === "returned") },
 ],
 [filteredLoans]
 );

 const urgentLoans = useMemo(
 () =>
 loans.filter((loan) => loan.status === "overdue" || isDueSoon(loan)).sort((first, second) => {
 if (first.status !== second.status) {
 return first.status === "overdue" ? -1 : 1;
 }
 return new Date(first.dueDate) - new Date(second.dueDate);
 }).slice(0, 5),
 [loans]
 );

 const availableBooks = useMemo(
 () => books.filter((book) => (book.availableQuantity ?? book.quantity) > 0),
 [books]
 );

 const searchableReaders = useMemo(() => {
 const query = readerSearch.trim().toLowerCase();
 if (!query) return readers;

 return readers.filter((reader) =>
 [reader.name, reader.email, reader.phone, String(reader.id)].some((value) =>
 String(value || "").toLowerCase().includes(query)
 )
 );
 }, [readers, readerSearch]);

 const searchableAvailableBooks = useMemo(() => {
 const query = bookSearch.trim().toLowerCase();
 if (!query) return availableBooks;

 return availableBooks.filter((book) =>
 [book.title, book.author, book.category, book.isbn, book.shelfLocation].some((value) =>
 String(value || "").toLowerCase().includes(query)
 )
 );
 }, [availableBooks, bookSearch]);

 const borrowPreviewTimeline = useMemo(
 () =>
 [
 {
 title: "Tạo phiếu",
 detail: selectedReader && selectedBook ? `${selectedReader.name} mượn ${selectedBook.title}` : "Chọn độc giả và sách",
 tone: selectedReader && selectedBook ? "success" : "neutral",
 },
 {
 title: "Hạn trả",
 detail: formData.dueDate ? `${formData.dueDate} (${getDueText({ status: "borrowed", dueDate: formData.dueDate })})` : "Chưa chọn hạn trả",
 tone: formData.dueDate ? "primary" : "neutral",
 },
 {
 title: "Kiểm tra rủi ro",
 detail:
 selectedReaderOverdueLoans.length > 0
 ? `${selectedReaderOverdueLoans.length} phiếu quá hạn`
 : selectedReaderReachedLimit
 ? "Đạt giới hạn mượn"
 : "Có thể tạo phiếu",
 tone: selectedReaderOverdueLoans.length > 0 || selectedReaderReachedLimit ? "danger" : "success",
 },
 ],
 [formData.dueDate, selectedBook, selectedReader, selectedReaderOverdueLoans.length, selectedReaderReachedLimit]
 );

 const handleChange = (event) => {
 const { name, value } = event.target;
 setFormData((prevState) => ({...prevState,
 [name]: value,
 }));
 };

 const setQuickDueDate = (days) => {
 setFormData((prevState) => ({...prevState,
 dueDate: getDateAfterDays(days),
 }));
 };

 const resetFilters = () => {
 setSearchQuery("");
 setStatusFilter("");
 setQuickFilter("");
 };

 const handleBorrow = async (event) => {
 event.preventDefault();

 const { readerId, bookId, dueDate } = formData;
 if (!readerId || !bookId || !dueDate) {
 alert("Vui lòng chọn độc giả, sách và hạn trả.");
 return;
 }

 if (new Date(dueDate) < new Date(getToday())) {
 alert("Hạn trả không được nằm trong quá khứ.");
 return;
 }

 if (selectedReaderReachedLimit) {
 alert(`Độc giả đã mượn tối đa ${MAX_ACTIVE_LOANS_PER_READER} sách.`);
 return;
 }

 if (selectedReaderAlreadyBorrowingBook) {
 alert("Độc giả đang mượn sách này, không thể tạo phiếu trùng.");
 return;
 }

 const availableQuantity = selectedBook?.availableQuantity ?? selectedBook?.quantity;

 if (!selectedBook || availableQuantity <= 0) {
 alert("Sách đã hết hoặc không hợp lệ.");
 return;
 }

 setSubmitting(true);

 try {
 await borrowBook({
 readerId: Number(readerId),
 bookId: Number(bookId),
 dueDate,
 });
 await loadData();
 setFormData({
 readerId: "",
 bookId: "",
 dueDate: getDefaultDueDate(),
 });
 } catch (err) {
 alert(err.message || "Không thể tạo phiếu mượn.");
 } finally {
 setSubmitting(false);
 }
 };

 const getExtendDate = (loan, daysToAdd = 7) =>
 new Date(
 new Date(loan.dueDate).getTime() + daysToAdd * 24 * 60 * 60 * 1000
 ).toISOString().split("T")[0];

 const runExtend = async (loan, nextDueDate) => {

 if (!nextDueDate) {
 return;
 }

 setSubmitting(true);

 try {
 await extendLoan(loan.id, nextDueDate);
 await loadData();
 } catch (err) {
 alert(err.message || "Không thể gia hạn phiếu mượn.");
 } finally {
 setSubmitting(false);
 }
 };

 const handleExtend = async (loan, daysToAdd = null) => {
 if (daysToAdd === null) {
 setExtendModal({
 loan,
 dueDate: getExtendDate(loan),
 });
 return;
 }

 await runExtend(loan, getExtendDate(loan, daysToAdd));
 };

 const submitExtendModal = async (event) => {
 event.preventDefault();
 if (!extendModal.loan) return;

 await runExtend(extendModal.loan, extendModal.dueDate);
 setExtendModal({ loan: null, dueDate: "" });
 };

 const handleReturn = async (loan) => {
 setReturnModal(loan);
 };

 const confirmReturn = async () => {
 if (!returnModal) return;
 setSubmitting(true);

 try {
 await returnLoan(returnModal.id);
 await loadData();
 setReturnModal(null);
 } catch (err) {
 alert(err.message || "Không thể trả sách.");
 } finally {
 setSubmitting(false);
 }
 };

 const handleFineStatus = async (loan, fineStatus, options = {}) => {
 if (!loan?.id) return;
 setSubmitting(true);

 try {
 await updateLoanFineStatus(loan.id, fineStatus, options);
 await loadData();
 } catch (err) {
 alert(err.message || "Không thể cập nhật trạng thái tiền phạt.");
 } finally {
 setSubmitting(false);
 }
 };

 const openPaymentModal = (loan) => {
 setPaymentModal({
 loan,
 bankName: loan.finePaymentBank || BANK_OPTIONS[0],
 transactionCode: loan.fineTransactionCode || `LIB-${loan.id}-${Date.now().toString().slice(-6)}`,
 paymentNote: loan.finePaymentNote || "",
 });
 };

 const submitFinePayment = async (event) => {
 event.preventDefault();
 if (!paymentModal.loan) return;

 if (!paymentModal.bankName || !paymentModal.transactionCode.trim()) {
 alert("Vui lòng chọn ngân hàng và nhập mã giao dịch chuyển khoản.");
 return;
 }

 await handleFineStatus(paymentModal.loan, "paid", {
 paymentMethod: "bank_transfer",
 bankName: paymentModal.bankName,
 transactionCode: paymentModal.transactionCode.trim(),
 paymentNote: paymentModal.paymentNote.trim(),
 });
 setPaymentModal({ loan: null, bankName: BANK_OPTIONS[0], transactionCode: "", paymentNote: "" });
 };

 const handleReservationStatus = async (reservation, status) => {
 if (!reservation?.id || !isAdmin) return;
 setSubmitting(true);
 setError("");

 try {
 await updateReservationStatus(reservation.id, status);
 await loadData();
 } catch (err) {
 setError(err.message || "Không thể cập nhật đặt trước.");
 } finally {
 setSubmitting(false);
 }
 };

 const handleReservationToLoan = async (reservation) => {
 if (!reservation?.id || !isAdmin) return;
 setSubmitting(true);
 setError("");

 try {
 await updateReservationStatus(reservation.id, "fulfilled", {
 createLoan: true,
 dueDate: getDefaultDueDate(),
 });
 await loadData();
 } catch (err) {
 setError(err.message || "Không thể chuyển đặt trước thành phiếu mượn.");
 } finally {
 setSubmitting(false);
 }
 };

 const canSubmitBorrow =
 !submitting &&
 Boolean(formData.readerId) &&
 Boolean(formData.bookId) &&
 Boolean(formData.dueDate) &&
 !selectedReaderReachedLimit &&
 !selectedReaderAlreadyBorrowingBook;
 const workflowReadiness = [
 {
 label: "Độc giả",
 value: selectedReader ? selectedReader.name : "Chưa chọn",
 detail: selectedReader
 ? `${selectedReaderActiveLoanRows.length}/${MAX_ACTIVE_LOANS_PER_READER} phiếu đang mượn`
 : "Tìm và chọn độc giả",
 tone: selectedReader ? "success" : "neutral",
 },
 {
 label: "Sách",
 value: selectedBook ? selectedBook.title : "Chưa chọn",
 detail: selectedBook
 ? `Còn ${selectedBook.availableQuantity ?? selectedBook.quantity} bản`
 : "Chọn sách còn hàng",
 tone: selectedBook ? "success" : "neutral",
 },
 {
 label: "Rủi ro",
 value:
 selectedReaderOverdueLoans.length > 0
 ? `${selectedReaderOverdueLoans.length} quá hạn`
 : selectedReaderReachedLimit
 ? "Đạt giới hạn"
 : selectedReaderAlreadyBorrowingBook
 ? "Trùng sách"
 : "Ổn",
 detail: selectedReaderDueSoonLoans.length > 0 ? `${selectedReaderDueSoonLoans.length} phiếu sắp đến hạn` : "Không có cảnh báo phụ",
 tone:
 selectedReaderOverdueLoans.length > 0 || selectedReaderReachedLimit || selectedReaderAlreadyBorrowingBook
 ? "danger"
 : selectedReaderDueSoonLoans.length > 0
 ? "warning"
 : "success",
 },
 {
 label: "Trạng thái",
 value: canSubmitBorrow ? "Sẵn sàng" : "Chưa đủ",
 detail: canSubmitBorrow ? "Có thể tạo phiếu mượn" : "Hoàn tất các bước bắt buộc",
 tone: canSubmitBorrow ? "primary" : "neutral",
 },
 ];
 const workflowShortcuts = [
 {
 label: "Đang mượn",
 count: loanSummary.borrowed,
 tone: "success",
 action: () => {
 setStatusFilter("borrowed");
 setQuickFilter("");
 },
 },
 {
 label: "Sắp đến hạn",
 count: loanSummary.dueSoon,
 tone: loanSummary.dueSoon > 0 ? "warning" : "success",
 action: () => {
 setStatusFilter("");
 setQuickFilter("due-soon");
 },
 },
 {
 label: "Quá hạn",
 count: loanSummary.overdue,
 tone: loanSummary.overdue > 0 ? "danger" : "success",
 action: () => {
 setStatusFilter("overdue");
 setQuickFilter("");
 },
 },
 {
 label: "Phạt chưa thu",
 count: loans.filter((loan) => Number(loan.fineAmount || 0) > 0 && loan.fineStatus === "unpaid").length,
 tone: "warning",
 action: () => {
 setStatusFilter("");
 setQuickFilter("fine-unpaid");
 },
 },
 ];

 const loanKpis = [
 {
 label: "Phiếu hoạt động",
 value: loanSummary.active,
 helper: `${loanSummary.borrowed} đang mượn, ${loanSummary.overdue} quá hạn`,
 tone: loanSummary.overdue > 0 ? "warning" : "primary",
 icon: BookCopy,
 },
 {
 label: "Sắp đến hạn",
 value: loanSummary.dueSoon,
 helper: "Cần nhắc trong 3 ngày",
 tone: loanSummary.dueSoon > 0 ? "warning" : "success",
 icon: CalendarClock,
 },
 {
 label: "Đã trả",
 value: loanSummary.returned,
 helper: "Phiếu đã hoàn tất",
 tone: "success",
 icon: CheckCircle2,
 },
 {
 label: "Phạt dự kiến",
 value: formatCurrency(loanSummary.totalFines),
 helper: `${formatCurrency(20000)}/ngày trễ`,
 tone: loanSummary.totalFines > 0 ? "danger" : "success",
 icon: CircleDollarSign,
 },
 ];

 const activeLoansByRisk = useMemo(
 () =>
 loans.filter((loan) => loan.status !== "returned").map((loan) => ({...loan,
 riskScore: getLoanRiskScore(loan),
 riskTone: getLoanRiskTone(getLoanRiskScore(loan)),
 nextAction: getLoanNextAction(loan),
 })).sort((first, second) => {
 if (second.riskScore !== first.riskScore) return second.riskScore - first.riskScore;
 return new Date(first.dueDate || 0) - new Date(second.dueDate || 0);
 }),
 [loans]
 );

 const unpaidFineCount = useMemo(
 () => loans.filter((loan) => Number(loan.fineAmount || 0) > 0 && loan.fineStatus === "unpaid").length,
 [loans]
 );

 const highRiskLoanCount = activeLoansByRisk.filter((loan) => loan.riskScore >= 72).length;
 const commandHealth = Math.max(
 0,
 100 - loanSummary.overdue * 16 - loanSummary.dueSoon * 7 - unpaidFineCount * 5 - reservationSummary.ready * 4
 );
 const commandTone = commandHealth >= 80 ? "success" : commandHealth >= 55 ? "warning" : "danger";

 const smartActionItems = [
 {
 title: "Xử lý phiếu rủi ro cao",
 detail: `${highRiskLoanCount} phiếu cần ưu tiên đầu tiên`,
 count: highRiskLoanCount,
 tone: highRiskLoanCount > 0 ? "danger" : "success",
 icon: ShieldAlert,
 action: () => {
 setStatusFilter("");
 setQuickFilter("risk-high");
 },
 },
 {
 title: "Nhắc trả sách sớm",
 detail: `${loanSummary.dueSoon} phiếu sẽ đến hạn trong 3 ngày`,
 count: loanSummary.dueSoon,
 tone: loanSummary.dueSoon > 0 ? "warning" : "success",
 icon: CalendarClock,
 action: () => {
 setStatusFilter("");
 setQuickFilter("due-soon");
 },
 },
 {
 title: "Thu tiền phạt",
 detail: `${unpaidFineCount} khoản phạt chưa thu`,
 count: unpaidFineCount,
 tone: unpaidFineCount > 0 ? "warning" : "success",
 icon: CircleDollarSign,
 action: () => {
 setStatusFilter("");
 setQuickFilter("fine-unpaid");
 },
 },
 {
 title: "Chuyển đặt trước thành phiếu",
 detail: `${reservationSummary.ready} yêu cầu đã có sách sẵn`,
 count: reservationSummary.ready,
 tone: reservationSummary.ready > 0 ? "primary" : "success",
 icon: Target,
 action: () => {
 window.scrollTo({ top: 820, behavior: "smooth" });
 },
 },
 ];

 return (
 <div className={`page-shell borrow-page page-density-${pageDensity}`}>
 <div className="page-title row-between borrow-hero">
 <div>
 <span className="page-eyebrow">
 <Sparkles size={16} />
 Điều phối mượn trả
 </span>
 <h2>Mượn / Trả sách</h2>
 <p>Quản lý phiếu mượn, gia hạn và trả sách trực tiếp với backend.</p>
 <div className="page-hero-meta">
 <span>{loanSummary.active} phiếu hoạt động</span>
 <span>{loanSummary.dueSoon} sắp đến hạn</span>
 <span>{formatCurrency(loanSummary.totalFines)} phạt dự kiến</span>
 </div>
 </div>
 <div className="button-group borrow-export-actions">
 <div className="view-mode-toggle density-toggle" role="group" aria-label="Chọn mật độ hiển thị">
 {[
 ["comfortable", "Thoáng"],
 ["compact", "Gọn"],
 ].map(([mode, label]) => (
 <button
 className={pageDensity === mode ? "active" : ""}
 type="button"
 key={mode}
 onClick={() => setPageDensity(mode)}
 title={label}
 >
 {label}
 </button>
 ))}
 </div>
 <button className="secondary-button" type="button" onClick={() => exportLoansAsJson(filteredLoans)}>
 <FileJson size={16} />
 <span>Xuất JSON</span>
 </button>
 <button className="secondary-button" type="button" onClick={() => exportLoansAsCsv(filteredLoans)}>
 <FileSpreadsheet size={16} />
 <span>Xuất CSV</span>
 </button>
 </div>
 </div>

 {error && <div className="error-message">{error}</div>}

 <div className="inventory-metric-grid borrow-metric-grid">
 {loanKpis.map((item) => {
 const Icon = item.icon;

 return (
 <div className={`inventory-metric-card ${item.tone}`} key={item.label}>
 <span className="inventory-metric-icon">
 <Icon size={20} />
 </span>
 <div>
 <span>{item.label}</span>
 <strong>{item.value}</strong>
 <small>{item.helper}</small>
 </div>
 </div>
 );
 })}
 </div>

 <div className="borrow-workflow-readiness">
 {workflowReadiness.map((item) => (
 <section className={`workflow-readiness-card ${item.tone}`} key={item.label}>
 <span>{item.label}</span>
 <strong>{item.value}</strong>
 <small>{item.detail}</small>
 </section>
 ))}
 </div>

 <div className="borrow-workflow-shortcuts">
 {workflowShortcuts.map((item) => (
 <button className={`workflow-shortcut ${item.tone}`} type="button" key={item.label} onClick={item.action}>
 <span>{item.label}</span>
 <strong>{item.count}</strong>
 </button>
 ))}
 </div>

 <section className={`borrow-command-center ${commandTone}`}>
 <div className="command-health-panel">
 <span className="page-eyebrow">
 <Target size={16} />
 Smart Borrowing Dashboard
 </span>
 <strong>{commandHealth}%</strong>
 <p>Điểm vận hành dựa trên quá hạn, sắp đến hạn, phạt chưa thu và đặt trước đã sẵn sàng.</p>
 <div className="command-health-meter" aria-label={`Điểm vận hành ${commandHealth}%`}>
 <span style={{ width: `${commandHealth}%` }} />
 </div>
 </div>

 <div className="command-action-grid">
 {smartActionItems.map((item) => {
 const Icon = item.icon;

 return (
 <button className={`command-action-card ${item.tone}`} type="button" key={item.title} onClick={item.action}>
 <span className="command-action-icon">
 <Icon size={18} />
 </span>
 <span>
 <strong>{item.title}</strong>
 <small>{item.detail}</small>
 </span>
 <em>{item.count}</em>
 </button>
 );
 })}
 </div>

 <div className="command-priority-queue">
 <div className="command-section-header">
 <strong>Hàng đợi ưu tiên</strong>
 <span>{activeLoansByRisk.length} phiếu đang mở</span>
 </div>
 {activeLoansByRisk.length === 0 ? (
 <div className="empty-state compact">Không có phiếu đang mở cần điều phối.</div>
 ) : (
 <div className="priority-loan-list">
 {activeLoansByRisk.slice(0, 4).map((loan) => (
 <article className={`priority-loan-card ${loan.riskTone}`} key={loan.id}>
 <div>
 <span className="risk-score">{loan.riskScore}</span>
 <strong>{loan.readerName}</strong>
 <small>{loan.bookTitle}</small>
 </div>
 <div>
 <span className={loan.riskTone === "danger" ? "badge danger" : loan.riskTone === "warning" ? "badge warning" : "badge"}>
 {getDueText(loan)}
 </span>
 <small>{loan.nextAction}</small>
 </div>
 <button className="small-button" type="button" onClick={() => handleReturn(loan)} disabled={submitting}>
 <ArrowRight size={14} />
 <span>Xử lý</span>
 </button>
 </article>
 ))}
 </div>
 )}
 </div>
 </section>

 <div className="borrow-operations-grid">
 <div className="table-card borrow-form-card">
 <div className="table-card-header">
 <h3>Phiếu mượn mới</h3>
 <p>Chọn độc giả, sách còn sẵn và hạn trả để tạo phiếu nhanh.</p>
 </div>
 <form className="form-grid" onSubmit={handleBorrow}>
 <div className="form-group">
 <label>Độc giả</label>
 <div className="borrow-picker-search">
 <Search size={16} />
 <input
 type="search"
 value={readerSearch}
 onChange={(event) => setReaderSearch(event.target.value)}
 placeholder="Tìm theo tên, email, SĐT hoặc mã độc giả"
 />
 </div>
 <select name="readerId" value={formData.readerId} onChange={handleChange}>
 <option value="">Chọn độc giả</option>
 {searchableReaders.map((reader) => (
 <option key={reader.id} value={reader.id}>
 {reader.name} - đang mượn {reader.booksBorrowed ?? 0}/{MAX_ACTIVE_LOANS_PER_READER}
 </option>
 ))}
 </select>
 <small>{searchableReaders.length} độc giả phù hợp</small>
 </div>

 <div className="form-group">
 <label>Sách</label>
 <div className="borrow-picker-search">
 <Search size={16} />
 <input
 type="search"
 value={bookSearch}
 onChange={(event) => setBookSearch(event.target.value)}
 placeholder="Tìm theo tên sách, tác giả, thể loại hoặc ISBN"
 />
 </div>
 <select name="bookId" value={formData.bookId} onChange={handleChange}>
 <option value="">Chọn sách</option>
 {searchableAvailableBooks.map((book) => (
 <option key={book.id} value={book.id}>
 {book.title} - Còn lại {book.availableQuantity ?? book.quantity}
 </option>
 ))}
 </select>
 <small>{searchableAvailableBooks.length} sách còn hàng phù hợp</small>
 </div>

 <div className="form-group">
 <label>Hạn trả</label>
 <input
 type="date"
 name="dueDate"
 min={getToday()}
 value={formData.dueDate}
 onChange={handleChange}
 />
 <div className="quick-date-actions">
 <button className="small-button" type="button" onClick={() => setQuickDueDate(7)}>
 +7 ngày
 </button>
 <button className="small-button" type="button" onClick={() => setQuickDueDate(14)}>
 +14 ngày
 </button>
 <button className="small-button" type="button" onClick={() => setQuickDueDate(30)}>
 +30 ngày
 </button>
 </div>
 </div>

 <div className="form-group full">
 {selectedReader && (
 <div className="success-message">
 {selectedReader.name} đang mượn {selectedReaderActiveLoans}/
 {MAX_ACTIVE_LOANS_PER_READER} sách.
 </div>
 )}
 {selectedBook && (
 <div className="success-message muted-message">
 Sách còn {selectedBook.availableQuantity ?? selectedBook.quantity} bản có thể mượn.
 </div>
 )}
 {selectedReaderReachedLimit && (
 <div className="error-message">Độc giả này đã đạt giới hạn mượn sách.</div>
 )}
 {selectedReaderAlreadyBorrowingBook && (
 <div className="error-message">Độc giả đang mượn sách đã chọn.</div>
 )}
 </div>

 {(selectedReaderOverdueLoans.length > 0 || selectedReaderDueSoonLoans.length > 0) && (
 <div className="form-group full">
 {selectedReaderOverdueLoans.length > 0 ? (
 <div className="error-message">
 <AlertTriangle size={16} />
 Độc giả đang có {selectedReaderOverdueLoans.length} phiếu quá hạn. Nên xử lý hoặc gia hạn trước khi tạo phiếu mới.
 </div>
 ) : (
 <div className="success-message muted-message">
 Độc giả có {selectedReaderDueSoonLoans.length} phiếu sắp đến hạn trong 3 ngày.
 </div>
 )}
 </div>
 )}

 {(selectedReader || selectedBook) && (
 <div className="form-group full borrow-preview-panel">
 <div className="borrow-preview-grid">
 <section>
 <span className="preview-label">Độc giả</span>
 <strong>{selectedReader?.name || "Chưa chọn"}</strong>
 <small>
 {selectedReader
 ? `${selectedReaderActiveLoanRows.length}/${MAX_ACTIVE_LOANS_PER_READER} phiếu đang mượn`
 : "Tìm và chọn độc giả để xem trạng thái"}
 </small>
 {selectedReaderActiveLoanRows.length > 0 && (
 <div className="borrow-mini-list">
 {selectedReaderActiveLoanRows.slice(0, 3).map((loan) => (
 <span key={loan.id}>
 {loan.bookTitle} - {loan.status === "overdue" ? "Quá hạn" : getDueText(loan)}
 </span>
 ))}
 </div>
 )}
 </section>

 <section>
 <span className="preview-label">Sách</span>
 <strong>{selectedBook?.title || "Chưa chọn"}</strong>
 <small>
 {selectedBook
 ? `Còn ${selectedBook.availableQuantity ?? selectedBook.quantity} bản, ${selectedBookActiveLoanRows.length} bản đang mượn`
 : "Tìm sách còn hàng để tạo phiếu"}
 </small>
 {selectedBookActiveLoanRows.length > 0 && (
 <div className="borrow-mini-list">
 {selectedBookActiveLoanRows.slice(0, 3).map((loan) => (
 <span key={loan.id}>
 {loan.readerName} - {getDueText(loan)}
 </span>
 ))}
 </div>
 )}
 </section>
 </div>

 <div className="borrow-preview-timeline">
 {borrowPreviewTimeline.map((item) => (
 <div className={`borrow-preview-step ${item.tone}`} key={item.title}>
 <span />
 <div>
 <strong>{item.title}</strong>
 <small>{item.detail}</small>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 <div className="form-actions">
 <button className="primary-button" type="submit" disabled={!canSubmitBorrow}>
 <BookCopy size={18} />
 <span>{submitting ? "Đang xử lý..." : "Tạo phiếu mượn"}</span>
 </button>
 </div>
 </form>
 </div>

 <div className="table-card borrow-alert-panel">
 <div className="table-card-header row-between">
 <div>
 <h3>Cần xử lý</h3>
 <p>Ưu tiên phiếu quá hạn và sắp đến hạn trong 3 ngày.</p>
 </div>
 <span className={loanSummary.overdue > 0 ? "badge danger" : "badge success"}>
 {loanSummary.overdue > 0 ? `${loanSummary.overdue} quá hạn` : "Ổn định"}
 </span>
 </div>

 <div className="borrow-alert-stats">
 <span>
 <strong>{loanSummary.active}</strong>
 Phiếu hoạt động
 </span>
 <span>
 <strong>{loanSummary.dueSoon}</strong>
 Sắp đến hạn
 </span>
 <span>
 <strong>{formatCurrency(loanSummary.totalFines)}</strong>
 Phạt dự kiến
 </span>
 </div>

 {urgentLoans.length === 0 ? (
 <div className="empty-state compact">Không có phiếu cần xử lý gấp.</div>
 ) : (
 <div className="urgent-loan-list">
 {urgentLoans.map((loan) => (
 <div className={`urgent-loan-item ${loan.status}`} key={loan.id}>
 <div>
 <strong>{loan.readerName}</strong>
 <span>{loan.bookTitle}</span>
 </div>
 <div>
 <span className={loan.status === "overdue" ? "badge danger" : "badge warning"}>
 {getDueText(loan)}
 </span>
 {loan.fineAmount > 0 && <small>{formatCurrency(loan.fineAmount)}</small>}
 <div className="urgent-loan-actions">
 <button
 className="small-button"
 type="button"
 onClick={() => handleExtend(loan, 7)}
 disabled={submitting}
 >
 +7 ngày
 </button>
 <button
 className="small-button"
 type="button"
 onClick={() => handleReturn(loan)}
 disabled={submitting}
 >
 Trả nhanh
 </button>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>

 {isAdmin && (
 <div className="table-card" style={{ marginTop: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <h3>Hàng chờ đặt trước</h3>
 <p>Xử lý các yêu cầu đặt trước khi sách được trả hoặc có bản sẵn.</p>
 </div>
 <span className="badge">{reservationSummary.waiting} đang chờ</span>
 </div>
 <div className="reservation-triage-grid">
 <section className={reservationSummary.ready > 0 ? "success" : "neutral"}>
 <strong>{reservationSummary.ready}</strong>
 <span>Có thể tạo phiếu mượn</span>
 <small>Sách đã có bản sẵn</small>
 </section>
 <section className={reservationSummary.blocked > 0 ? "warning" : "success"}>
 <strong>{reservationSummary.blocked}</strong>
 <span>Đang chờ sách</span>
 <small>Cần theo dõi tồn kho</small>
 </section>
 <section className="primary">
 <strong>{reservationSummary.fulfilled}</strong>
 <span>Đã xử lý</span>
 <small>Đặt trước đã hoàn tất</small>
 </section>
 <section className="neutral">
 <strong>{reservationSummary.cancelled}</strong>
 <span>Đã hủy</span>
 <small>Yêu cầu không còn hiệu lực</small>
 </section>
 </div>
 {reservations.length === 0 ? (
 <div className="empty-state compact">Chưa có yêu cầu đặt trước.</div>
 ) : (
 <div className="table-responsive">
 <table className="table table-sm">
 <thead>
 <tr>
 <th>Mã</th>
 <th>Độc giả</th>
 <th>Sách</th>
 <th>Còn lại</th>
 <th>Trạng thái</th>
 <th>Hành động</th>
 </tr>
 </thead>
 <tbody>
 {reservations.map((item) => (
 <tr key={item.id}>
 <td>#{item.id}</td>
 <td>{item.readerName}</td>
 <td>{item.bookTitle}</td>
 <td>{item.availableQuantity}</td>
 <td>
 <span className={item.status === "waiting" ? "badge warning" : item.status === "fulfilled" ? "badge success" : "badge"}>
 {item.status === "waiting" ? "Đang chờ" : item.status === "fulfilled" ? "Đã xử lý" : "Đã hủy"}
 </span>
 </td>
 <td>
 <div className="action-buttons">
 {item.status !== "fulfilled" && (
 <button className="small-button" type="button" onClick={() => handleReservationStatus(item, "fulfilled")} disabled={submitting}>
 Đã xử lý
 </button>
 )}
 {item.status === "waiting" && Number(item.availableQuantity || 0) > 0 && (
 <button className="small-button" type="button" onClick={() => handleReservationToLoan(item)} disabled={submitting}>
 Tạo phiếu mượn
 </button>
 )}
 {item.status !== "cancelled" && (
 <button className="small-button" type="button" onClick={() => handleReservationStatus(item, "cancelled")} disabled={submitting}>
 Hủy
 </button>
 )}
 {item.status !== "waiting" && (
 <button className="small-button" type="button" onClick={() => handleReservationStatus(item, "waiting")} disabled={submitting}>
 Chờ lại
 </button>
 )}
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 )}

 <div className="table-card borrow-kanban-shell">
 <div className="table-card-header row-between">
 <div>
 <h3>Kanban mượn / trả</h3>
 <p>Theo dõi pipeline phiếu mượn theo trạng thái và xử lý nhanh ngay trên card.</p>
 </div>
 <div className="loan-summary">
 {kanbanColumns.map((column) => (
 <span key={column.id}>{column.title}: {column.loans.length}</span>
 ))}
 </div>
 </div>

 <div className="borrow-kanban-board">
 {kanbanColumns.map((column) => (
 <section className={`borrow-kanban-column ${column.tone}`} key={column.id}>
 <div className="kanban-column-header">
 <strong>{column.title}</strong>
 <span>{column.loans.length}</span>
 </div>
 <div className="kanban-card-list">
 {column.loans.slice(0, 6).map((loan) => (
 <article className={`kanban-loan-card ${loan.status}`} key={loan.id}>
 <strong>{loan.bookTitle}</strong>
 <span>{loan.readerName}</span>
 <small>{loan.status === "returned" ? "Đã hoàn tất" : getDueText(loan)}</small>
 {Number(loan.fineAmount || 0) > 0 && <em>{formatCurrency(loan.fineAmount)}</em>}
 {loan.status !== "returned" && (
 <div className="action-buttons">
 <button className="small-button" type="button" onClick={() => handleExtend(loan, 7)} disabled={submitting}>
 +7
 </button>
 <button className="small-button" type="button" onClick={() => handleReturn(loan)} disabled={submitting}>
 Trả
 </button>
 </div>
 )}
 </article>
 ))}
 {column.loans.length === 0 && <div className="kanban-empty">Không có phiếu.</div>}
 </div>
 </section>
 ))}
 </div>
 </div>

 <div className="table-card" style={{ marginTop: 24 }}>
 <div className="table-card-header row-between">
 <h3>Danh sách phiếu mượn</h3>
 <div className="loan-summary">
 <span>Đang mượn: {loanSummary.borrowed}</span>
 <span>Sắp đến hạn: {loanSummary.dueSoon}</span>
 <span>Quá hạn: {loanSummary.overdue}</span>
 <span>Đã trả: {loanSummary.returned}</span>
 <span>Phạt dự kiến: {formatCurrency(loanSummary.totalFines)}</span>
 <span>Mức phạt: {formatCurrency(20000)}/ngày</span>
 <span>Đang hiển thị: {loanSummary.filtered}</span>
 </div>
 </div>

 <div className="filters-row">
 <div className="search-bar">
 <label>Tìm kiếm</label>
 <span className="search-field-icon">
 <Search size={17} />
 </span>
 <input
 type="search"
 value={searchQuery}
 onChange={(event) => setSearchQuery(event.target.value)}
 placeholder="Tìm theo mã phiếu, độc giả hoặc sách"
 />
 </div>

 <div className="filter-group">
 <label>Trạng thái</label>
 <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
 <option value="">Tất cả</option>
 <option value="borrowed">Đang mượn</option>
 <option value="overdue">Quá hạn</option>
 <option value="returned">Đã trả</option>
 </select>
 </div>

 <div className="filter-group">
 <label>Lọc nhanh</label>
 <select value={quickFilter} onChange={(event) => setQuickFilter(event.target.value)}>
 <option value="">Tất cả</option>
 <option value="active">Phiếu đang hoạt động</option>
 <option value="due-soon">Sắp đến hạn</option>
 <option value="risk-high">Rủi ro cao</option>
 <option value="has-fine">Có tiền phạt</option>
 <option value="fine-unpaid">Phạt chưa thu</option>
 <option value="fine-paid">Phạt đã thu</option>
 <option value="fine-waived">Phạt đã miễn</option>
 </select>
 </div>

 <div className="filter-group">
 <label>Bộ lọc</label>
 <button
 className="secondary-button"
 type="button"
 onClick={resetFilters}
 disabled={!searchQuery.trim() && !statusFilter && !quickFilter}
 >
 <RefreshCw size={16} />
 <span>Xóa bộ lọc</span>
 </button>
 </div>
 </div>

 {loading ? (
 <LoadingState />
 ) : loans.length === 0 ? (
 <EmptyState
 title="Chưa có phiếu mượn nào"
 description="Tạo phiếu mượn đầu tiên từ form phía trên để bắt đầu theo dõi pipeline."
 action={
 <button className="primary-button" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
 Tạo phiếu mượn
 </button>
 }
 />
 ) : (
 <div className="table-responsive">
 <table className="table table-sm">
 <thead>
 <tr>
 <th>Mã</th>
 <th>Độc giả</th>
 <th>Sách</th>
 <th>Ngày mượn</th>
 <th>Hạn trả</th>
 <th>Trễ</th>
 <th>Phạt</th>
 <th>Trạng thái</th>
 <th>Hành động</th>
 </tr>
 </thead>
 <tbody>
 {filteredLoans.map((loan) => (
 <tr key={loan.id}>
 <td>#{loan.id}</td>
 <td>{loan.readerName}</td>
 <td>{loan.bookTitle}</td>
 <td>{loan.borrowedDate}</td>
 <td>{loan.dueDate}</td>
 <td>{loan.lateDays ? `${loan.lateDays} ngày` : "-"}</td>
 <td>
 {loan.fineAmount ? (
 <div className="stacked-cell">
 <strong>{formatCurrency(loan.fineAmount)}</strong>
 <span className={loan.fineStatus === "paid" ? "badge success" : loan.fineStatus === "waived" ? "badge" : "badge warning"}>
 {getFineStatusLabel(loan.fineStatus)}
 </span>
 {loan.fineStatus === "paid" && loan.finePaymentBank && (
 <small>{loan.finePaymentBank} · {loan.fineTransactionCode}</small>
 )}
 </div>
 ) : (
 "-"
 )}
 </td>
 <td>
 <span
 className={
 loan.status === "borrowed"
 ? "badge success"
 : loan.status === "overdue"
 ? "badge danger"
 : "badge"
 }
 >
 {getStatusLabel(loan.status)}
 </span>
 {isDueSoon(loan) && (
 <span className="badge warning" style={{ marginLeft: 8 }}>
 Sắp đến hạn
 </span>
 )}
 </td>
 <td>
 {(loan.status === "borrowed" || loan.status === "overdue") && (
 <div className="action-buttons">
 <button
 className="small-button"
 type="button"
 onClick={() => handleExtend(loan, 7)}
 disabled={submitting}
 >
 +7 ngày
 </button>
 <button
 className="small-button"
 type="button"
 onClick={() => handleExtend(loan)}
 disabled={submitting}
 >
 Gia hạn
 </button>
 <button
 className="small-button"
 type="button"
 onClick={() => handleReturn(loan)}
 disabled={submitting}
 >
 Trả sách
 </button>
 </div>
 )}
 {isAdmin && Number(loan.fineAmount || 0) > 0 && (
 <div className="action-buttons" style={{ marginTop: 8 }}>
 {loan.fineStatus !== "paid" && (
 <button
 className="small-button"
 type="button"
 onClick={() => openPaymentModal(loan)}
 disabled={submitting}
 >
 Xác nhận CK phạt
 </button>
 )}
 {loan.fineStatus !== "waived" && (
 <button
 className="small-button"
 type="button"
 onClick={() => handleFineStatus(loan, "waived")}
 disabled={submitting}
 >
 Miễn phạt
 </button>
 )}
 {loan.fineStatus !== "unpaid" && (
 <button
 className="small-button"
 type="button"
 onClick={() => handleFineStatus(loan, "unpaid")}
 disabled={submitting}
 >
 Chưa thu
 </button>
 )}
 </div>
 )}
 </td>
 </tr>
 ))}

 {filteredLoans.length === 0 && (
 <tr>
 <td colSpan="9" className="empty-table">
 Không tìm thấy phiếu mượn phù hợp.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {extendModal.loan && (
 <div className="app-modal-backdrop" role="dialog" aria-modal="true">
 <form className="app-modal" onSubmit={submitExtendModal}>
 <h3>Gia hạn phiếu #{extendModal.loan.id}</h3>
 <p>{extendModal.loan.readerName} - {extendModal.loan.bookTitle}</p>
 <div className="form-group">
 <label>Hạn trả mới</label>
 <input
 type="date"
 min={getToday()}
 value={extendModal.dueDate}
 onChange={(event) =>
 setExtendModal((current) => ({...current, dueDate: event.target.value }))
 }
 required
 />
 </div>
 <div className="form-actions">
 <button className="primary-button" type="submit" disabled={submitting}>
 {submitting ? "Đang gia hạn..." : "Xác nhận gia hạn"}
 </button>
 <button
 className="secondary-button"
 type="button"
 onClick={() => setExtendModal({ loan: null, dueDate: "" })}
 disabled={submitting}
 >
 Hủy
 </button>
 </div>
 </form>
 </div>
 )}

 {paymentModal.loan && (
 <div className="app-modal-backdrop" role="dialog" aria-modal="true">
 <form className="app-modal fine-payment-modal" onSubmit={submitFinePayment}>
 <h3>Thanh toán phạt online</h3>
 <p>{paymentModal.loan.readerName} - {paymentModal.loan.bookTitle}</p>
 <div className="modal-summary">
 <span>Mã phiếu: <strong>#{paymentModal.loan.id}</strong></span>
 <span>Số tiền: <strong>{formatCurrency(paymentModal.loan.fineAmount)}</strong></span>
 <span>Nội dung CK: <strong>LIB-{paymentModal.loan.id}</strong></span>
 </div>
 <div className="bank-payment-box">
 <strong>Thông tin nhận chuyển khoản</strong>
 <span>Ngân hàng: <b>Vietcombank</b></span>
 <span>STK: <b>0123456789</b></span>
 <span>Chủ tài khoản: <b>Thu vien Library Management</b></span>
 </div>
 <div className="form-grid">
 <div className="form-group">
 <label>Ngân hàng độc giả chuyển</label>
 <select
 value={paymentModal.bankName}
 onChange={(event) => setPaymentModal((current) => ({...current, bankName: event.target.value }))}
 >
 {BANK_OPTIONS.map((bank) => (
 <option key={bank} value={bank}>{bank}</option>
 ))}
 </select>
 </div>
 <div className="form-group">
 <label>Mã giao dịch</label>
 <input
 type="text"
 value={paymentModal.transactionCode}
 onChange={(event) => setPaymentModal((current) => ({...current, transactionCode: event.target.value }))}
 placeholder="VD: VCB202606081234"
 required
 />
 </div>
 <div className="form-group full">
 <label>Ghi chú</label>
 <input
 type="text"
 value={paymentModal.paymentNote}
 onChange={(event) => setPaymentModal((current) => ({...current, paymentNote: event.target.value }))}
 placeholder="Độc giả đã chuyển khoản online qua ngân hàng"
 />
 </div>
 </div>
 <div className="form-actions">
 <button className="primary-button" type="submit" disabled={submitting}>
 {submitting ? "Đang xác nhận..." : "Xác nhận đã nhận chuyển khoản"}
 </button>
 <button
 className="secondary-button"
 type="button"
 onClick={() => setPaymentModal({ loan: null, bankName: BANK_OPTIONS[0], transactionCode: "", paymentNote: "" })}
 disabled={submitting}
 >
 Hủy
 </button>
 </div>
 </form>
 </div>
 )}

 {returnModal && (
 <div className="app-modal-backdrop" role="dialog" aria-modal="true">
 <div className="app-modal">
 <h3>Xác nhận trả sách</h3>
 <p>{returnModal.readerName} - {returnModal.bookTitle}</p>
 <div className="modal-summary">
 <span>Hạn trả: <strong>{returnModal.dueDate}</strong></span>
 <span>Trễ: <strong>{returnModal.lateDays || 0} ngày</strong></span>
 <span>Tiền phạt: <strong>{formatCurrency(returnModal.fineAmount)}</strong></span>
 </div>
 <div className="form-actions">
 <button className="primary-button" type="button" onClick={confirmReturn} disabled={submitting}>
 {submitting ? "Đang trả..." : "Xác nhận trả"}
 </button>
 <button className="secondary-button" type="button" onClick={() => setReturnModal(null)} disabled={submitting}>
 Hủy
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}

export default Borrow;

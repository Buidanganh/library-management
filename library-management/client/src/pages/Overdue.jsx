import { useEffect, useMemo, useState } from "react";
import {
 AlertTriangle,
 CalendarClock,
 CircleDollarSign,
 FileJson,
 FileSpreadsheet,
 Search,
 Sparkles,
 TimerReset,
} from "lucide-react";
import { extendLoan, getLoans, returnLoan, updateLoanFineStatus } from "../services/api";

const formatCurrency = (value) =>
 new Intl.NumberFormat("vi-VN", {
 style: "currency",
 currency: "VND",
 maximumFractionDigits: 0,
 }).format(value || 0);
const BANK_OPTIONS = ["Vietcombank", "BIDV", "VietinBank", "Techcombank", "MB Bank", "ACB", "VPBank", "TPBank"];

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

function exportOverdueAsJson(items) {
 downloadFile(JSON.stringify(items, null, 2), "overdue.json", "application/json");
}

function exportOverdueAsCsv(items) {
 const headers = ["id", "readerName", "readerEmail", "readerPhone", "bookTitle", "dueDate", "lateDays", "fineAmount", "fineStatus"];
 const rows = items.map((item) => [
 item.id,
 item.readerName,
 item.readerEmail,
 item.readerPhone,
 item.bookTitle,
 item.dueDate,
 item.lateDays,
 item.fineAmount,
 item.fineStatus || "none",
 ]);
 const csv = [headers.join(","),...rows.map((row) => row.map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(","))
 ].join("\n");
 downloadFile(csv, "overdue.csv", "text/csv;charset=utf-8;");
}

function getFineStatusLabel(status) {
 if (status === "paid") return "Đã thu";
 if (status === "waived") return "Đã miễn";
 if (status === "unpaid") return "Chưa thu";
 return "Không phạt";
}

function getDateAfterDays(days) {
 return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
}

function Overdue({ isAdmin = false }) {
 const [overdueItems, setOverdueItems] = useState([]);
 const [loading, setLoading] = useState(true);
 const [submitting, setSubmitting] = useState(false);
 const [error, setError] = useState("");
 const [searchQuery, setSearchQuery] = useState("");
 const [sortMode, setSortMode] = useState("late-desc");
 const [fineFilter, setFineFilter] = useState("");
 const [extendModal, setExtendModal] = useState({
 item: null,
 dueDate: "",
 });
 const [returnModal, setReturnModal] = useState(null);
 const [paymentModal, setPaymentModal] = useState({
 item: null,
 bankName: BANK_OPTIONS[0],
 transactionCode: "",
 paymentNote: "",
 });

 const loadOverdue = async () => {
 setLoading(true);
 setError("");

 try {
 const allLoans = await getLoans();
 setOverdueItems(allLoans.filter((loan) => loan.status === "overdue"));
 } catch (err) {
 setError(err.message || "Không thể tải dữ liệu quá hạn.");
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 loadOverdue();
 }, []);

 const filteredOverdueItems = useMemo(() => {
 const query = searchQuery.trim().toLowerCase();
 const filtered = overdueItems.filter((item) => {
 const fineAmount = Number(item.fineAmount || 0);
 const matchesFine =
 !fineFilter ||
 (fineFilter === "low" && fineAmount < 100000) ||
 (fineFilter === "medium" && fineAmount >= 100000 && fineAmount < 300000) ||
 (fineFilter === "high" && fineAmount >= 300000) ||
 (fineFilter === "unpaid" && item.fineStatus === "unpaid") ||
 (fineFilter === "paid" && item.fineStatus === "paid") ||
 (fineFilter === "waived" && item.fineStatus === "waived");

 if (!query) return matchesFine;

 const matchesQuery = [
 item.readerName,
 item.readerEmail,
 item.readerPhone,
 item.bookTitle,
 String(item.id),
 ].some((value) => String(value || "").toLowerCase().includes(query));

 return matchesQuery && matchesFine;
 });

 return filtered.sort((first, second) => {
 if (sortMode === "late-asc") {
 return Number(first.lateDays || 0) - Number(second.lateDays || 0);
 }

 if (sortMode === "fine-desc") {
 return Number(second.fineAmount || 0) - Number(first.fineAmount || 0);
 }

 if (sortMode === "fine-asc") {
 return Number(first.fineAmount || 0) - Number(second.fineAmount || 0);
 }

 if (sortMode === "reader-asc") {
 return String(first.readerName || "").localeCompare(String(second.readerName || ""));
 }

 return Number(second.lateDays || 0) - Number(first.lateDays || 0);
 });
 }, [overdueItems, searchQuery, sortMode, fineFilter]);

 const overdueSummary = useMemo(() => {
 const totalLateDays = overdueItems.reduce((total, item) => total + Number(item.lateDays || 0), 0);
 const worstItem = overdueItems.reduce(
 (current, item) => (Number(item.lateDays || 0) > Number(current?.lateDays || 0) ? item : current),
 null
 );

 return {
 total: overdueItems.length,
 displayed: filteredOverdueItems.length,
 totalFines: overdueItems.reduce((total, item) => total + Number(item.fineAmount || 0), 0),
 avgLateDays: overdueItems.length ? Math.round(totalLateDays / overdueItems.length) : 0,
 maxLateDays: overdueItems.reduce(
 (max, item) => Math.max(max, Number(item.lateDays || 0)),
 0
 ),
 worstItem,
 };
 }, [overdueItems, filteredOverdueItems]);

 const overdueKpis = [
 {
 label: "Phiếu quá hạn",
 value: overdueSummary.total,
 helper: `${overdueSummary.displayed} đang hiển thị`,
 tone: overdueSummary.total > 0 ? "danger" : "success",
 icon: AlertTriangle,
 },
 {
 label: "Trễ trung bình",
 value: `${overdueSummary.avgLateDays} ngày`,
 helper: `Cao nhất ${overdueSummary.maxLateDays} ngày`,
 tone: "warning",
 icon: CalendarClock,
 },
 {
 label: "Phạt dự kiến",
 value: formatCurrency(overdueSummary.totalFines),
 helper: `${formatCurrency(20000)}/ngày`,
 tone: overdueSummary.totalFines > 0 ? "danger" : "success",
 icon: CircleDollarSign,
 },
 {
 label: "Ưu tiên xử lý",
 value: overdueSummary.worstItem ? `#${overdueSummary.worstItem.id}` : "-",
 helper: overdueSummary.worstItem?.readerName || "Không có phiếu trễ",
 tone: overdueSummary.worstItem ? "danger" : "success",
 icon: TimerReset,
 },
 ];

 const handleReturn = async (item) => {
 setReturnModal(item);
 };

 const confirmReturn = async () => {
 if (!returnModal) return;
 setSubmitting(true);
 setError("");

 try {
 await returnLoan(returnModal.id);
 await loadOverdue();
 setReturnModal(null);
 } catch (err) {
 setError(err.message || "Không thể trả sách.");
 } finally {
 setSubmitting(false);
 }
 };

 const handleFineStatus = async (item, fineStatus, options = {}) => {
 if (!item?.id) return;
 setSubmitting(true);
 setError("");

 try {
 await updateLoanFineStatus(item.id, fineStatus, options);
 await loadOverdue();
 } catch (err) {
 setError(err.message || "Không thể cập nhật trạng thái tiền phạt.");
 } finally {
 setSubmitting(false);
 }
 };

 const openPaymentModal = (item) => {
 setPaymentModal({
 item,
 bankName: item.finePaymentBank || BANK_OPTIONS[0],
 transactionCode: item.fineTransactionCode || `LIB-${item.id}-${Date.now().toString().slice(-6)}`,
 paymentNote: item.finePaymentNote || "",
 });
 };

 const submitFinePayment = async (event) => {
 event.preventDefault();
 if (!paymentModal.item) return;

 if (!paymentModal.bankName || !paymentModal.transactionCode.trim()) {
 setError("Vui lòng chọn ngân hàng và nhập mã giao dịch chuyển khoản.");
 return;
 }

 await handleFineStatus(paymentModal.item, "paid", {
 paymentMethod: "bank_transfer",
 bankName: paymentModal.bankName,
 transactionCode: paymentModal.transactionCode.trim(),
 paymentNote: paymentModal.paymentNote.trim(),
 });
 setPaymentModal({ item: null, bankName: BANK_OPTIONS[0], transactionCode: "", paymentNote: "" });
 };

 const runExtend = async (item, nextDueDate) => {
 if (!nextDueDate) return;

 setSubmitting(true);
 setError("");

 try {
 await extendLoan(item.id, nextDueDate);
 await loadOverdue();
 } catch (err) {
 setError(err.message || "Không thể gia hạn phiếu mượn.");
 } finally {
 setSubmitting(false);
 }
 };

 const handleExtend = async (item, days = 7, ask = true) => {
 const quickDate = getDateAfterDays(days);

 if (ask) {
 setExtendModal({ item, dueDate: quickDate });
 return;
 }

 await runExtend(item, quickDate);
 };

 const submitExtendModal = async (event) => {
 event.preventDefault();
 if (!extendModal.item) return;

 await runExtend(extendModal.item, extendModal.dueDate);
 setExtendModal({ item: null, dueDate: "" });
 };

 return (
 <div className="page-shell overdue-page">
 <div className="page-title row-between page-hero overdue-hero">
 <div>
 <span className="page-eyebrow">
 <Sparkles size={16} />
 Theo dõi rủi ro trả sách
 </span>
 <h2>Sách quá hạn</h2>
 <p>Theo dõi phiếu mượn quá hạn, thông tin liên hệ và tiền phạt dự kiến.</p>
 <div className="page-hero-meta">
 <span>{overdueSummary.total} phiếu quá hạn</span>
 <span>{formatCurrency(overdueSummary.totalFines)} phạt dự kiến</span>
 <span>{overdueSummary.avgLateDays} ngày trễ trung bình</span>
 </div>
 </div>
 <div className="button-group page-hero-actions">
 <button className="secondary-button" type="button" onClick={() => exportOverdueAsJson(filteredOverdueItems)}>
 <FileJson size={16} />
 <span>Xuất JSON</span>
 </button>
 <button className="secondary-button" type="button" onClick={() => exportOverdueAsCsv(filteredOverdueItems)}>
 <FileSpreadsheet size={16} />
 <span>Xuất CSV</span>
 </button>
 </div>
 </div>

 {error && <div className="error-message">{error}</div>}

 {loading ? (
 <div className="skeleton-panel">
 <span />
 <span />
 <span />
 </div>
 ) : overdueItems.length > 0 ? (
 <>
 <div className="inventory-metric-grid overdue-metric-grid">
 {overdueKpis.map((item) => {
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

 <div className="table-card" style={{ marginBottom: 24 }}>
 <div className="table-card-header row-between">
 <h3>Tổng hợp quá hạn</h3>
 <div className="loan-summary">
 <span>Tổng quá hạn: {overdueSummary.total}</span>
 <span>Đang hiển thị: {overdueSummary.displayed}</span>
 <span>Trễ trung bình: {overdueSummary.avgLateDays} ngày</span>
 <span>Trễ nhiều nhất: {overdueSummary.maxLateDays} ngày</span>
 <span>Phạt dự kiến: {formatCurrency(overdueSummary.totalFines)}</span>
 <span>Mức phạt: {formatCurrency(20000)}/ngày</span>
 </div>
 </div>

 {overdueSummary.worstItem && (
 <div className="overdue-highlight">
 <strong>Trễ nặng nhất</strong>
 <span>
 #{overdueSummary.worstItem.id} - {overdueSummary.worstItem.readerName} - {overdueSummary.worstItem.bookTitle}
 </span>
 <small>{overdueSummary.worstItem.lateDays} ngày, {formatCurrency(overdueSummary.worstItem.fineAmount)}</small>
 </div>
 )}

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
 placeholder="Tìm theo mã phiếu, độc giả, email, SĐT hoặc sách"
 />
 </div>

 <div className="filter-group">
 <label>Mức phạt</label>
 <select value={fineFilter} onChange={(event) => setFineFilter(event.target.value)}>
 <option value="">Tất cả</option>
 <option value="low">Dưới 100.000đ</option>
 <option value="medium">100.000đ - 300.000đ</option>
 <option value="high">Từ 300.000đ</option>
 <option value="unpaid">Chưa thu</option>
 <option value="paid">Đã thu</option>
 <option value="waived">Đã miễn</option>
 </select>
 </div>

 <div className="filter-group">
 <label>Sắp xếp</label>
 <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
 <option value="late-desc">Trễ nhiều nhất</option>
 <option value="late-asc">Trễ ít nhất</option>
 <option value="fine-desc">Phạt cao nhất</option>
 <option value="fine-asc">Phạt thấp nhất</option>
 <option value="reader-asc">Tên độc giả A-Z</option>
 </select>
 </div>

 <div className="filter-group">
 <label>Bộ lọc</label>
 <button
 className="secondary-button"
 type="button"
 onClick={() => {
 setSearchQuery("");
 setFineFilter("");
 setSortMode("late-desc");
 }}
 disabled={!searchQuery.trim() && !fineFilter && sortMode === "late-desc"}
 >
 Xóa bộ lọc
 </button>
 </div>
 </div>
 </div>

 <div className="table-card">
 <div className="table-responsive">
 <table className="table table-sm">
 <thead>
 <tr>
 <th>Mã</th>
 <th>Độc giả</th>
 <th>Liên hệ</th>
 <th>Sách</th>
 <th>Hạn trả</th>
 <th>Trễ</th>
 <th>Phạt dự kiến</th>
 <th>Hành động</th>
 </tr>
 </thead>
 <tbody>
 {filteredOverdueItems.map((item) => (
 <tr key={item.id}>
 <td>#{item.id}</td>
 <td>{item.readerName}</td>
 <td>
 <div>
 {item.readerEmail ? (
 <a href={`mailto:${item.readerEmail}`}>{item.readerEmail}</a>
 ) : (
 "-"
 )}
 </div>
 <div>
 {item.readerPhone ? (
 <a href={`tel:${item.readerPhone}`}>{item.readerPhone}</a>
 ) : (
 "-"
 )}
 </div>
 </td>
 <td>{item.bookTitle}</td>
 <td>{item.dueDate}</td>
 <td>
 <span className="badge danger">{item.lateDays ?? 0} ngày</span>
 </td>
 <td>
 <div className="stacked-cell">
 <strong>{formatCurrency(item.fineAmount)}</strong>
 <span className={item.fineStatus === "paid" ? "badge success" : item.fineStatus === "waived" ? "badge" : "badge warning"}>
 {getFineStatusLabel(item.fineStatus)}
 </span>
 {item.fineStatus === "paid" && item.finePaymentBank && (
 <small>{item.finePaymentBank} · {item.fineTransactionCode}</small>
 )}
 </div>
 </td>
 <td>
 <div className="action-buttons">
 <button
 className="small-button"
 type="button"
 onClick={() => handleExtend(item, 7, false)}
 disabled={submitting}
 >
 +7 ngày
 </button>
 <button
 className="small-button"
 type="button"
 onClick={() => handleExtend(item)}
 disabled={submitting}
 >
 Gia hạn
 </button>
 <button
 className="small-button"
 type="button"
 onClick={() => handleReturn(item)}
 disabled={submitting}
 >
 Trả sách
 </button>
 </div>
 {isAdmin && <div className="action-buttons" style={{ marginTop: 8 }}>
 {item.fineStatus !== "paid" && (
 <button
 className="small-button"
 type="button"
 onClick={() => openPaymentModal(item)}
 disabled={submitting}
 >
 Xác nhận CK phạt
 </button>
 )}
 {item.fineStatus !== "waived" && (
 <button
 className="small-button"
 type="button"
 onClick={() => handleFineStatus(item, "waived")}
 disabled={submitting}
 >
 Miễn phạt
 </button>
 )}
 {item.fineStatus !== "unpaid" && (
 <button
 className="small-button"
 type="button"
 onClick={() => handleFineStatus(item, "unpaid")}
 disabled={submitting}
 >
 Chưa thu
 </button>
 )}
 </div>}
 </td>
 </tr>
 ))}

 {filteredOverdueItems.length === 0 && (
 <tr>
 <td colSpan="8" className="empty-table">
 Không tìm thấy phiếu quá hạn phù hợp.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </div>
 </>
 ) : (
 <div className="empty-state">Chưa có dữ liệu sách quá hạn.</div>
 )}

 {extendModal.item && (
 <div className="app-modal-backdrop" role="dialog" aria-modal="true">
 <form className="app-modal" onSubmit={submitExtendModal}>
 <h3>Gia hạn phiếu #{extendModal.item.id}</h3>
 <p>{extendModal.item.readerName} - {extendModal.item.bookTitle}</p>
 <div className="form-group">
 <label>Hạn trả mới</label>
 <input
 type="date"
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
 onClick={() => setExtendModal({ item: null, dueDate: "" })}
 disabled={submitting}
 >
 Hủy
 </button>
 </div>
 </form>
 </div>
 )}

 {paymentModal.item && (
 <div className="app-modal-backdrop" role="dialog" aria-modal="true">
 <form className="app-modal fine-payment-modal" onSubmit={submitFinePayment}>
 <h3>Thanh toán phạt online</h3>
 <p>{paymentModal.item.readerName} - {paymentModal.item.bookTitle}</p>
 <div className="modal-summary">
 <span>Mã phiếu: <strong>#{paymentModal.item.id}</strong></span>
 <span>Số tiền: <strong>{formatCurrency(paymentModal.item.fineAmount)}</strong></span>
 <span>Nội dung CK: <strong>LIB-{paymentModal.item.id}</strong></span>
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
 onClick={() => setPaymentModal({ item: null, bankName: BANK_OPTIONS[0], transactionCode: "", paymentNote: "" })}
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

export default Overdue;

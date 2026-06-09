import { useCallback, useEffect, useMemo, useState } from "react";
import {
 BookOpen,
 Brain,
 CalendarClock,
 CircleDollarSign,
 History,
 Mail,
 ShieldCheck,
 Sparkles,
 Star,
 UserCircle,
 WalletCards,
} from "lucide-react";
import { createReview, extendLoan, getReaderLoans, getReaders, getReservations, updateLoanFineStatus } from "../services/api";

const formatCurrency = (value) =>
 new Intl.NumberFormat("vi-VN", {
 style: "currency",
 currency: "VND",
 maximumFractionDigits: 0,
 }).format(value || 0);
const BANK_OPTIONS = ["Vietcombank", "BIDV", "VietinBank", "Techcombank", "MB Bank", "ACB", "VPBank", "TPBank"];

function getToday() {
 return new Date().toISOString().split("T")[0];
}

function getDueText(loan) {
 if (loan.status === "overdue") return `Trễ ${loan.lateDays || 0} ngày`;

 const diff = Math.ceil(
 (new Date(loan.dueDate).getTime() - new Date(getToday()).getTime()) / (1000 * 60 * 60 * 24)
 );

 if (diff === 0) return "Đến hạn hôm nay";
 if (diff > 0) return `Còn ${diff} ngày`;
 return `Trễ ${Math.abs(diff)} ngày`;
}

function getStatusLabel(status) {
 if (status === "borrowed") return "Đang mượn";
 if (status === "overdue") return "Quá hạn";
 if (status === "returned") return "Đã trả";
 return status || "-";
}

function getFineStatusLabel(status) {
 if (status === "paid") return "Đã thu";
 if (status === "waived") return "Đã miễn";
 if (status === "unpaid") return "Chưa thu";
 return "Không phạt";
}

function getReaderInitial(reader, user) {
 return String(reader?.name || user?.fullName || reader?.email || user?.email || "?").trim().charAt(0).toUpperCase() || "?";
}

function ReaderAvatar({ reader, user }) {
 const [imageSrc, setImageSrc] = useState(reader?.profileImageUrl || "");

 useEffect(() => {
 setImageSrc(reader?.profileImageUrl || "");
 }, [reader?.profileImageUrl]);

 if (imageSrc) {
 return (
 <img
 className="reader-avatar-large"
 src={imageSrc}
 alt={`Ảnh profile của ${reader?.name || user?.fullName || "độc giả"}`}
 onError={() => setImageSrc("")}
 />
 );
 }

 return <div className="reader-avatar-large">{getReaderInitial(reader, user)}</div>;
}

function getStatusTone(status) {
 if (status === "overdue") return "danger";
 if (status === "borrowed" || status === "fulfilled" || status === "returned") return "success";
 if (status === "waiting" || status === "unpaid") return "warning";
 return "";
}

function ReaderProfile({ user }) {
 const [reader, setReader] = useState(null);
 const [loans, setLoans] = useState([]);
 const [reservations, setReservations] = useState([]);
 const [loading, setLoading] = useState(true);
 const [submittingId, setSubmittingId] = useState(null);
 const [reviewForm, setReviewForm] = useState({ bookId: "", rating: 5, comment: "" });
 const [paymentModal, setPaymentModal] = useState({
 loan: null,
 bankName: BANK_OPTIONS[0],
 transactionCode: "",
 paymentNote: "",
 });
 const [historyFilter, setHistoryFilter] = useState("all");
 const [error, setError] = useState("");

 const loadProfile = useCallback(async () => {
 setLoading(true);
 setError("");

 try {
 const readers = await getReaders();
 const currentReader = readers.find((item) => item.id === user.readerId) || readers[0] || null;
 setReader(currentReader);

 if (currentReader?.id) {
 const [loanData, reservationData] = await Promise.all([
 getReaderLoans(currentReader.id),
 getReservations(),
 ]);
 setLoans(loanData);
 setReservations(reservationData);
 }
 } catch (err) {
 setError(err.message || "Không thể tải hồ sơ độc giả.");
 } finally {
 setLoading(false);
 }
 }, [user.readerId]);

 useEffect(() => {
 loadProfile();
 }, [loadProfile]);

 const activeLoans = useMemo(
 () => loans.filter((loan) => loan.status === "borrowed" || loan.status === "overdue"),
 [loans]
 );

 const returnedLoans = useMemo(
 () => loans.filter((loan) => loan.status === "returned"),
 [loans]
 );

 const waitingReservations = useMemo(
 () => reservations.filter((item) => item.status === "waiting"),
 [reservations]
 );

 const summary = useMemo(
 () => ({
 active: activeLoans.length,
 totalLoans: loans.length,
 overdue: activeLoans.filter((loan) => loan.status === "overdue").length,
 totalFines: loans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
 unpaidFines: loans.filter((loan) => loan.fineStatus === "unpaid").reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
 }),
 [activeLoans, loans]
 );

 const readerLevel =
 summary.totalLoans >= 20
 ? "Platinum"
 : summary.totalLoans >= 10
 ? "Gold"
 : summary.totalLoans >= 4
 ? "Silver"
 : "Starter";
 const nextReaderLevel =
 summary.totalLoans >= 20
 ? { label: "Platinum", target: 20 }
 : summary.totalLoans >= 10
 ? { label: "Platinum", target: 20 }
 : summary.totalLoans >= 4
 ? { label: "Gold", target: 10 }
 : { label: "Silver", target: 4 };
 const readerLevelProgress = Math.min(
 100,
 Math.round((summary.totalLoans / Math.max(nextReaderLevel.target, 1)) * 100)
 );

 const profileTimeline = useMemo(
 () =>
 [...activeLoans.map((loan) => ({
 id: `loan-${loan.id}`,
 type: loan.status,
 title: loan.bookTitle,
 meta: `${getStatusLabel(loan.status)} - ${getDueText(loan)}`,
 date: loan.dueDate,
 })),...returnedLoans.slice(0, 8).map((loan) => ({
 id: `returned-${loan.id}`,
 type: "returned",
 title: loan.bookTitle,
 meta: `Đã trả ${loan.returnedDate || "-"}`,
 date: loan.returnedDate || loan.dueDate,
 })),...reservations.slice(0, 6).map((reservation) => ({
 id: `reservation-${reservation.id}`,
 type: reservation.status === "waiting" ? "reserved" : reservation.status,
 title: reservation.bookTitle,
 meta: reservation.status === "waiting" ? "Đang chờ đặt trước" : "Đặt trước đã xử lý",
 date: reservation.createdAt,
 })),
 ].filter((item) => item.date).sort((first, second) => new Date(second.date) - new Date(first.date)).slice(0, 10),
 [activeLoans, returnedLoans, reservations]
 );

 const historyLoans = useMemo(() => {
 const sortedLoans = [...loans].sort((first, second) => {
 const firstDate = first.returnedDate || first.dueDate || first.borrowedDate;
 const secondDate = second.returnedDate || second.dueDate || second.borrowedDate;
 return new Date(secondDate) - new Date(firstDate);
 });

 if (historyFilter === "all") return sortedLoans;
 return sortedLoans.filter((loan) => loan.status === historyFilter);
 }, [historyFilter, loans]);
 const readerActionPlan = [
 {
 title: summary.overdue > 0 ? "Xử lý sách quá hạn" : "Theo dõi hạn trả",
 value: summary.overdue > 0 ? `${summary.overdue} phiếu` : `${activeLoans.length} phiếu`,
 detail: summary.overdue > 0 ? "Ưu tiên trả hoặc gia hạn sách quá hạn" : "Không có phiếu quá hạn hiện tại",
 tone: summary.overdue > 0 ? "danger" : "success",
 },
 {
 title: summary.unpaidFines > 0 ? "Thanh toán tiền phạt" : "Tiền phạt ổn định",
 value: formatCurrency(summary.unpaidFines),
 detail: summary.unpaidFines > 0 ? "Còn khoản phạt chưa thu" : "Không còn nợ phạt",
 tone: summary.unpaidFines > 0 ? "warning" : "success",
 },
 {
 title: "Tiến độ hạng đọc",
 value: `${readerLevelProgress}%`,
 detail: `${summary.totalLoans}/${nextReaderLevel.target} lượt để đạt ${nextReaderLevel.label}`,
 tone: "primary",
 },
 {
 title: "Đặt trước",
 value: waitingReservations.length,
 detail: waitingReservations.length > 0 ? "Có yêu cầu đang chờ" : "Chưa có hàng chờ",
 tone: waitingReservations.length > 0 ? "warning" : "neutral",
 },
 ];
 const readerNextBestActions = [
 {
 label: "Ưu tiên",
 title: summary.overdue > 0 ? "Trả hoặc gia hạn sách quá hạn" : "Duy trì lịch trả đúng hạn",
 detail: summary.overdue > 0 ? `${summary.overdue} phiếu đang quá hạn` : `${activeLoans.length} phiếu đang theo dõi`,
 tone: summary.overdue > 0 ? "danger" : "success",
 },
 {
 label: "Tài chính",
 title: summary.unpaidFines > 0 ? "Xử lý tiền phạt chưa thu" : "Không có nợ phạt",
 detail: summary.unpaidFines > 0 ? formatCurrency(summary.unpaidFines) : "Hồ sơ tài chính sạch",
 tone: summary.unpaidFines > 0 ? "warning" : "success",
 },
 {
 label: "Gắn kết",
 title: `Tiến tới hạng ${nextReaderLevel.label}`,
 detail: `Còn ${Math.max(0, nextReaderLevel.target - summary.totalLoans)} lượt mượn`,
 tone: "primary",
 },
 ];

 const smartReaderPortal = useMemo(() => {
 const urgentLoans = activeLoans.map((loan) => {
 const daysLeft = Math.ceil(
 (new Date(loan.dueDate).getTime() - new Date(getToday()).getTime()) / (1000 * 60 * 60 * 24)
 );
 return {...loan, daysLeft };
 }).filter((loan) => loan.status === "overdue" || loan.daysLeft <= 3 || loan.fineStatus === "unpaid").sort((first, second) => first.daysLeft - second.daysLeft).slice(0, 3);

 const categoryMap = loans.reduce((result, loan) => {
 const category = loan.category || loan.bookCategory || "Chưa phân loại";
 result[category] = (result[category] || 0) + 1;
 return result;
 }, {});
 const favoriteCategories = Object.entries(categoryMap).map(([category, count]) => ({ category, count })).sort((first, second) => second.count - first.count).slice(0, 4);

 const uniqueTitles = Array.from(
 new Map(
 loans.filter((loan) => loan.bookTitle).map((loan) => [loan.bookTitle, loan])
 ).values()
 );
 const suggestions = uniqueTitles.filter((loan) => loan.status === "returned").slice(0, 4);

 const trustScore = Math.max(
 0,
 Math.min(
 100,
 82 + returnedLoans.length * 2 + waitingReservations.length - summary.overdue * 18 - Math.ceil(summary.unpaidFines / 10000)
 )
 );
 const trustTone = trustScore >= 80 ? "success" : trustScore >= 55 ? "warning" : "danger";

 return {
 favoriteCategories,
 suggestions,
 trustScore,
 trustTone,
 urgentLoans,
 };
 }, [activeLoans, loans, returnedLoans.length, summary.overdue, summary.unpaidFines, waitingReservations.length]);

 const handleExtend = async (loan) => {
 const nextDueDate = new Date(new Date(loan.dueDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

 setSubmittingId(loan.id);
 setError("");

 try {
 await extendLoan(loan.id, nextDueDate);
 await loadProfile();
 } catch (err) {
 setError(err.message || "Không thể gia hạn phiếu mượn.");
 } finally {
 setSubmittingId(null);
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
 setError("Vui lòng chọn ngân hàng và nhập mã giao dịch chuyển khoản.");
 return;
 }

 setSubmittingId(`fine-${paymentModal.loan.id}`);
 setError("");

 try {
 await updateLoanFineStatus(paymentModal.loan.id, "paid", {
 paymentMethod: "bank_transfer",
 bankName: paymentModal.bankName,
 transactionCode: paymentModal.transactionCode.trim(),
 paymentNote: paymentModal.paymentNote.trim(),
 });
 await loadProfile();
 setPaymentModal({ loan: null, bankName: BANK_OPTIONS[0], transactionCode: "", paymentNote: "" });
 } catch (err) {
 setError(err.message || "Không thể xác nhận thanh toán tiền phạt.");
 } finally {
 setSubmittingId(null);
 }
 };

 const handleReviewSubmit = async (event) => {
 event.preventDefault();
 if (!reviewForm.bookId) return;

 setSubmittingId(`review-${reviewForm.bookId}`);
 setError("");

 try {
 await createReview({
 bookId: Number(reviewForm.bookId),
 rating: Number(reviewForm.rating),
 comment: reviewForm.comment,
 });
 setReviewForm({ bookId: "", rating: 5, comment: "" });
 await loadProfile();
 } catch (err) {
 setError(err.message || "Không thể gửi đánh giá sách.");
 } finally {
 setSubmittingId(null);
 }
 };

 if (loading) {
 return (
 <div className="page-shell reader-profile-page">
 <div className="skeleton-panel">
 <span />
 <span />
 <span />
 </div>
 </div>
 );
 }

 return (
 <div className="page-shell reader-profile-page">
 <div className="page-title row-between">
 <div>
 <h2>Hồ sơ cá nhân</h2>
 <p>Theo dõi thông tin độc giả, sách đang mượn, lịch sử và tiền phạt.</p>
 </div>
 <span className={summary.overdue > 0 ? "badge danger" : "badge success"}>
 {summary.overdue > 0 ? `${summary.overdue} phiếu quá hạn` : "Không quá hạn"}
 </span>
 </div>

 {error && <div className="error-message">{error}</div>}

 {!reader ? (
 <div className="empty-state">Tài khoản chưa liên kết với hồ sơ độc giả.</div>
 ) : (
 <>
 <div className="profile-summary-grid reader-profile-hero-grid">
 <div className="profile-panel reader-profile-hero-card library-passport-card">
 <div className="reader-avatar-block">
 <ReaderAvatar reader={reader} user={user} />
 <div>
 <span className="page-eyebrow">Library passport</span>
 <h3>{reader.name || user.fullName}</h3>
 <p>{reader.email || user.email}</p>
 </div>
 </div>
 <div className="reader-status-strip">
 <span className={reader.accountStatus === "locked" ? "danger" : "success"}>
 <UserCircle size={16} />
 {reader.accountStatus === "locked" ? "Tài khoản đã khóa" : "Tài khoản hoạt động"}
 </span>
 <span>
 Mã độc giả <strong>#{reader.id}</strong>
 </span>
 <span>
 SĐT <strong>{reader.phone || "-"}</strong>
 </span>
 </div>
 <div className="passport-stamp-strip">
 <span>
 <strong>{readerLevel}</strong>
 Hạng hoạt động
 </span>
 <span>
 <strong>{summary.totalLoans}</strong>
 Tổng lượt mượn
 </span>
 <span>
 <strong>{waitingReservations.length}</strong>
 Đặt trước
 </span>
 </div>
 <div className="reader-passport-progress">
 <div>
 <span>Tiến độ hạng {nextReaderLevel.label}</span>
 <strong>{summary.totalLoans}/{nextReaderLevel.target} lượt</strong>
 </div>
 <div className="reader-level-track" aria-hidden="true">
 <span style={{ width: `${readerLevelProgress}%` }} />
 </div>
 </div>
 <div className="reader-passport-alerts">
 <span className={summary.active > 0 ? "success" : ""}>{summary.active} sách đang mượn</span>
 <span className={summary.unpaidFines > 0 ? "danger" : "success"}>
 {summary.unpaidFines > 0 ? `${formatCurrency(summary.unpaidFines)} chưa thu` : "Không nợ phạt"}
 </span>
 </div>
 </div>

 <div className="metric-card">
 <span><CalendarClock size={16} /> Đang mượn</span>
 <strong>{summary.active}</strong>
 <small>{summary.overdue} phiếu quá hạn</small>
 </div>
 <div className="metric-card">
 <span><CircleDollarSign size={16} /> Tổng phạt</span>
 <strong>{formatCurrency(summary.totalFines)}</strong>
 <small>Còn nợ {formatCurrency(summary.unpaidFines)}</small>
 </div>
 <div className="metric-card">
 <span><History size={16} /> Lịch sử</span>
 <strong>{returnedLoans.length}</strong>
 <small>Phiếu đã trả</small>
 </div>
 </div>

 <section className="reader-info-grid">
 <article className="reader-info-card">
 <div className="reader-info-icon"><Mail size={18} /></div>
 <div>
 <span>Thông tin liên hệ</span>
 <strong>{reader.email || user.email || "-"}</strong>
 <small>{reader.phone || "Chưa cập nhật số điện thoại"}</small>
 </div>
 </article>
 <article className="reader-info-card">
 <div className="reader-info-icon"><WalletCards size={18} /></div>
 <div>
 <span>Thông tin thẻ</span>
 <strong>Độc giả #{reader.id}</strong>
 <small>Trạng thái: {reader.accountStatus === "locked" ? "Đã khóa" : "Hoạt động"}</small>
 </div>
 </article>
 <article className="reader-info-card">
 <div className="reader-info-icon"><ShieldCheck size={18} /></div>
 <div>
 <span>Sức khỏe tài khoản</span>
 <strong>{summary.unpaidFines > 0 ? formatCurrency(summary.unpaidFines) : "Không còn nợ"}</strong>
 <small>{summary.overdue > 0 ? `${summary.overdue} phiếu cần xử lý` : "Không có phiếu quá hạn"}</small>
 </div>
 </article>
 <article className="reader-info-card">
 <div className="reader-info-icon"><Star size={18} /></div>
 <div>
 <span>Hoạt động đọc</span>
 <strong>{readerLevel}</strong>
 <small>{summary.totalLoans} lượt mượn, {waitingReservations.length} đặt trước</small>
 </div>
 </article>
 </section>

 <section className="reader-ai-command-center">
 <article className="reader-ai-main">
 <div className="reader-ai-heading">
 <span className="reader-ai-icon"><Brain size={22} /></span>
 <div>
 <span className="page-eyebrow">Smart Reader Portal</span>
 <h4>Trung tâm độc giả thông minh</h4>
 </div>
 </div>
 <p>
 Tổng hợp hạn trả, tiền phạt, lịch sử mượn và hàng chờ để gợi ý bước tiếp theo cho hồ sơ của bạn.
 </p>
 <div className="reader-ai-signal-row">
 <span className={smartReaderPortal.trustTone}>
 Điểm uy tín
 <strong>{smartReaderPortal.trustScore}/100</strong>
 </span>
 <span className={summary.unpaidFines > 0 ? "danger" : "success"}>
 Phạt chưa nộp
 <strong>{formatCurrency(summary.unpaidFines)}</strong>
 </span>
 <span className={smartReaderPortal.urgentLoans.length > 0 ? "danger" : "success"}>
 Cần xử lý
 <strong>{smartReaderPortal.urgentLoans.length}</strong>
 </span>
 </div>
 </article>

 <article className="reader-ai-card">
 <div className="reader-ai-card-title">
 <CalendarClock size={18} />
 <strong>Việc cần là m</strong>
 </div>
 {smartReaderPortal.urgentLoans.length === 0 ? (
 <p className="reader-ai-muted">Không có phiếu mượn cần xử lý gấp.</p>
 ) : (
 <ul className="reader-ai-list">
 {smartReaderPortal.urgentLoans.map((loan) => (
 <li key={loan.id}>
 {loan.bookTitle} - {loan.status === "overdue" ? `trễ ${loan.lateDays || Math.abs(loan.daysLeft)} ngày` : `còn ${Math.max(0, loan.daysLeft)} ngày`}
 </li>
 ))}
 </ul>
 )}
 </article>

 <article className="reader-ai-card">
 <div className="reader-ai-card-title">
 <Sparkles size={18} />
 <strong>Sở thích đọc</strong>
 </div>
 <div className="reader-preference-chips">
 {smartReaderPortal.favoriteCategories.length > 0 ? (
 smartReaderPortal.favoriteCategories.map((item) => (
 <span key={item.category}>
 {item.category}
 <strong>{item.count}</strong>
 </span>
 ))
 ) : (
 <span>Chưa đủ dữ liệu</span>
 )}
 </div>
 </article>

 <article className="reader-ai-card reader-reminder-card">
 <div className="reader-ai-card-title">
 <BookOpen size={18} />
 <strong>Gợi ý đọc tiếp</strong>
 </div>
 <div className="reader-suggestion-list">
 {smartReaderPortal.suggestions.length > 0 ? (
 smartReaderPortal.suggestions.map((loan) => (
 <span key={loan.id}>
 <strong>{loan.bookTitle}</strong>
 <small>{loan.category || loan.bookCategory || "Dựa trên lịch sử mượn"}</small>
 </span>
 ))
 ) : (
 <small>Trả thêm vài cuốn sách để hệ thống tạo gợi ý cá nhân hóa.</small>
 )}
 </div>
 </article>
 </section>

 <section className="reader-action-plan">
 {readerActionPlan.map((item) => (
 <article className={`reader-action-card ${item.tone}`} key={item.title}>
 <span>{item.title}</span>
 <strong>{item.value}</strong>
 <small>{item.detail}</small>
 </article>
 ))}
 </section>

 <section className="reader-next-actions">
 <div className="table-card-header">
 <h3>Next-best actions</h3>
 <p>Gợi ý xử lý nhanh dựa trên tình trạng mượn, phạt và mức hoạt động của độc giả.</p>
 </div>
 <div className="reader-next-actions-grid">
 {readerNextBestActions.map((item) => (
 <article className={`reader-next-action ${item.tone}`} key={item.label}>
 <span>{item.label}</span>
 <strong>{item.title}</strong>
 <small>{item.detail}</small>
 </article>
 ))}
 </div>
 </section>

 <div className="table-card reader-profile-timeline-card" style={{ marginTop: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <h3>Timeline cá nhân</h3>
 <p>Dòng thời gian gộp sách đang mượn, lịch sử trả và đặt trước.</p>
 </div>
 <span className="badge">{profileTimeline.length} mốc</span>
 </div>
 {profileTimeline.length === 0 ? (
 <div className="empty-state compact">Chưa có hoạt động nào trong hồ sơ.</div>
 ) : (
 <div className="profile-timeline-list">
 {profileTimeline.map((item) => (
 <article className={`profile-timeline-item ${item.type}`} key={item.id}>
 <span className="profile-timeline-dot" />
 <div>
 <strong>{item.title}</strong>
 <small>{item.meta}</small>
 </div>
 <time>{new Date(item.date).toLocaleDateString("vi-VN")}</time>
 </article>
 ))}
 </div>
 )}
 </div>

 <div className="table-card reader-active-loans-card" style={{ marginTop: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <h3>Sách đang mượn</h3>
 <p>Có thể gia hạn nhanh thêm 7 ngày cho phiếu chưa trả.</p>
 </div>
 <span className="badge">{activeLoans.length} phiếu</span>
 </div>
 {activeLoans.length === 0 ? (
 <div className="empty-state compact">Bạn chưa có sách đang mượn.</div>
 ) : (
 <div className="table-responsive">
 <table className="table table-sm reader-history-table">
 <thead>
 <tr>
 <th>Mã</th>
 <th>Sách</th>
 <th>Ngày mượn</th>
 <th>Hạn trả</th>
 <th>Trạng thái</th>
 <th>Phạt</th>
 <th>Hành động</th>
 </tr>
 </thead>
 <tbody>
 {activeLoans.map((loan) => (
 <tr key={loan.id}>
 <td>#{loan.id}</td>
 <td>
 <div className="reader-book-cell">
 <BookOpen size={16} />
 <strong>{loan.bookTitle}</strong>
 </div>
 </td>
 <td>{loan.borrowedDate}</td>
 <td>{loan.dueDate}</td>
 <td>
 <span className={`badge ${getStatusTone(loan.status)}`}>
 {getDueText(loan)}
 </span>
 </td>
 <td>
 {loan.fineAmount ? (
 <div className="stacked-cell">
 <strong>{formatCurrency(loan.fineAmount)}</strong>
 <span className={`badge ${getStatusTone(loan.fineStatus)}`}>
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
 {loan.fineStatus === "unpaid" && Number(loan.fineAmount || 0) > 0 && (
 <button
 className="small-button"
 type="button"
 onClick={() => openPaymentModal(loan)}
 disabled={submittingId === `fine-${loan.id}`}
 >
 Nộp phạt online
 </button>
 )}
 <button
 className="small-button"
 type="button"
 onClick={() => handleExtend(loan)}
 disabled={submittingId === loan.id}
 >
 {submittingId === loan.id ? "Đang gia hạn..." : "Gia hạn +7 ngày"}
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>

 <div className="table-card" style={{ marginTop: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <h3>Sách đã đặt trước</h3>
 <p>Theo dõi hàng chờ đặt trước của bạn.</p>
 </div>
 <span className="badge">{waitingReservations.length} đang chờ</span>
 </div>
 {reservations.length === 0 ? (
 <div className="empty-state compact">Bạn chưa đặt trước sách nào.</div>
 ) : (
 <div className="table-responsive">
 <table className="table table-sm reader-history-table">
 <thead>
 <tr>
 <th>Mã</th>
 <th>Sách</th>
 <th>Ngày đặt</th>
 <th>Trạng thái</th>
 </tr>
 </thead>
 <tbody>
 {reservations.map((item) => (
 <tr key={item.id}>
 <td>#{item.id}</td>
 <td>
 <div className="reader-book-cell">
 <BookOpen size={16} />
 <strong>{item.bookTitle}</strong>
 </div>
 </td>
 <td>{new Date(item.createdAt).toLocaleDateString("vi-VN")}</td>
 <td>
 <span className={`badge ${getStatusTone(item.status)}`}>
 {item.status === "waiting" ? "Đang chờ" : item.status === "fulfilled" ? "Đã xử lý" : "Đã hủy"}
 </span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>

 <div className="table-card reader-review-card" style={{ marginTop: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <h3>Đánh giá sách</h3>
 <p>Gửi nhận xét cho sách bạn đã từng mượn.</p>
 </div>
 </div>
 <form className="form-grid reader-review-form" onSubmit={handleReviewSubmit}>
 <div className="form-group">
 <label>Sách</label>
 <select value={reviewForm.bookId} onChange={(event) => setReviewForm((state) => ({...state, bookId: event.target.value }))}>
 <option value="">Chọn sách</option>
 {Array.from(new Map(loans.map((loan) => [loan.bookId, loan])).values()).map((loan) => (
 <option key={loan.bookId} value={loan.bookId}>
 {loan.bookTitle}
 </option>
 ))}
 </select>
 </div>
 <div className="form-group">
 <label>Số sao</label>
 <select value={reviewForm.rating} onChange={(event) => setReviewForm((state) => ({...state, rating: event.target.value }))}>
 <option value="5">5 sao</option>
 <option value="4">4 sao</option>
 <option value="3">3 sao</option>
 <option value="2">2 sao</option>
 <option value="1">1 sao</option>
 </select>
 </div>
 <div className="form-group">
 <label>Nhận xét</label>
 <input
 type="text"
 value={reviewForm.comment}
 onChange={(event) => setReviewForm((state) => ({...state, comment: event.target.value }))}
 placeholder="Viết nhận xét ngắn"
 />
 </div>
 <div className="form-group">
 <label>&nbsp;</label>
 <button className="primary-button" type="submit" disabled={!reviewForm.bookId || Boolean(submittingId)}>
 Gửi đánh giá
 </button>
 </div>
 </form>
 </div>

 <div className="table-card reader-history-card" style={{ marginTop: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <h3>Lịch sử mượn trả</h3>
 <p>Danh sách phiếu mượn được tô trạng thái để dễ quét nhanh.</p>
 </div>
 <span className="badge">{historyLoans.length} phiếu</span>
 </div>
 <div className="quick-filter-strip reader-history-filters">
 {[
 ["all", "Tất cả", loans.length],
 ["borrowed", "Đang mượn", loans.filter((loan) => loan.status === "borrowed").length],
 ["overdue", "Quá hạn", loans.filter((loan) => loan.status === "overdue").length],
 ["returned", "Đã trả", returnedLoans.length],
 ].map(([value, label, count]) => (
 <button
 className={`quick-filter-chip ${historyFilter === value ? "active" : ""}`}
 key={value}
 type="button"
 onClick={() => setHistoryFilter(value)}
 >
 {label} <strong>{count}</strong>
 </button>
 ))}
 </div>
 <div className="table-responsive">
 <table className="table table-sm reader-history-table">
 <thead>
 <tr>
 <th>Mã</th>
 <th>Sách</th>
 <th>Ngày mượn</th>
 <th>Ngày trả</th>
 <th>Trạng thái</th>
 <th>Phạt</th>
 </tr>
 </thead>
 <tbody>
 {historyLoans.slice(0, 12).map((loan) => (
 <tr className={`loan-row-${loan.status}`} key={loan.id}>
 <td>#{loan.id}</td>
 <td>
 <div className="reader-book-cell">
 <BookOpen size={16} />
 <strong>{loan.bookTitle}</strong>
 </div>
 </td>
 <td>{loan.borrowedDate}</td>
 <td>{loan.returnedDate || "-"}</td>
 <td>
 <span className={`badge ${getStatusTone(loan.status)}`}>
 {getStatusLabel(loan.status)}
 </span>
 </td>
 <td>
 {loan.fineAmount ? (
 <div className="stacked-cell">
 <strong>{formatCurrency(loan.fineAmount)}</strong>
 <span className={`badge ${getStatusTone(loan.fineStatus)}`}>
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
 </tr>
 ))}

 {historyLoans.length === 0 && (
 <tr>
 <td colSpan="6" className="empty-table">
 Chưa có phiếu phù hợp với bộ lọc.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </div>
 </>
 )}
 {paymentModal.loan && (
 <div className="app-modal-backdrop" role="dialog" aria-modal="true">
 <form className="app-modal fine-payment-modal" onSubmit={submitFinePayment}>
 <h3>Nộp phạt online</h3>
 <p>{paymentModal.loan.bookTitle}</p>
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
 <label className="form-group">
 <span>Ngân hàng đã chuyển</span>
 <select
 value={paymentModal.bankName}
 onChange={(event) => setPaymentModal((state) => ({...state, bankName: event.target.value }))}
 >
 {BANK_OPTIONS.map((bank) => (
 <option key={bank} value={bank}>{bank}</option>
 ))}
 </select>
 </label>
 <label className="form-group">
 <span>Mã giao dịch</span>
 <input
 type="text"
 value={paymentModal.transactionCode}
 onChange={(event) => setPaymentModal((state) => ({...state, transactionCode: event.target.value }))}
 placeholder="VD: VCB20260608..."
 required
 />
 </label>
 <label className="form-group full-width">
 <span>Ghi chú</span>
 <input
 type="text"
 value={paymentModal.paymentNote}
 onChange={(event) => setPaymentModal((state) => ({...state, paymentNote: event.target.value }))}
 placeholder="Tên người chuyển hoặc ghi chú thêm"
 />
 </label>
 </div>
 <div className="form-actions">
 <button
 className="primary-button"
 type="submit"
 disabled={submittingId === `fine-${paymentModal.loan.id}`}
 >
 {submittingId === `fine-${paymentModal.loan.id}` ? "Đang xác nhận..." : "Xác nhận đã chuyển khoản"}
 </button>
 <button className="secondary-button" type="button" onClick={() => setPaymentModal((state) => ({...state, loan: null }))}>
 Hủy
 </button>
 </div>
 </form>
 </div>
 )}
 </div>
 );
}

export default ReaderProfile;

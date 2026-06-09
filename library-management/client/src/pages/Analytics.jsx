import { useEffect, useMemo, useState } from "react";
import {
 AlertTriangle,
 BarChart3,
 BookOpen,
 Brain,
 CalendarDays,
 ClipboardList,
 LibraryBig,
 RefreshCw,
 Sparkles,
 TrendingUp,
} from "lucide-react";
import { getBooks, getLoans, getStats } from "../services/api";
import { LoadingState } from "../components/ui";

function clamp(value) {
 if (!Number.isFinite(value)) return 0;
 return Math.max(0, Math.min(100, Math.round(value)));
}

function getAvailableQuantity(book) {
 return Number(book.availableQuantity ?? book.quantity ?? 0);
}

function groupBy(items, getKey) {
 return items.reduce((result, item) => {
 const key = getKey(item) || "Chưa phân loại";
 result[key] = (result[key] || 0) + 1;
 return result;
 }, {});
}

function Analytics({ onNavigateToBooks, onNavigateToBorrow, onNavigateToOverdue }) {
 const [books, setBooks] = useState([]);
 const [loans, setLoans] = useState([]);
 const [summary, setSummary] = useState(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");

 const loadAnalytics = async () => {
 setLoading(true);
 setError("");

 try {
 const [bookData, loanData, statsData] = await Promise.all([getBooks(), getLoans(), getStats()]);
 setBooks(bookData);
 setLoans(loanData);
 setSummary(statsData);
 } catch (err) {
 setError(err.message || "Không thể tải dữ liệu phân tích.");
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 loadAnalytics();
 }, []);

 const analytics = useMemo(() => {
 const activeLoans = loans.filter((loan) => loan.status !== "returned");
 const overdueLoans = loans.filter((loan) => loan.status === "overdue");
 const availableBooks = books.reduce((total, book) => total + getAvailableQuantity(book), 0);
 const totalCopies = books.reduce((total, book) => total + Number(book.quantity || 0), 0);
 const categoryCounts = Object.entries(groupBy(books, (book) => book.category)).map(([label, value]) => ({ label, value })).sort((first, second) => second.value - first.value).slice(0, 8);
 const topBooks = (summary?.popularBooks || []).slice(0, 6).map((book) => ({ label: book.title, detail: book.author, value: Number(book.borrowedCount || 0) }));
 const monthlyActivity = summary?.monthlyActivity || [];
 const reservationQueue = summary?.reservationQueue || { totalWaiting: 0, readyToFulfill: 0, blockedByStock: 0 };
 const bookForecast = summary?.bookForecast || [];
 const hotCategories = summary?.hotCategories || [];
 const topReservationBooks = summary?.topReservationBooks || [];
 const monthlyMax = Math.max(
 1,...monthlyActivity.map((item) => Math.max(Number(item.borrowed || 0), Number(item.returned || 0)))
 );
 const categoryMax = Math.max(1,...categoryCounts.map((item) => item.value));
 const topMax = Math.max(1,...topBooks.map((item) => item.value));
 const activeTotal = Math.max(1, activeLoans.length);

 return {
 activeLoans,
 overdueLoans,
 availableBooks,
 totalCopies,
 categoryCounts,
 categoryMax,
 topBooks,
 topMax,
 monthlyActivity,
 monthlyMax,
 reservationQueue,
 bookForecast,
 hotCategories,
 topReservationBooks,
 circulationRate: totalCopies ? clamp((activeLoans.length / totalCopies) * 100) : 0,
 availableRate: totalCopies ? clamp((availableBooks / totalCopies) * 100) : 0,
 overdueRate: clamp((overdueLoans.length / activeTotal) * 100),
 missingImageRate: books.length ? clamp((Number(summary?.missingImageBooks || 0) / books.length) * 100) : 0,
 };
 }, [books, loans, summary]);

 const metricCards = [
 {
 label: "Tỷ lệ lưu thông",
 value: `${analytics.circulationRate}%`,
 helper: `${analytics.activeLoans.length} phiếu đang mở`,
 tone: "primary",
 icon: TrendingUp,
 onClick: onNavigateToBorrow,
 },
 {
 label: "Sách sẵn sàng",
 value: `${analytics.availableRate}%`,
 helper: `${analytics.availableBooks}/${analytics.totalCopies} bản còn lại`,
 tone: "success",
 icon: LibraryBig,
 onClick: onNavigateToBooks,
 },
 {
 label: "Quá hạn",
 value: `${analytics.overdueRate}%`,
 helper: `${analytics.overdueLoans.length} phiếu cần xử lý`,
 tone: analytics.overdueLoans.length > 0 ? "danger" : "success",
 icon: AlertTriangle,
 onClick: onNavigateToOverdue,
 },
 {
 label: "Thiếu ảnh",
 value: `${analytics.missingImageRate}%`,
 helper: `${summary?.missingImageBooks || 0} đầu sách`,
 tone: analytics.missingImageRate > 0 ? "warning" : "success",
 icon: BookOpen,
 onClick: onNavigateToBooks,
 },
 {
 label: "Đặt trước chờ",
 value: `${analytics.reservationQueue.totalWaiting}`,
 helper: `${analytics.reservationQueue.readyToFulfill} sẵn sàng`,
 tone: analytics.reservationQueue.totalWaiting > 0 ? "warning" : "success",
 icon: CalendarDays,
 onClick: onNavigateToBorrow,
 },
 ];

 const aiCommandCenter = useMemo(() => {
 const healthScore = clamp(
 100
 - analytics.overdueRate * 0.55
 - analytics.missingImageRate * 0.3
 - Math.min(25, analytics.reservationQueue.blockedByStock * 5)
 + Math.min(12, analytics.availableRate * 0.12)
 );
 const healthTone = healthScore >= 78 ? "success" : healthScore >= 55 ? "warning" : "danger";
 const topNeedBook = analytics.topReservationBooks[0];
 const topForecast = analytics.bookForecast[0] || analytics.hotCategories[0];
 const cleanupCount = Number(summary?.missingImageBooks || 0);

 const missions = [
 {
 title: analytics.overdueLoans.length > 0 ? "Xử lý quá hạn" : "Không có quá hạn lớn",
 value: analytics.overdueLoans.length,
 detail: analytics.overdueLoans.length > 0 ? "Ưu tiên nhắc độc giả và thu hồi sách" : "Nhịp trả sách đang ổn định",
 tone: analytics.overdueLoans.length > 0 ? "danger" : "success",
 action: onNavigateToOverdue,
 },
 {
 title: analytics.reservationQueue.blockedByStock > 0 ? "Gỡ hàng chờ bị nghẽn" : "Hàng chờ sẵn sàng",
 value: analytics.reservationQueue.blockedByStock,
 detail: analytics.reservationQueue.blockedByStock > 0 ? "Có lượt đặt trước đang thiếu tồn kho" : `${analytics.reservationQueue.readyToFulfill} yêu cầu có thể xử lý`,
 tone: analytics.reservationQueue.blockedByStock > 0 ? "warning" : "success",
 action: onNavigateToBorrow,
 },
 {
 title: cleanupCount > 0 ? "Dọn dữ liệu catalog" : "Catalog sạch",
 value: cleanupCount,
 detail: cleanupCount > 0 ? "Bổ sung ảnh bìa để độc giả dễ nhận diện" : "Ảnh bìa và dữ liệu chính đang tốt",
 tone: cleanupCount > 0 ? "warning" : "success",
 action: onNavigateToBooks,
 },
 ];

 const suggestions = [
 topNeedBook
 ? `Nhập thêm hoặc luân chuyển "${topNeedBook.title}" vì đang có ${topNeedBook.waitingCount} lượt đặt trước.`
 : "Chưa có sách nào tạo áp lực hàng chờ lớn.",
 topForecast
 ? `Theo dõi nhóm "${topForecast.category}" vì đang dẫn đầu nhu cầu mượn/đặt.`
 : "Chưa đủ dữ liệu để xác định nhóm thể loại nóng.",
 analytics.overdueRate > 20
 ? "Tạo chiến dịch nhắc hạn trả cho nhóm phiếu quá hạn trong tuần này."
 : "Duy trì nhịp nhắc hạn tự động cho các phiếu sắp đến hạn.",
 ];

 return {
 healthScore,
 healthTone,
 missions,
 suggestions,
 };
 }, [analytics, onNavigateToBooks, onNavigateToBorrow, onNavigateToOverdue, summary]);

 return (
 <div className="page-shell analytics-page">
 <div className="page-title row-between analytics-hero">
 <div>
 <span className="page-eyebrow">
 <BarChart3 size={16} />
 Library analytics
 </span>
 <h2>Phân tích thư viện</h2>
 <p>Theo dõi thể loại, sách được mượn nhiều, tỷ lệ quá hạn và xu hướng mượn trả theo tháng.</p>
 </div>
 <button className="secondary-button icon-label-button" type="button" onClick={loadAnalytics} disabled={loading}>
 <RefreshCw size={16} />
 <span>{loading ? "Đang tải..." : "Là m mới"}</span>
 </button>
 </div>

 {error && <div className="error-message">{error}</div>}
 {loading ? (
 <LoadingState lines={4} />
 ) : (
 <>
 <div className="analytics-metric-grid">
 {metricCards.map((item) => {
 const Icon = item.icon;
 return (
 <button className={`analytics-metric-card ${item.tone}`} type="button" key={item.label} onClick={item.onClick}>
 <span>
 <Icon size={20} />
 </span>
 <strong>{item.value}</strong>
 <em>{item.label}</em>
 <small>{item.helper}</small>
 </button>
 );
 })}
 </div>

 <section className={`table-card analytics-ai-command-center ${aiCommandCenter.healthTone}`}>
 <div className="analytics-ai-main">
 <div className="analytics-ai-heading">
 <span className="analytics-ai-icon"><Brain size={22} /></span>
 <div>
 <span className="page-eyebrow">AI Librarian Command Center</span>
 <h3>Trợ lý thủ thư thông minh</h3>
 </div>
 </div>
 <p>
 Tự tổng hợp quá hạn, hàng chờ đặt trước, tồn kho và chất lượng catalog để đề xuất việc nên xử lý trước.
 </p>
 <div className="analytics-ai-score">
 <strong>{aiCommandCenter.healthScore}</strong>
 <span>điểm sức khỏe vận hành</span>
 </div>
 </div>

 <div className="analytics-ai-missions">
 {aiCommandCenter.missions.map((mission) => (
 <button className={`analytics-ai-mission ${mission.tone}`} type="button" key={mission.title} onClick={mission.action}>
 <span>{mission.title}</span>
 <strong>{mission.value}</strong>
 <small>{mission.detail}</small>
 </button>
 ))}
 </div>

 <div className="analytics-ai-suggestions">
 <div className="analytics-ai-heading compact">
 <ClipboardList size={18} />
 <strong>Gợi ý hôm nay</strong>
 </div>
 <ul>
 {aiCommandCenter.suggestions.map((item) => (
 <li key={item}>{item}</li>
 ))}
 </ul>
 <button className="secondary-button icon-label-button" type="button" onClick={onNavigateToBooks}>
 <Sparkles size={16} />
 <span>Mở kho sách</span>
 </button>
 </div>
 </section>

 <div className="analytics-grid">
 <section className="table-card analytics-panel">
 <div className="table-card-header row-between">
 <div>
 <h3>Sách theo thể loại</h3>
 <p>Các nhóm thể loại có nhiều đầu sách nhất.</p>
 </div>
 </div>
 <div className="analytics-bar-list">
 {analytics.categoryCounts.map((item) => (
 <div className="analytics-bar-row" key={item.label}>
 <span>{item.label}</span>
 <div>
 <i style={{ width: `${Math.max(8, (item.value / analytics.categoryMax) * 100)}%` }} />
 </div>
 <strong>{item.value}</strong>
 </div>
 ))}
 {analytics.categoryCounts.length === 0 && <div className="empty-state compact">Chưa có dữ liệu thể loại.</div>}
 </div>
 </section>

 <section className="table-card analytics-panel">
 <div className="table-card-header row-between">
 <div>
 <h3>Top sách được mượn</h3>
 <p>Những đầu sách có lượt mượn cao nhất.</p>
 </div>
 </div>
 <div className="analytics-rank-list">
 {analytics.topBooks.map((item, index) => (
 <button type="button" key={`${item.label}-${index}`} onClick={onNavigateToBooks}>
 <strong>#{index + 1}</strong>
 <span>
 <b>{item.label}</b>
 <small>{item.detail || "Chưa có tác giả"}</small>
 </span>
 <i style={{ width: `${Math.max(8, (item.value / analytics.topMax) * 100)}%` }} />
 <em>{item.value}</em>
 </button>
 ))}
 {analytics.topBooks.length === 0 && <div className="empty-state compact">Chưa có dữ liệu mượn sách.</div>}
 </div>
 </section>
 </div>

 <section className="table-card analytics-panel">
 <div className="table-card-header row-between">
 <div>
 <h3>Dự báo nhu cầu</h3>
 <p>Xem thể loại mượn nhiều nhất và lượng đặt trước đang chờ.</p>
 </div>
 </div>
 {analytics.bookForecast.length === 0 ? (
 <div className="text-muted">Chưa có dữ liệu dự báo nhu cầu.</div>
 ) : (
 <div className="forecast-list">
 {analytics.bookForecast.map((item) => (
 <div className="forecast-list-item" key={item.category}>
 <strong>{item.category}</strong>
 <span>{item.borrowCount} lượt mượn</span>
 <small>{item.waitingReservations} lượt đặt chờ</small>
 </div>
 ))}
 </div>
 )}
 </section>

 <section className="table-card analytics-panel">
 <div className="table-card-header row-between">
 <div>
 <h3>Thể loại nóng</h3>
 <p>Định hướng bổ sung sách theo điểm nhu cầu mượn + đặt trước.</p>
 </div>
 </div>
 {analytics.hotCategories.length === 0 ? (
 <div className="text-muted">Chưa có dữ liệu thể loại nóng.</div>
 ) : (
 <div className="analytics-bar-list">
 {analytics.hotCategories.map((item) => (
 <div className="analytics-bar-row" key={item.category}>
 <span>{item.category}</span>
 <div>
 <i style={{ width: `${Math.max(8, (item.demandScore / Math.max(1, analytics.hotCategories[0]?.demandScore || 1)) * 100)}%` }} />
 </div>
 <strong>{item.borrowCount} mượn / {item.waitingReservations} đặt</strong>
 </div>
 ))}
 </div>
 )}
 </section>

 <section className="table-card analytics-panel">
 <div className="table-card-header row-between">
 <div>
 <h3>Sách đặt trước nhiều nhất</h3>
 <p>Những đầu sách có hàng chờ lớn nhất để ưu tiên luân chuyển.</p>
 </div>
 </div>
 {analytics.topReservationBooks.length === 0 ? (
 <div className="text-muted">Chưa có sách đặt trước.</div>
 ) : (
 <div className="analytics-rank-list">
 {analytics.topReservationBooks.map((item) => (
 <button type="button" key={item.id} onClick={onNavigateToBorrow}>
 <strong>{item.waitingCount}</strong>
 <span>
 <b>{item.title}</b>
 <small>{item.author || "Chưa rõ tác giả"}</small>
 </span>
 </button>
 ))}
 </div>
 )}
 </section>

 <section className="table-card analytics-panel">
 <div className="table-card-header row-between">
 <div>
 <h3>Xu hướng mượn trả theo tháng</h3>
 <p>So sánh lượt mượn và lượt trả để nhìn nhịp vận hành.</p>
 </div>
 <span className="badge">
 <CalendarDays size={14} />
 {analytics.monthlyActivity.length} tháng
 </span>
 </div>
 <div className="analytics-month-grid">
 {analytics.monthlyActivity.map((item) => (
 <div className="analytics-month-card" key={item.month}>
 <span>{item.month}</span>
 <div className="analytics-month-bars">
 <i className="borrowed" style={{ height: `${Math.max(8, (Number(item.borrowed || 0) / analytics.monthlyMax) * 100)}%` }} />
 <i className="returned" style={{ height: `${Math.max(8, (Number(item.returned || 0) / analytics.monthlyMax) * 100)}%` }} />
 </div>
 <strong>{item.borrowed}/{item.returned}</strong>
 </div>
 ))}
 {analytics.monthlyActivity.length === 0 && <div className="empty-state compact">Chưa có dữ liệu theo tháng.</div>}
 </div>
 <div className="analytics-legend">
 <span><i className="borrowed" /> Mượn</span>
 <span><i className="returned" /> Trả</span>
 </div>
 </section>
 </>
 )}
 </div>
 );
}

export default Analytics;

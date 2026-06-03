import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarDays,
  LibraryBig,
  RefreshCw,
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
    const categoryCounts = Object.entries(groupBy(books, (book) => book.category))
      .map(([label, value]) => ({ label, value }))
      .sort((first, second) => second.value - first.value)
      .slice(0, 8);
    const topBooks = (summary?.popularBooks || [])
      .slice(0, 6)
      .map((book) => ({ label: book.title, detail: book.author, value: Number(book.borrowedCount || 0) }));
    const monthlyActivity = summary?.monthlyActivity || [];
    const monthlyMax = Math.max(
      1,
      ...monthlyActivity.map((item) => Math.max(Number(item.borrowed || 0), Number(item.returned || 0)))
    );
    const categoryMax = Math.max(1, ...categoryCounts.map((item) => item.value));
    const topMax = Math.max(1, ...topBooks.map((item) => item.value));
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
  ];

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
          <span>{loading ? "Đang tải..." : "Làm mới"}</span>
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

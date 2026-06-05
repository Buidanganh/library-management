import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  BookOpenCheck,
  BrainCircuit,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Gauge,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getNotifications, getStats, sanitizeVietnameseText } from "../services/api";
import { EmptyState, LoadingState } from "../components/ui";

const COMPLETED_MISSIONS_KEY = "operationsCompletedMissions";

const formatCurrency = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toneFromScore(score) {
  if (score >= 82) return "success";
  if (score >= 62) return "warning";
  return "danger";
}

function normalizeOperationsText(value) {
  return sanitizeVietnameseText(String(value || ""))
    .replaceAll("c?n s?", "còn sẵn")
    .replaceAll("c?n x? l?", "cần xử lý")
    .replaceAll("y?u c?u", "yêu cầu")
    .replaceAll("dang ch?", "đang chờ")
    .replaceAll("phi?u", "phiếu");
}

function Operations({
  isAdmin = false,
  onNavigateToBooks,
  onNavigateToBorrow,
  onNavigateToOverdue,
  onNavigateToReaders,
  onNavigateToAnalytics,
}) {
  const [summary, setSummary] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missionFilter, setMissionFilter] = useState("all");
  const [completedMissions, setCompletedMissions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COMPLETED_MISSIONS_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const loadOperations = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [statsData, notificationData] = await Promise.all([getStats(), getNotifications()]);
      setSummary(statsData);
      setNotifications(notificationData);
    } catch (err) {
      setError(err.message || "Không thể tải trung tâm vận hành.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  const operatingScore = useMemo(() => {
    if (!summary) return 0;

    const totalBooks = Math.max(1, Number(summary.totalBooks || 0));
    const activeLoans = Number(summary.borrowed || 0) + Number(summary.overdue || 0);
    const overdueRate = activeLoans ? (Number(summary.overdue || 0) / activeLoans) * 100 : 0;
    const dueSoonPressure = Math.min(18, Number(summary.dueSoon || 0) * 4);
    const lowStockPressure = Math.min(18, (summary.lowStockBooks?.length || 0) * 5);
    const missingImagePressure = Math.min(14, (Number(summary.missingImageBooks || 0) / totalBooks) * 100);
    const queuePressure = Math.min(12, Number(summary.waitingReservations || 0) * 3);

    return clampScore(100 - overdueRate - dueSoonPressure - lowStockPressure - missingImagePressure - queuePressure);
  }, [summary]);

  const cockpitCards = useMemo(() => {
    if (!summary) return [];

    return [
      {
        label: "Điểm vận hành",
        value: `${operatingScore}/100`,
        detail: operatingScore >= 82 ? "Ổn định" : operatingScore >= 62 ? "Cần theo dõi" : "Cần xử lý ngay",
        tone: toneFromScore(operatingScore),
        icon: Gauge,
      },
      {
        label: "Việc cần xử lý",
        value: notifications.length,
        detail: `${summary.notificationDigest?.danger || 0} khẩn cấp, ${summary.notificationDigest?.warning || 0} cảnh báo`,
        tone: notifications.length > 0 ? "warning" : "success",
        icon: BellRing,
      },
      {
        label: "Phiếu quá hạn",
        value: summary.overdue || 0,
        detail: `Phạt dự kiến ${formatCurrency(summary.totalFines || 0)}`,
        tone: summary.overdue > 0 ? "danger" : "success",
        icon: AlertTriangle,
      },
      {
        label: "Hàng chờ đặt trước",
        value: summary.reservationQueue?.totalWaiting || 0,
        detail: `${summary.reservationQueue?.readyToFulfill || 0} có thể chuyển sang mượn`,
        tone: summary.reservationQueue?.totalWaiting > 0 ? "warning" : "success",
        icon: ClipboardCheck,
      },
    ];
  }, [notifications.length, operatingScore, summary]);

  const missionQueue = useMemo(() => {
    if (!summary) return [];

    const lowStockCount = summary.lowStockBooks?.length || 0;
    const fromStats = isAdmin
      ? [
          {
            id: "plan-overdue",
            title: "Quản lý quá hạn",
            detail: `${summary.overdue || 0} phiếu quá hạn cần xử lý`,
            tone: summary.overdue > 0 ? "danger" : "success",
            action: onNavigateToOverdue,
            actionLabel: summary.overdue > 0 ? "Xử lý" : "Mở",
          },
          {
            id: "plan-reservations",
            title: "Xử lý đặt trước",
            detail: `${summary.reservationQueue?.totalWaiting || 0} yêu cầu đang chờ`,
            tone: summary.reservationQueue?.totalWaiting > 0 ? "warning" : "success",
            action: onNavigateToBorrow,
            actionLabel: "Mở",
          },
          {
            id: "plan-inventory",
            title: "Kiểm kho",
            detail: `${lowStockCount} đầu sách sắp cạn`,
            tone: lowStockCount > 0 ? "warning" : "success",
            action: onNavigateToBooks,
            actionLabel: "Mở",
          },
        ]
      : [
          {
            id: "plan-my-overdue",
            title: "Xử lý quá hạn của bạn",
            detail: `${summary.overdue || 0} phiếu quá hạn`,
            tone: summary.overdue > 0 ? "danger" : "success",
            action: onNavigateToOverdue,
            actionLabel: summary.overdue > 0 ? "Xử lý" : "Mở",
          },
          {
            id: "plan-my-due-soon",
            title: "Sắp đến hạn",
            detail: `${summary.dueSoon || 0} phiếu trong 3 ngày tới`,
            tone: summary.dueSoon > 0 ? "warning" : "success",
            action: onNavigateToBorrow,
            actionLabel: "Mở",
          },
          {
            id: "plan-my-reservations",
            title: "Đặt trước",
            detail: `${summary.waitingReservations || 0} yêu cầu đang chờ`,
            tone: summary.waitingReservations > 0 ? "warning" : "success",
            action: onNavigateToBorrow,
            actionLabel: "Mở",
          },
        ];

    const fromNotifications = notifications.slice(0, 4).map((item) => ({
      id: item.id,
      title: normalizeOperationsText(item.title),
      detail: normalizeOperationsText(item.message),
      tone: item.tone || "info",
      action: item.target === "overdue" ? onNavigateToOverdue : onNavigateToBorrow,
      actionLabel: "Đi tới",
    }));

    return [...fromStats, ...fromNotifications].slice(0, 7);
  }, [isAdmin, notifications, onNavigateToBooks, onNavigateToBorrow, onNavigateToOverdue, summary]);

  const visibleMissionQueue = useMemo(
    () =>
      missionQueue.filter((item) => {
        if (completedMissions[item.id]) return false;
        if (missionFilter === "all") return true;
        if (missionFilter === "urgent") return item.tone === "danger" || item.tone === "warning";
        return item.tone === missionFilter;
      }),
    [completedMissions, missionFilter, missionQueue]
  );

  const completedCount = missionQueue.filter((item) => completedMissions[item.id]).length;

  const serviceLanes = useMemo(() => {
    if (!summary) return [];

    return [
      {
        label: "Circulation SLA",
        value: `${Number(summary.dueSoon || 0)} sắp hạn`,
        detail: Number(summary.overdue || 0) > 0 ? `${summary.overdue} phiếu đã trễ hạn` : "Không có phiếu trễ hạn",
        tone: Number(summary.overdue || 0) > 0 ? "danger" : Number(summary.dueSoon || 0) > 0 ? "warning" : "success",
      },
      {
        label: "Reservation SLA",
        value: `${summary.reservationQueue?.readyToFulfill || 0} sẵn sàng`,
        detail: `${summary.reservationQueue?.blockedByStock || 0} yêu cầu còn chờ sách`,
        tone: Number(summary.reservationQueue?.readyToFulfill || 0) > 0 ? "warning" : "success",
      },
      {
        label: "Inventory SLA",
        value: `${summary.lowStockBooks?.length || 0} sắp cạn`,
        detail: `${summary.missingImageBooks || 0} sách thiếu ảnh bìa`,
        tone: (summary.lowStockBooks?.length || 0) > 0 || Number(summary.missingImageBooks || 0) > 0 ? "warning" : "success",
      },
      {
        label: "Data & Access SLA",
        value: isAdmin ? `${summary.roleSummary?.locked || 0} khóa` : "Cá nhân hóa",
        detail: isAdmin ? `${summary.roleSummary?.admins || 0} admin, ${summary.roleSummary?.librarians || 0} thủ thư` : "Chỉ hiện dữ liệu của tài khoản hiện tại",
        tone: Number(summary.roleSummary?.locked || 0) > 0 ? "warning" : "success",
      },
    ];
  }, [isAdmin, summary]);

  const completeMission = (missionId) => {
    setCompletedMissions((current) => {
      const next = { ...current, [missionId]: true };
      localStorage.setItem(COMPLETED_MISSIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetCompletedMissions = () => {
    setCompletedMissions({});
    localStorage.removeItem(COMPLETED_MISSIONS_KEY);
  };

  if (loading) {
    return (
      <div className="page-shell operations-page">
        <LoadingState lines={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-shell operations-page">
        <div className="error-message">{error}</div>
        <button className="secondary-button" type="button" onClick={loadOperations}>
          <RefreshCw size={16} />
          Tải lại
        </button>
      </div>
    );
  }

  return (
    <div className="page-shell operations-page">
      <div className="operations-hero">
        <div>
          <span className="page-eyebrow">Library OS</span>
          <h2>Trung tâm vận hành thư viện</h2>
          <p>Gom dashboard, cảnh báo, hàng chờ, rủi ro và gợi ý hành động vào một cockpit duy nhất.</p>
          <div className="operations-hero-pills">
            <span>{notifications.length} cảnh báo</span>
            <span>{summary?.dueSoon || 0} sắp hạn</span>
            <span>{summary?.lowStockBooks?.length || 0} sách cần kiểm</span>
          </div>
        </div>
        <div className={`operations-score ${toneFromScore(operatingScore)}`}>
          <div className="operations-score-ring">
            <span>Health</span>
            <strong>{operatingScore}</strong>
            <small>/100</small>
          </div>
        </div>
      </div>

      <div className="operations-cockpit-grid">
        {cockpitCards.map((card) => {
          const Icon = card.icon;

          return (
            <article className={`operations-cockpit-card ${card.tone}`} key={card.label}>
              <div className="operations-card-icon">
                <Icon size={20} />
              </div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </article>
          );
        })}
      </div>

      <div className="operations-sla-grid">
        {serviceLanes.map((lane) => (
          <article className={`operations-sla-card ${lane.tone}`} key={lane.label}>
            <span>{lane.label}</span>
            <strong>{lane.value}</strong>
            <small>{lane.detail}</small>
          </article>
        ))}
      </div>

      <div className="operations-grid">
        <section className="table-card operations-panel">
          <div className="table-card-header row-between">
            <div>
              <h3>Mission queue</h3>
              <p>Các việc nên xử lý trước để giữ thư viện vận hành trơn tru.</p>
            </div>
            <div className="operations-queue-actions">
              <label>
                <Filter size={15} />
                <select value={missionFilter} onChange={(event) => setMissionFilter(event.target.value)}>
                  <option value="all">Tất cả</option>
                  <option value="urgent">Khẩn/cần theo dõi</option>
                  <option value="danger">Chỉ khẩn cấp</option>
                  <option value="warning">Chỉ cảnh báo</option>
                  <option value="success">Ổn định</option>
                </select>
              </label>
              {completedCount > 0 && (
                <button className="secondary-button" type="button" onClick={resetCompletedMissions}>
                  <CheckCheck size={16} />
                  Hiện lại {completedCount}
                </button>
              )}
              <button className="secondary-button" type="button" onClick={loadOperations}>
                <RefreshCw size={16} />
                Làm mới
              </button>
            </div>
          </div>

          {visibleMissionQueue.length === 0 ? (
            <EmptyState title="Không có việc phù hợp" description="Không còn cảnh báo trong bộ lọc hiện tại." />
          ) : (
            <div className="mission-list">
              {visibleMissionQueue.map((item) => (
                <article className={`mission-item ${item.tone}`} key={item.id}>
                  <i className="mission-priority-dot" />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <div className="mission-actions">
                    {item.action && (
                      <button className="small-button" type="button" onClick={item.action}>
                        {item.actionLabel}
                      </button>
                    )}
                    <button className="small-button" type="button" onClick={() => completeMission(item.id)}>
                      Đã xử lý
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="table-card operations-panel">
          <div className="table-card-header">
            <h3>Luồng tự động</h3>
            <p>Những workflow lớn đã được hệ thống theo dõi như một Library OS.</p>
          </div>
          <div className="automation-flow">
            <article>
              <CalendarClock size={18} />
              <strong>Nhắc hạn</strong>
              <span>{summary?.dueSoon || 0} phiếu sắp đến hạn trong 3 ngày.</span>
            </article>
            <article>
              <Route size={18} />
              <strong>Đặt trước sang mượn</strong>
              <span>{summary?.reservationQueue?.readyToFulfill || 0} yêu cầu có thể xử lý ngay.</span>
            </article>
            <article>
              <ShieldCheck size={18} />
              <strong>Rủi ro độc giả</strong>
              <span>{isAdmin ? `${summary?.roleSummary?.locked || 0} tài khoản đang khóa.` : "Hồ sơ cá nhân được lọc theo tài khoản đăng nhập."}</span>
            </article>
            <article>
              <BookOpenCheck size={18} />
              <strong>Kiểm kho</strong>
              <span>{summary?.lowStockBooks?.length || 0} đầu sách sắp cạn hoặc hết bản sẵn.</span>
            </article>
          </div>
        </section>
      </div>

      <div className="operations-grid">
        <section className="table-card operations-panel">
          <div className="table-card-header">
            <h3>Gợi ý AI vận hành</h3>
            <p>Ưu tiên dựa trên lịch sử mượn, tồn kho và nhu cầu đặt trước.</p>
          </div>
          <div className="ai-suggestion-list">
            {(summary?.recommendedBooks || []).slice(0, 5).map((book) => (
            <article key={book.id}>
                <div className="ai-suggestion-rank">
                  <BrainCircuit size={16} />
                </div>
                <div>
                  <strong>{book.title}</strong>
                  <span>{book.recommendationReason || "Nên giới thiệu"} · còn {book.availableQuantity} bản</span>
                </div>
              </article>
            ))}
            {(summary?.recommendedBooks || []).length === 0 && (
              <EmptyState title="Chưa có gợi ý sách" description="Khi có thêm lịch sử mượn, hệ thống sẽ đề xuất sách phù hợp hơn." />
            )}
          </div>
        </section>

        <section className="table-card operations-panel">
          <div className="table-card-header">
            <h3>Đường tắt vận hành</h3>
            <p>Mở nhanh các module cốt lõi của Library OS.</p>
          </div>
          <div className="operations-shortcuts">
            <button type="button" onClick={onNavigateToBorrow}>
              <ClipboardCheck size={18} />
              Mượn / trả
            </button>
            <button type="button" onClick={onNavigateToOverdue}>
              <AlertTriangle size={18} />
              Quá hạn
            </button>
            <button type="button" onClick={onNavigateToBooks}>
              <BookOpenCheck size={18} />
              Kho sách
            </button>
            {isAdmin && (
              <button type="button" onClick={onNavigateToReaders}>
                <ShieldCheck size={18} />
                Độc giả & quyền
              </button>
            )}
            <button type="button" onClick={onNavigateToAnalytics}>
              <Sparkles size={18} />
              Phân tích
            </button>
          </div>
        </section>
      </div>

      <div className="operations-status-strip">
        <span><CheckCircle2 size={16} /> Portal độc giả</span>
        <span><CheckCircle2 size={16} /> Notification center</span>
        <span><CheckCircle2 size={16} /> Workflow mượn trả</span>
        <span><CheckCircle2 size={16} /> Analytics & audit</span>
      </div>
    </div>
  );
}

export default Operations;

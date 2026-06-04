import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarClock,
  CircleDollarSign,
  History,
  Mail,
  ShieldCheck,
  Star,
  UserCircle,
  WalletCards,
} from "lucide-react";
import { createReview, extendLoan, getReaderLoans, getReaders, getReservations } from "../services/api";

const formatCurrency = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);

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
  return String(reader?.name || user?.fullName || reader?.email || user?.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase() || "?";
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
      unpaidFines: loans
        .filter((loan) => loan.fineStatus === "unpaid")
        .reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
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
      [
        ...activeLoans.map((loan) => ({
          id: `loan-${loan.id}`,
          type: loan.status,
          title: loan.bookTitle,
          meta: `${getStatusLabel(loan.status)} - ${getDueText(loan)}`,
          date: loan.dueDate,
        })),
        ...returnedLoans.slice(0, 8).map((loan) => ({
          id: `returned-${loan.id}`,
          type: "returned",
          title: loan.bookTitle,
          meta: `Đã trả ${loan.returnedDate || "-"}`,
          date: loan.returnedDate || loan.dueDate,
        })),
        ...reservations.slice(0, 6).map((reservation) => ({
          id: `reservation-${reservation.id}`,
          type: reservation.status === "waiting" ? "reserved" : reservation.status,
          title: reservation.bookTitle,
          meta: reservation.status === "waiting" ? "Đang chờ đặt trước" : "Đặt trước đã xử lý",
          date: reservation.createdAt,
        })),
      ]
        .filter((item) => item.date)
        .sort((first, second) => new Date(second.date) - new Date(first.date))
        .slice(0, 10),
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

  const handleExtend = async (loan) => {
    const nextDueDate = new Date(new Date(loan.dueDate).getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

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
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
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
                <select value={reviewForm.bookId} onChange={(event) => setReviewForm((state) => ({ ...state, bookId: event.target.value }))}>
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
                <select value={reviewForm.rating} onChange={(event) => setReviewForm((state) => ({ ...state, rating: event.target.value }))}>
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
                  onChange={(event) => setReviewForm((state) => ({ ...state, comment: event.target.value }))}
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
    </div>
  );
}

export default ReaderProfile;

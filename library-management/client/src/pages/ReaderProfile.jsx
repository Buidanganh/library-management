import { useEffect, useMemo, useState } from "react";
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

function ReaderProfile({ user }) {
  const [reader, setReader] = useState(null);
  const [loans, setLoans] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);
  const [reviewForm, setReviewForm] = useState({ bookId: "", rating: 5, comment: "" });
  const [error, setError] = useState("");

  const loadProfile = async () => {
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
  };

  useEffect(() => {
    loadProfile();
  }, [user.readerId]);

  const activeLoans = useMemo(
    () => loans.filter((loan) => loan.status === "borrowed" || loan.status === "overdue"),
    [loans]
  );

  const returnedLoans = useMemo(
    () => loans.filter((loan) => loan.status === "returned"),
    [loans]
  );

  const summary = useMemo(
    () => ({
      active: activeLoans.length,
      overdue: activeLoans.filter((loan) => loan.status === "overdue").length,
      totalFines: loans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
      unpaidFines: loans
        .filter((loan) => loan.fineStatus === "unpaid")
        .reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
    }),
    [activeLoans, loans]
  );

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
          <div className="profile-summary-grid">
            <div className="profile-panel">
              <h3>{reader.name || user.fullName}</h3>
              <div className="modal-summary">
                <span>Email: <strong>{reader.email || user.email}</strong></span>
                <span>Số điện thoại: <strong>{reader.phone || "-"}</strong></span>
                <span>Mã độc giả: <strong>#{reader.id}</strong></span>
                <span>Tài khoản: <strong>{reader.accountStatus === "locked" ? "Đã khóa" : "Hoạt động"}</strong></span>
              </div>
            </div>

            <div className="metric-card">
              <span>Đang mượn</span>
              <strong>{summary.active}</strong>
              <small>{summary.overdue} phiếu quá hạn</small>
            </div>
            <div className="metric-card">
              <span>Tổng phạt</span>
              <strong>{formatCurrency(summary.totalFines)}</strong>
              <small>Còn nợ {formatCurrency(summary.unpaidFines)}</small>
            </div>
            <div className="metric-card">
              <span>Lịch sử</span>
              <strong>{returnedLoans.length}</strong>
              <small>Phiếu đã trả</small>
            </div>
          </div>

          <div className="table-card" style={{ marginTop: 24 }}>
            <div className="table-card-header row-between">
              <div>
                <h3>Sách đang mượn</h3>
                <p>Có thể gia hạn nhanh thêm 7 ngày cho phiếu chưa trả.</p>
              </div>
            </div>
            {activeLoans.length === 0 ? (
              <div className="empty-state compact">Bạn chưa có sách đang mượn.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm">
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
                        <td>{loan.bookTitle}</td>
                        <td>{loan.borrowedDate}</td>
                        <td>{loan.dueDate}</td>
                        <td>
                          <span className={loan.status === "overdue" ? "badge danger" : "badge success"}>
                            {getDueText(loan)}
                          </span>
                        </td>
                        <td>
                          {loan.fineAmount ? (
                            <div className="stacked-cell">
                              <strong>{formatCurrency(loan.fineAmount)}</strong>
                              <span className={loan.fineStatus === "unpaid" ? "badge warning" : "badge"}>
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
              <span className="badge">{reservations.filter((item) => item.status === "waiting").length} đang chờ</span>
            </div>
            {reservations.length === 0 ? (
              <div className="empty-state compact">Bạn chưa đặt trước sách nào.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm">
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
                        <td>{item.bookTitle}</td>
                        <td>{new Date(item.createdAt).toLocaleDateString("vi-VN")}</td>
                        <td>
                          <span className={item.status === "waiting" ? "badge warning" : item.status === "fulfilled" ? "badge success" : "badge"}>
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

          <div className="table-card" style={{ marginTop: 24 }}>
            <div className="table-card-header row-between">
              <div>
                <h3>Đánh giá sách</h3>
                <p>Gửi nhận xét cho sách bạn đã từng mượn.</p>
              </div>
            </div>
            <form className="form-grid" onSubmit={handleReviewSubmit}>
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

          <div className="table-card" style={{ marginTop: 24 }}>
            <div className="table-card-header row-between">
              <div>
                <h3>Lịch sử mượn trả</h3>
                <p>Danh sách phiếu đã trả gần nhất.</p>
              </div>
              <span className="badge">{returnedLoans.length} phiếu</span>
            </div>
            <div className="table-responsive">
              <table className="table table-sm">
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
                  {returnedLoans.slice(0, 12).map((loan) => (
                    <tr key={loan.id}>
                      <td>#{loan.id}</td>
                      <td>{loan.bookTitle}</td>
                      <td>{loan.borrowedDate}</td>
                      <td>{loan.returnedDate || "-"}</td>
                      <td>{getStatusLabel(loan.status)}</td>
                      <td>{loan.fineAmount ? formatCurrency(loan.fineAmount) : "-"}</td>
                    </tr>
                  ))}

                  {returnedLoans.length === 0 && (
                    <tr>
                      <td colSpan="6" className="empty-table">
                        Chưa có lịch sử trả sách.
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

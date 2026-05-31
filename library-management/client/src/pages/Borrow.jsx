import { useEffect, useMemo, useState } from "react";
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

const MAX_ACTIVE_LOANS_PER_READER = 5;

const getDefaultDueDate = () =>
  new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

const getToday = () => new Date().toISOString().split("T")[0];

const formatCurrency = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);

function getDateAfterDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
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
  const csv = [headers.join(","),
    ...rows.map((row) => row.map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(","))
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
  const [statusFilter, setStatusFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
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

  const loadData = async () => {
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
  };

  useEffect(() => {
    const initialize = async () => {
      setFormData((prevState) => ({
        ...prevState,
        dueDate: getDefaultDueDate(),
      }));

      await loadData();
    };

    initialize();
  }, []);

  const selectedReader = useMemo(
    () => readers.find((reader) => reader.id === Number(formData.readerId)),
    [readers, formData.readerId]
  );

  const selectedBook = useMemo(
    () => books.find((book) => book.id === Number(formData.bookId)),
    [books, formData.bookId]
  );

  const selectedReaderActiveLoans = Number(selectedReader?.booksBorrowed || 0);
  const selectedReaderReachedLimit =
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

  const urgentLoans = useMemo(
    () =>
      loans
        .filter((loan) => loan.status === "overdue" || isDueSoon(loan))
        .sort((first, second) => {
          if (first.status !== second.status) {
            return first.status === "overdue" ? -1 : 1;
          }
          return new Date(first.dueDate) - new Date(second.dueDate);
        })
        .slice(0, 5),
    [loans]
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const setQuickDueDate = (days) => {
    setFormData((prevState) => ({
      ...prevState,
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
    )
      .toISOString()
      .split("T")[0];

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

  const handleFineStatus = async (loan, fineStatus) => {
    if (!loan?.id) return;
    setSubmitting(true);

    try {
      await updateLoanFineStatus(loan.id, fineStatus);
      await loadData();
    } catch (err) {
      alert(err.message || "Không thể cập nhật trạng thái tiền phạt.");
    } finally {
      setSubmitting(false);
    }
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

  const availableBooks = books.filter(
    (book) => (book.availableQuantity ?? book.quantity) > 0
  );

  const canSubmitBorrow =
    !submitting &&
    Boolean(formData.readerId) &&
    Boolean(formData.bookId) &&
    Boolean(formData.dueDate) &&
    !selectedReaderReachedLimit &&
    !selectedReaderAlreadyBorrowingBook;

  return (
    <div className="page-shell borrow-page">
      <div className="page-title row-between">
        <div>
          <h2>Mượn / Trả sách</h2>
          <p>Quản lý phiếu mượn, gia hạn và trả sách trực tiếp với backend.</p>
        </div>
        <div className="button-group">
          <button className="secondary-button" type="button" onClick={() => exportLoansAsJson(filteredLoans)}>
            Xuất phiếu JSON
          </button>
          <button className="secondary-button" type="button" onClick={() => exportLoansAsCsv(filteredLoans)}>
            Xuất phiếu CSV
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="borrow-operations-grid">
        <div className="table-card">
          <h3>Phiếu mượn mới</h3>
          <form className="form-grid" onSubmit={handleBorrow}>
            <div className="form-group">
              <label>Độc giả</label>
              <select name="readerId" value={formData.readerId} onChange={handleChange}>
                <option value="">Chọn độc giả</option>
                {readers.map((reader) => (
                  <option key={reader.id} value={reader.id}>
                    {reader.name} - đang mượn {reader.booksBorrowed ?? 0}/{MAX_ACTIVE_LOANS_PER_READER}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Sách</label>
              <select name="bookId" value={formData.bookId} onChange={handleChange}>
                <option value="">Chọn sách</option>
                {availableBooks.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title} - Còn lại {book.availableQuantity ?? book.quantity}
                  </option>
                ))}
              </select>
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

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={!canSubmitBorrow}>
                {submitting ? "Đang xử lý..." : "Tạo phiếu mượn"}
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
            <span className="badge">{reservations.filter((item) => item.status === "waiting").length} đang chờ</span>
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
              Xóa bộ lọc
            </button>
          </div>
        </div>

        {loading ? (
          <div className="skeleton-panel">
            <span />
            <span />
            <span />
          </div>
        ) : loans.length === 0 ? (
          <div className="empty-state">Chưa có phiếu mượn nào.</div>
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
                            onClick={() => handleFineStatus(loan, "paid")}
                            disabled={submitting}
                          >
                            Đã thu phạt
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
                  setExtendModal((current) => ({ ...current, dueDate: event.target.value }))
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

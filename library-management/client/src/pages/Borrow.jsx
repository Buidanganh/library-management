import { useEffect, useMemo, useState } from "react";
import { borrowBook, extendLoan, getBooks, getLoans, getReaders, returnLoan } from "../services/api";

const MAX_ACTIVE_LOANS_PER_READER = 5;

const getDefaultDueDate = () =>
  new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

const getToday = () => new Date().toISOString().split("T")[0];

function getStatusLabel(status) {
  if (status === "borrowed") return "Đang mượn";
  if (status === "overdue") return "Quá hạn";
  if (status === "returned") return "Đã trả";
  return status;
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
  const headers = ["id", "readerName", "bookTitle", "status", "borrowedDate", "dueDate", "lateDays", "fineAmount"];
  const rows = loans.map((loan) => [
    loan.id,
    loan.readerName,
    loan.bookTitle,
    loan.status,
    loan.borrowedDate || "",
    loan.dueDate || "",
    loan.lateDays ?? 0,
    loan.fineAmount ?? 0,
  ]);
  const csv = [headers.join(","),
    ...rows.map((row) => row.map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  downloadFile(csv, "loans.csv", "text/csv;charset=utf-8;");
}

function Borrow() {
  const [readers, setReaders] = useState([]);
  const [books, setBooks] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formData, setFormData] = useState({
    readerId: "",
    bookId: "",
    dueDate: "",
  });

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [readerData, bookData, loanData] = await Promise.all([
        getReaders(),
        getBooks(),
        getLoans(),
      ]);

      setReaders(readerData);
      setBooks(bookData);
      setLoans(loanData);
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
      const matchesQuery =
        !query ||
        [loan.readerName, loan.bookTitle, String(loan.id)].some((value) =>
          String(value || "").toLowerCase().includes(query)
        );

      return matchesStatus && matchesQuery;
    });
  }, [loans, searchQuery, statusFilter]);

  const loanSummary = useMemo(() => {
    const today = new Date(getToday());
    const msPerDay = 24 * 60 * 60 * 1000;

    return {
      borrowed: loans.filter((loan) => loan.status === "borrowed").length,
      overdue: loans.filter((loan) => loan.status === "overdue").length,
      returned: loans.filter((loan) => loan.status === "returned").length,
      dueSoon: loans.filter((loan) => {
        if (loan.status !== "borrowed" || !loan.dueDate) return false;
        const dueDate = new Date(loan.dueDate);
        const diff = dueDate.getTime() - today.getTime();
        return diff >= 0 && diff <= 3 * msPerDay;
      }).length,
    };
  }, [loans]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
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

  const handleExtend = async (loan) => {
    const defaultDate = new Date(
      new Date(loan.dueDate).getTime() + 7 * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split("T")[0];
    const nextDueDate = window.prompt("Nhập hạn trả mới (YYYY-MM-DD):", defaultDate);

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

  const handleReturn = async (loanId) => {
    const confirmed = window.confirm("Xác nhận trả sách này?");
    if (!confirmed) {
      return;
    }

    setSubmitting(true);

    try {
      await returnLoan(loanId);
      await loadData();
    } catch (err) {
      alert(err.message || "Không thể trả sách.");
    } finally {
      setSubmitting(false);
    }
  };

  const availableBooks = books.filter(
    (book) => (book.availableQuantity ?? book.quantity) > 0
  );

  const canSubmitBorrow =
    !submitting && !selectedReaderReachedLimit && !selectedReaderAlreadyBorrowingBook;

  return (
    <div>
      <div className="page-title row-between">
        <div>
          <h2>Mượn / Trả sách</h2>
          <p>Quản lý phiếu mượn, gia hạn và trả sách trực tiếp với backend.</p>
        </div>
        <div className="button-group">
          <button className="secondary-button" type="button" onClick={() => exportLoansAsJson(loans)}>
            Xuất phiếu JSON
          </button>
          <button className="secondary-button" type="button" onClick={() => exportLoansAsCsv(loans)}>
            Xuất phiếu CSV
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

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
          </div>

          <div className="form-group full">
            {selectedReader && (
              <div className="success-message">
                {selectedReader.name} đang mượn {selectedReaderActiveLoans}/
                {MAX_ACTIVE_LOANS_PER_READER} sách.
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

      <div className="table-card" style={{ marginTop: 24 }}>
        <div className="table-card-header row-between">
          <h3>Danh sách phiếu mượn</h3>
          <div className="loan-summary">
            <span>Đang mượn: {loanSummary.borrowed}</span>
              <span>Sắp đến hạn: {loanSummary.dueSoon}</span>
            <span>Đã trả: {loanSummary.returned}</span>
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
        </div>

        {loading ? (
          <div className="empty-state">Đang tải dữ liệu mượn...</div>
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
                    {loan.status === "borrowed" && loan.dueDate &&
                      new Date(loan.dueDate).getTime() - new Date(getToday()).getTime() <=
                        3 * 24 * 60 * 60 * 1000 &&
                      new Date(loan.dueDate).getTime() >= new Date(getToday()).getTime() && (
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
                          onClick={() => handleExtend(loan)}
                          disabled={submitting}
                        >
                          Gia hạn
                        </button>
                        <button
                          className="small-button"
                          type="button"
                          onClick={() => handleReturn(loan.id)}
                          disabled={submitting}
                        >
                          Trả sách
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {filteredLoans.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-table">
                    Không tìm thấy phiếu mượn phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Borrow;

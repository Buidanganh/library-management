import { useEffect, useState } from "react";
import { borrowBook, getBooks, getLoans, getReaders, returnLoan } from "../services/api";

const getDefaultDueDate = () =>
  new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

function Borrow() {
  const [readers, setReaders] = useState([]);
  const [books, setBooks] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

    const selectedBook = books.find((book) => book.id === Number(bookId));
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
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      });
    } catch (err) {
      alert(err.message || "Không thể tạo phiếu mượn.");
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

  return (
    <div>
      <div className="page-title row-between">
        <div>
          <h2>Mượn / Trả sách</h2>
          <p>Quản lý phiếu mượn và trả sách trực tiếp với backend.</p>
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
                  {reader.name}
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
              value={formData.dueDate}
              onChange={handleChange}
            />
          </div>

          <div className="form-group full" />

          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "Đang xử lý..." : "Tạo phiếu mượn"}
            </button>
          </div>
        </form>
      </div>

      <div className="table-card" style={{ marginTop: 24 }}>
        <h3>Danh sách phiếu mượn</h3>
        {loading ? (
          <div className="empty-state">Đang tải dữ liệu mượn...</div>
        ) : loans.length === 0 ? (
          <div className="empty-state">Chưa có phiếu mượn nào.</div>
        ) : (
          <table>
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
              {loans.map((loan) => (
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
                      {loan.status === "borrowed"
                        ? "Đang mượn"
                        : loan.status === "overdue"
                        ? "Quá hạn"
                        : "Đã trả"}
                    </span>
                  </td>
                  <td>
                    {loan.status === "borrowed" && (
                      <button
                        className="small-button"
                        onClick={() => handleReturn(loan.id)}
                        disabled={submitting}
                      >
                        Trả sách
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Borrow;

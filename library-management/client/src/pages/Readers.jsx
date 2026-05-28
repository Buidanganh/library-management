import { useEffect, useMemo, useState } from "react";
import BookTable from "../components/BookTable";
import {
  createReader,
  deleteReader,
  getBooks,
  getReaderLoans,
  getReaders,
  updateReader,
} from "../services/api";

function getStatusLabel(status) {
  if (status === "borrowed") return "Đang mượn";
  if (status === "overdue") return "Quá hạn";
  if (status === "returned") return "Đã trả";
  return status;
}

function Readers({ onNavigateToCreate, onEditBook, onDeleteBook }) {
  const [readers, setReaders] = useState([]);
  const [books, setBooks] = useState([]);
  const [loadingReaders, setLoadingReaders] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [errorReaders, setErrorReaders] = useState("");
  const [errorBooks, setErrorBooks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingReaderId, setEditingReaderId] = useState(null);
  const [selectedReader, setSelectedReader] = useState(null);
  const [readerLoans, setReaderLoans] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [borrowFilter, setBorrowFilter] = useState("");
  const [readerForm, setReaderForm] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const loadData = async () => {
    setLoadingReaders(true);
    setErrorReaders("");
    setLoadingBooks(true);
    setErrorBooks("");

    try {
      const [readerData, bookData] = await Promise.all([getReaders(), getBooks()]);
      setReaders(readerData);
      setBooks(bookData);
    } catch (err) {
      const message = err.message || "Không thể tải dữ liệu.";
      setErrorReaders(message);
      setErrorBooks(message);
    } finally {
      setLoadingReaders(false);
      setLoadingBooks(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredReaders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return readers.filter((reader) => {
      const borrowedCount = Number(reader.booksBorrowed || 0);
      const matchesBorrowFilter =
        !borrowFilter ||
        (borrowFilter === "active" && borrowedCount > 0) ||
        (borrowFilter === "inactive" && borrowedCount === 0);
      const matchesQuery =
        !query ||
        [reader.name, reader.email, reader.phone, String(reader.id)].some((value) =>
          String(value || "").toLowerCase().includes(query)
        );

      return matchesBorrowFilter && matchesQuery;
    });
  }, [readers, searchQuery, borrowFilter]);

  const readerSummary = useMemo(
    () => ({
      total: readers.length,
      active: readers.filter((reader) => Number(reader.booksBorrowed || 0) > 0).length,
      inactive: readers.filter((reader) => Number(reader.booksBorrowed || 0) === 0).length,
    }),
    [readers]
  );

  const resetReaderForm = () => {
    setEditingReaderId(null);
    setReaderForm({
      name: "",
      email: "",
      phone: "",
    });
  };

  const handleReaderChange = (event) => {
    const { name, value } = event.target;
    setReaderForm((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleEditReader = (reader) => {
    setEditingReaderId(reader.id);
    setReaderForm({
      name: reader.name || "",
      email: reader.email || "",
      phone: reader.phone || "",
    });
  };

  const handleSaveReader = async (event) => {
    event.preventDefault();
    setErrorReaders("");

    if (!readerForm.name || !readerForm.email) {
      setErrorReaders("Vui lòng nhập họ tên và email độc giả.");
      return;
    }

    setSubmitting(true);

    try {
      if (editingReaderId) {
        await updateReader(editingReaderId, readerForm);
      } else {
        await createReader(readerForm);
      }

      resetReaderForm();
      await loadData();
    } catch (err) {
      setErrorReaders(err.message || "Không thể lưu độc giả.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewHistory = async (reader) => {
    setSelectedReader(reader);
    setReaderLoans([]);
    setHistoryError("");
    setLoadingHistory(true);

    try {
      const loans = await getReaderLoans(reader.id);
      setReaderLoans(loans);
    } catch (err) {
      setHistoryError(err.message || "Không thể tải lịch sử mượn.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDeleteReader = async (reader) => {
    if (!reader?.id) {
      setErrorReaders("Không xác định được mã độc giả cần xóa.");
      return;
    }

    const confirmed = window.confirm(`Xóa độc giả "${reader.name}"?`);
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setErrorReaders("");

    try {
      await deleteReader(reader.id);
      if (editingReaderId === reader.id) {
        resetReaderForm();
      }
      if (selectedReader?.id === reader.id) {
        setSelectedReader(null);
        setReaderLoans([]);
      }
      await loadData();
    } catch (err) {
      setErrorReaders(err.message || "Không thể xóa độc giả.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-title row-between">
        <div>
          <h2>Độc giả</h2>
          <p>Quản lý hồ sơ độc giả, thông tin liên hệ và số sách đang mượn.</p>
        </div>

        <button className="primary-button" type="button" onClick={() => onNavigateToCreate?.("readers")}>
          Thêm sách mới
        </button>
      </div>

      {errorReaders && <div className="error-message">{errorReaders}</div>}

      <form className="form-card" onSubmit={handleSaveReader}>
        <h3>{editingReaderId ? "Cập nhật độc giả" : "Thêm độc giả mới"}</h3>
        <div className="form-grid">
          <div className="form-group">
            <label>Họ tên</label>
            <input
              type="text"
              name="name"
              placeholder="Nguyễn Văn A"
              value={readerForm.name}
              onChange={handleReaderChange}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="reader@example.com"
              value={readerForm.email}
              onChange={handleReaderChange}
            />
          </div>

          <div className="form-group">
            <label>Điện thoại</label>
            <input
              type="tel"
              name="phone"
              placeholder="0901000000"
              value={readerForm.phone}
              onChange={handleReaderChange}
            />
          </div>
        </div>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting
              ? "Đang lưu..."
              : editingReaderId
              ? "Cập nhật độc giả"
              : "Lưu độc giả"}
          </button>

          {editingReaderId && (
            <button className="secondary-button" type="button" onClick={resetReaderForm}>
              Hủy chỉnh sửa
            </button>
          )}
        </div>
      </form>

      {loadingReaders ? (
        <div className="empty-state" style={{ marginTop: 24 }}>
          Đang tải danh sách độc giả...
        </div>
      ) : (
        <div className="table-card" style={{ marginTop: 24 }}>
          <div className="table-card-header row-between">
            <h3>Danh sách độc giả</h3>
            <div className="loan-summary">
              <span>Tổng: {readerSummary.total}</span>
              <span>Đang mượn: {readerSummary.active}</span>
              <span>Chưa mượn: {readerSummary.inactive}</span>
            </div>
          </div>

          <div className="filters-row">
            <div className="search-bar">
              <label>Tìm kiếm</label>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Tìm theo mã, họ tên, email hoặc điện thoại"
              />
            </div>

            <div className="filter-group">
              <label>Tình trạng mượn</label>
              <select value={borrowFilter} onChange={(event) => setBorrowFilter(event.target.value)}>
                <option value="">Tất cả</option>
                <option value="active">Đang mượn sách</option>
                <option value="inactive">Chưa mượn sách</option>
              </select>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Điện thoại</th>
                <th>Sách đang mượn</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredReaders.map((reader) => (
                <tr key={reader.id}>
                  <td>#{reader.id}</td>
                  <td>{reader.name}</td>
                  <td>{reader.email}</td>
                  <td>{reader.phone}</td>
                  <td>{reader.booksBorrowed ?? 0}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="small-button"
                        type="button"
                        onClick={() => handleViewHistory(reader)}
                        disabled={submitting || loadingHistory}
                      >
                        Lịch sử
                      </button>
                      <button
                        className="small-button"
                        type="button"
                        onClick={() => handleEditReader(reader)}
                        disabled={submitting}
                      >
                        Sửa
                      </button>
                      <button
                        className="small-button danger-button"
                        type="button"
                        onClick={() => handleDeleteReader(reader)}
                        disabled={submitting}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredReaders.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-table">
                    Không tìm thấy độc giả phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedReader && (
        <div className="table-card" style={{ marginTop: 24 }}>
          <div className="table-card-header row-between">
            <h3>Lịch sử mượn của {selectedReader.name}</h3>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSelectedReader(null);
                setReaderLoans([]);
                setHistoryError("");
              }}
            >
              Đóng
            </button>
          </div>

          {historyError && <div className="error-message">{historyError}</div>}

          {loadingHistory ? (
            <div className="empty-state">Đang tải lịch sử mượn...</div>
          ) : readerLoans.length === 0 ? (
            <div className="empty-state">Độc giả này chưa có phiếu mượn nào.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Sách</th>
                  <th>Ngày mượn</th>
                  <th>Hạn trả</th>
                  <th>Ngày trả</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {readerLoans.map((loan) => (
                  <tr key={loan.id}>
                    <td>#{loan.id}</td>
                    <td>{loan.bookTitle}</td>
                    <td>{loan.borrowedDate}</td>
                    <td>{loan.dueDate}</td>
                    <td>{loan.returnedDate || "-"}</td>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <BookTable
        books={books}
        loading={loadingBooks}
        error={errorBooks}
        onEditBook={onEditBook}
        onDeleteBook={onDeleteBook}
      />
    </div>
  );
}

export default Readers;

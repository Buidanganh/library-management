import { useEffect, useState } from "react";
import { getBooks, getReaders } from "../services/api";
import BookTable from "../components/BookTable";

function Readers({ onNavigateToCreate, onEditBook, onDeleteBook }) {
  const [readers, setReaders] = useState([]);
  const [books, setBooks] = useState([]);
  const [loadingReaders, setLoadingReaders] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [errorReaders, setErrorReaders] = useState("");
  const [errorBooks, setErrorBooks] = useState("");

  useEffect(() => {
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

    loadData();
  }, []);

  return (
    <div>
      <div className="page-title row-between">
        <div>
          <h2>Độc giả</h2>
          <p>Quản lý độc giả và truy cập nhanh danh sách sách để thao tác CRUD.</p>
        </div>

        <button className="primary-button" type="button" onClick={() => onNavigateToCreate?.("readers")}>
          Thêm sách mới
        </button>
      </div>

      {errorReaders && <div className="error-message">{errorReaders}</div>}

      {loadingReaders ? (
        <div className="empty-state">Đang tải danh sách độc giả...</div>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Điện thoại</th>
                <th>Sách đang mượn</th>
              </tr>
            </thead>
            <tbody>
              {readers.map((reader) => (
                <tr key={reader.id}>
                  <td>#{reader.id}</td>
                  <td>{reader.name}</td>
                  <td>{reader.email}</td>
                  <td>{reader.phone}</td>
                  <td>{reader.booksBorrowed ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

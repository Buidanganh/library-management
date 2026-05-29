import { useState } from "react";

function BookCover({ book }) {
  const [failed, setFailed] = useState(false);
  const hasImage = Boolean(book.imageUrl) && !failed;

  if (hasImage) {
    return (
      <img
        className="book-cover"
        src={book.imageUrl}
        alt={`Bìa sách ${book.title}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="book-cover book-cover-placeholder" aria-label={`Chưa có ảnh sách ${book.title}`}>
      {String(book.title || "?").charAt(0).toUpperCase()}
    </div>
  );
}

function BookInfo({ book }) {
  return (
    <div className="book-info">
      <BookCover book={book} />
      <div>
        <strong>{book.title}</strong>
        <span>{book.publisher || "Chưa có NXB"}</span>
      </div>
    </div>
  );
}

function BookTable({ books, onEditBook, onDeleteBook, loading, error }) {
  return (
    <div className="table-card">
      <div className="table-card-header row-between">
        <h3>Danh sách sách</h3>
        {(onEditBook || onDeleteBook) && (
          <div className="table-card-actions">
            <span className="note">Chọn Sửa/Xóa để quản lý sách.</span>
          </div>
        )}
      </div>

      {error ? (
        <div className="error-message">{error}</div>
      ) : loading ? (
        <div className="empty-state">Đang tải danh sách sách...</div>
      ) : books.length === 0 ? (
        <div className="empty-state">Chưa có sách nào trong hệ thống.</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên sách và ảnh</th>
              <th>Tác giả</th>
              <th>Thể loại</th>
              <th>Số lượng</th>
              <th>Còn lại</th>
              {(onEditBook || onDeleteBook) && <th>Hành động</th>}
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book.id}>
                <td>#{book.id}</td>
                <td>
                  <BookInfo book={book} />
                </td>
                <td>{book.author}</td>
                <td>{book.category}</td>
                <td>{book.quantity}</td>
                <td>{book.availableQuantity ?? book.quantity}</td>
                {(onEditBook || onDeleteBook) && (
                  <td>
                    <div className="action-buttons">
                      {onEditBook && (
                        <button
                          className="small-button"
                          type="button"
                          onClick={() => onEditBook(book)}
                        >
                          Sửa
                        </button>
                      )}
                      {onDeleteBook && (
                        <button
                          className="small-button danger-button"
                          type="button"
                          onClick={() => onDeleteBook(book.id)}
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default BookTable;

import { useEffect, useMemo, useState } from "react";
import { getBooks } from "../services/api";

function getAvailableQuantity(book) {
  return Number(book.availableQuantity ?? book.quantity ?? 0);
}

function getBookStatus(book) {
  const availableQuantity = getAvailableQuantity(book);
  if (availableQuantity <= 0) return "out";
  if (availableQuantity <= 2) return "low";
  return "available";
}

function getBookStatusLabel(book) {
  const status = getBookStatus(book);
  if (status === "out") return "Hết sách";
  if (status === "low") return "Sắp hết";
  return "Có thể mượn";
}

function hasBookImage(book) {
  return Boolean(String(book.imageUrl || "").trim());
}

function sortBooks(books, sortMode) {
  const sorted = [...books];

  if (sortMode === "title-desc") {
    return sorted.sort((first, second) => second.title.localeCompare(first.title));
  }

  if (sortMode === "quantity-desc") {
    return sorted.sort((first, second) => Number(second.quantity || 0) - Number(first.quantity || 0));
  }

  if (sortMode === "quantity-asc") {
    return sorted.sort((first, second) => Number(first.quantity || 0) - Number(second.quantity || 0));
  }

  if (sortMode === "available-desc") {
    return sorted.sort((first, second) => getAvailableQuantity(second) - getAvailableQuantity(first));
  }

  if (sortMode === "available-asc") {
    return sorted.sort((first, second) => getAvailableQuantity(first) - getAvailableQuantity(second));
  }

  if (sortMode === "missing-image") {
    return sorted.sort((first, second) => Number(hasBookImage(first)) - Number(hasBookImage(second)));
  }

  return sorted.sort((first, second) => first.title.localeCompare(second.title));
}

function BookCover({ book }) {
  const [failed, setFailed] = useState(false);
  const hasImage = hasBookImage(book) && !failed;

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

function Books({ onSaveBook, onDeleteBook, onNavigateToCreate, canManage = false }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [imageFilter, setImageFilter] = useState("");
  const [sortMode, setSortMode] = useState("title-asc");
  const [showForm, setShowForm] = useState(false);
  const [editingBookId, setEditingBookId] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    imageUrl: "",
    author: "",
    category: "",
    quantity: "",
  });

  const loadBooks = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getBooks();
      setBooks(data);
    } catch (err) {
      setError(err.message || "Không thể tải dữ liệu sách.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBooks();
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(books.map((book) => book.category).filter(Boolean))).sort(),
    [books]
  );

  const bookSummary = useMemo(
    () => ({
      total: books.length,
      available: books.filter((book) => getBookStatus(book) === "available").length,
      low: books.filter((book) => getBookStatus(book) === "low").length,
      out: books.filter((book) => getBookStatus(book) === "out").length,
      withImage: books.filter(hasBookImage).length,
      missingImage: books.filter((book) => !hasBookImage(book)).length,
    }),
    [books]
  );

  const filteredBooks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = books.filter((book) => {
      const matchesQuery =
        !query ||
        [
          book.title,
          book.author,
          book.category,
          book.publisher,
          book.shelfLocation,
          book.description,
        ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesCategory = !categoryFilter || book.category === categoryFilter;
      const matchesStock = !stockFilter || getBookStatus(book) === stockFilter;
      const matchesImage =
        !imageFilter ||
        (imageFilter === "with-image" && hasBookImage(book)) ||
        (imageFilter === "missing-image" && !hasBookImage(book));

      return matchesQuery && matchesCategory && matchesStock && matchesImage;
    });

    return sortBooks(filtered, sortMode);
  }, [books, searchQuery, categoryFilter, stockFilter, imageFilter, sortMode]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const resetForm = () => {
    setFormData({
      title: "",
      imageUrl: "",
      author: "",
      category: "",
      quantity: "",
    });

    setEditingBookId(null);
    setShowForm(false);
  };

  const handleAddClick = () => {
    if (!canManage || !onNavigateToCreate) return;

    resetForm();
    onNavigateToCreate();
  };

  const handleSaveBook = async () => {
    if (!canManage || !onSaveBook) return;

    if (!formData.title || !formData.author || !formData.category || !formData.quantity) {
      alert("Vui lòng nhập đầy đủ thông tin sách.");
      return;
    }

    await onSaveBook({
      id: editingBookId,
      title: formData.title,
      imageUrl: formData.imageUrl,
      author: formData.author,
      category: formData.category,
      quantity: Number(formData.quantity),
    });

    await loadBooks();
    resetForm();
  };

  const handleEditBook = (book) => {
    if (!canManage) return;

    setEditingBookId(book.id);

    setFormData({
      title: book.title || "",
      imageUrl: book.imageUrl || "",
      author: book.author || "",
      category: book.category || "",
      quantity: book.quantity || "",
    });

    setShowForm(true);
  };

  const handleDeleteBook = async (bookId) => {
    if (!canManage || !onDeleteBook) return;

    const confirmDelete = window.confirm("Bạn có chắc muốn xóa sách này không?");

    if (!confirmDelete) {
      return;
    }

    await onDeleteBook(bookId);
    await loadBooks();
  };

  return (
    <div>
      <div className="page-title row-between">
        <div>
          <h2>Quản lý sách</h2>
          <p>Danh sách sách gồm tên sách, ảnh bìa và tình trạng tồn kho hiện tại.</p>
        </div>

        {canManage && (
          <button className="primary-button" onClick={handleAddClick}>
            Thêm sách
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {loading ? (
        <div className="empty-state">Đang tải sách...</div>
      ) : (
        <>
          <div className="table-card" style={{ marginBottom: 24 }}>
            <div className="table-card-header row-between">
              <h3>Tồn kho sách</h3>
              <div className="loan-summary">
                <span>Tổng đầu sách: {bookSummary.total}</span>
                <span>Còn tốt: {bookSummary.available}</span>
                <span>Sắp hết: {bookSummary.low}</span>
                <span>Hết sách: {bookSummary.out}</span>
                <span>Có ảnh: {bookSummary.withImage}</span>
                <span>Thiếu ảnh: {bookSummary.missingImage}</span>
                <span>Đang hiển thị: {filteredBooks.length}</span>
              </div>
            </div>

            <div className="filters-row">
              <div className="search-bar">
                <label>Tìm kiếm</label>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Tìm theo tên sách, tác giả, thể loại, NXB hoặc vị trí"
                />
              </div>

              <div className="filter-group">
                <label>Thể loại</label>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="">Tất cả</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Tình trạng</label>
                <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
                  <option value="">Tất cả</option>
                  <option value="available">Có thể mượn</option>
                  <option value="low">Sắp hết</option>
                  <option value="out">Hết sách</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Ảnh sách</label>
                <select value={imageFilter} onChange={(event) => setImageFilter(event.target.value)}>
                  <option value="">Tất cả</option>
                  <option value="with-image">Có ảnh</option>
                  <option value="missing-image">Thiếu ảnh</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Sắp xếp</label>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                  <option value="title-asc">Tên A-Z</option>
                  <option value="title-desc">Tên Z-A</option>
                  <option value="quantity-desc">Số lượng nhiều nhất</option>
                  <option value="quantity-asc">Số lượng ít nhất</option>
                  <option value="available-desc">Còn lại nhiều nhất</option>
                  <option value="available-asc">Còn lại ít nhất</option>
                  <option value="missing-image">Thiếu ảnh lên đầu</option>
                </select>
              </div>
            </div>
          </div>

          {canManage && showForm && (
            <div className="form-card">
              <h3>{editingBookId ? "Cập nhật sách" : "Thêm sách mới"}</h3>

              <div className="form-grid">
                <div className="form-group">
                  <label>Tên sách</label>
                  <input
                    type="text"
                    name="title"
                    placeholder="Nhập tên sách"
                    value={formData.title}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>Ảnh sách</label>
                  <input
                    type="url"
                    name="imageUrl"
                    placeholder="https://example.com/book-cover.jpg"
                    value={formData.imageUrl}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>Tác giả</label>
                  <input
                    type="text"
                    name="author"
                    placeholder="Nhập tác giả"
                    value={formData.author}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>Thể loại</label>
                  <input
                    type="text"
                    name="category"
                    placeholder="Nhập thể loại"
                    value={formData.category}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>Số lượng</label>
                  <input
                    type="number"
                    name="quantity"
                    placeholder="Nhập số lượng"
                    min="0"
                    value={formData.quantity}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {formData.imageUrl && (
                <div className="book-inline-preview">
                  <BookCover book={formData} />
                  <span>Xem trước ảnh sách</span>
                </div>
              )}

              <div className="form-actions">
                <button className="primary-button" onClick={handleSaveBook}>
                  {editingBookId ? "Cập nhật" : "Lưu sách"}
                </button>

                <button className="secondary-button" onClick={resetForm}>
                  Hủy
                </button>
              </div>
            </div>
          )}

          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Tên sách và ảnh</th>
                  <th>Tác giả</th>
                  <th>Thể loại</th>
                  <th>Số lượng</th>
                  <th>Còn lại</th>
                  <th>Trạng thái</th>
                  {canManage && <th>Hành động</th>}
                </tr>
              </thead>

              <tbody>
                {filteredBooks.map((book) => {
                  const status = getBookStatus(book);

                  return (
                    <tr key={book.id}>
                      <td>#{book.id}</td>
                      <td>
                        <div className="book-info">
                          <BookCover book={book} />
                          <div>
                            <strong>{book.title}</strong>
                            <span>{book.publisher || book.shelfLocation || "Chưa có thông tin thêm"}</span>
                          </div>
                        </div>
                      </td>
                      <td>{book.author}</td>
                      <td>{book.category}</td>
                      <td>{book.quantity}</td>
                      <td>{getAvailableQuantity(book)}</td>
                      <td>
                        <span
                          className={
                            status === "out"
                              ? "badge danger"
                              : status === "low"
                              ? "badge warning"
                              : "badge success"
                          }
                        >
                          {getBookStatusLabel(book)}
                        </span>
                      </td>
                      {canManage && (
                        <td>
                          <div className="action-buttons">
                            <button className="small-button" onClick={() => handleEditBook(book)}>
                              Sửa
                            </button>

                            <button
                              className="small-button danger-button"
                              onClick={() => handleDeleteBook(book.id)}
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {filteredBooks.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} className="empty-table">
                      Không tìm thấy sách phù hợp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default Books;

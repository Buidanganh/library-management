import { useEffect, useMemo, useState } from "react";
import { getBooks } from "../services/api";

function Books({ onSaveBook, onDeleteBook, onNavigateToCreate, canManage = false }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingBookId, setEditingBookId] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
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
    const initialize = async () => {
      await loadBooks();
    };

    initialize();
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(books.map((book) => book.category))).sort(),
    [books]
  );

  const filteredBooks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return books.filter((book) => {
      const matchesQuery =
        !query ||
        [book.title, book.author, book.category].some((value) =>
          value.toLowerCase().includes(query)
        );

      const matchesCategory =
        !categoryFilter || book.category === categoryFilter;

      return matchesQuery && matchesCategory;
    });
  }, [books, searchQuery, categoryFilter]);

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

    if (
      !formData.title ||
      !formData.author ||
      !formData.category ||
      !formData.quantity
    ) {
      alert("Vui lòng nhập đầy đủ thông tin sách.");
      return;
    }

    await onSaveBook({
      id: editingBookId,
      title: formData.title,
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
      title: book.title,
      author: book.author,
      category: book.category,
      quantity: book.quantity,
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
          <p>Danh sách các sách hiện có trong thư viện.</p>
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
          <div className="filters-row">
            <div className="search-bar">
              <label>Tìm kiếm</label>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Tìm theo tên sách, tác giả hoặc thể loại"
              />
            </div>

            <div className="filter-group">
              <label>Lọc theo thể loại</label>
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
                    value={formData.quantity}
                    onChange={handleChange}
                  />
                </div>
              </div>

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
                  <th>Tên sách</th>
                  <th>Tác giả</th>
                  <th>Thể loại</th>
                  <th>Số lượng</th>
                  <th>Còn lại</th>
                  <th>Trạng thái</th>
                  {canManage && <th>Hành động</th>}
                </tr>
              </thead>

              <tbody>
                {filteredBooks.map((book) => (
                  <tr key={book.id}>
                    <td>#{book.id}</td>
                    <td>{book.title}</td>
                    <td>{book.author}</td>
                    <td>{book.category}</td>
                    <td>{book.quantity}</td>
                    <td>{book.availableQuantity ?? book.quantity}</td>
                    <td>
                      {(book.availableQuantity ?? book.quantity) > 0 ? (
                        <span className="badge success">Có thể mượn</span>
                      ) : (
                        <span className="badge danger">Hết sách</span>
                      )}
                    </td>
                    {canManage && (
                      <td>
                        <div className="action-buttons">
                          <button
                            className="small-button"
                            onClick={() => handleEditBook(book)}
                          >
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
                ))}

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

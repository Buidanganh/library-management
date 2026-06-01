import { useEffect, useState } from "react";
import { ArrowLeft, BookPlus, Save, Sparkles } from "lucide-react";
import BookTable from "../components/BookTable";
import { getBooks, getCatalog } from "../services/api";

const emptyForm = {
  title: "",
  imageUrl: "",
  author: "",
  category: "",
  publisher: "",
  year: "",
  quantity: "",
  isbn: "",
  condition: "good",
  shelfLocation: "",
  description: "",
};

function BookCreate({ onSaveBook, onCancel, onDeleteBook, editingBook }) {
  const [formData, setFormData] = useState(emptyForm);
  const [editingBookId, setEditingBookId] = useState(null);
  const [books, setBooks] = useState([]);
  const [catalog, setCatalog] = useState({ categories: [], publishers: [] });
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [booksError, setBooksError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingBookId(null);
  };

  const loadBooks = async () => {
    setLoadingBooks(true);
    setBooksError("");

    try {
      const [data, catalogData] = await Promise.all([getBooks(), getCatalog()]);
      setBooks(data);
      setCatalog(catalogData);
    } catch (err) {
      setBooksError(err.message || "Không thể tải danh sách sách.");
    } finally {
      setLoadingBooks(false);
    }
  };

  useEffect(() => {
    loadBooks();
  }, []);

  useEffect(() => {
    if (editingBook) {
      setEditingBookId(editingBook.id);
      setFormData({
        title: editingBook.title || "",
        imageUrl: editingBook.imageUrl || "",
        author: editingBook.author || "",
        category: editingBook.category || "",
        publisher: editingBook.publisher || "",
        year: editingBook.year || "",
        quantity: editingBook.quantity || "",
        isbn: editingBook.isbn || "",
        condition: editingBook.condition || "good",
        shelfLocation: editingBook.shelfLocation || "",
        description: editingBook.description || "",
      });
    } else {
      resetForm();
    }
  }, [editingBook]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.title || !formData.author || !formData.category || !formData.quantity) {
      alert("Vui lòng điền đầy đủ các trường bắt buộc.");
      return;
    }

    try {
      await onSaveBook({
        id: editingBookId,
        title: formData.title,
        imageUrl: formData.imageUrl,
        author: formData.author,
        category: formData.category,
        publisher: formData.publisher,
        year: formData.year,
        quantity: Number(formData.quantity),
        isbn: formData.isbn,
        condition: formData.condition,
        shelfLocation: formData.shelfLocation,
        description: formData.description,
      });
      resetForm();
      await loadBooks();
      onCancel();
    } catch (err) {
      alert(err.message || "Không thể lưu sách.");
    }
  };

  const handleEditBook = (book) => {
    setEditingBookId(book.id);
    setFormData({
      title: book.title || "",
      imageUrl: book.imageUrl || "",
      author: book.author || "",
      category: book.category || "",
      publisher: book.publisher || "",
      year: book.year || "",
      quantity: book.quantity || "",
      isbn: book.isbn || "",
      condition: book.condition || "good",
      shelfLocation: book.shelfLocation || "",
      description: book.description || "",
    });
  };

  const handleDeleteBook = async (bookId) => {
    if (!onDeleteBook) return;

    await onDeleteBook(bookId);
    await loadBooks();
  };

  return (
    <div className="page-shell book-create-page">
      <div className="page-title row-between page-hero book-create-hero">
        <div>
          <span className="page-eyebrow">
            <Sparkles size={16} />
            Biên mục đầu sách
          </span>
          <h2>{editingBookId ? "Chỉnh sửa sách" : "Thêm sách mới"}</h2>
          <p>Nhập tên sách, ảnh bìa và thông tin chi tiết để quản lý kho sách.</p>
          <div className="page-hero-meta">
            <span>{books.length} sách hiện có</span>
            <span>{catalog.categories.length} thể loại</span>
            <span>{catalog.publishers.length} nhà xuất bản</span>
          </div>
        </div>

        <button className="secondary-button hero-secondary-button" type="button" onClick={onCancel}>
          <ArrowLeft size={17} />
          <span>Quay lại danh sách</span>
        </button>
      </div>

      <form className="form-card book-editor-card" onSubmit={handleSubmit}>
        <div className="book-form-layout">
          <div className="book-cover-preview">
            {formData.imageUrl ? (
              <img src={formData.imageUrl} alt={`Ảnh bìa ${formData.title || "sách"}`} />
            ) : (
              <div className="book-cover-preview-empty">Ảnh sách</div>
            )}
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Tên sách</label>
              <input
                type="text"
                name="title"
                placeholder="Ví dụ: Clean Code"
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
                placeholder="Ví dụ: Robert C. Martin"
                value={formData.author}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Thể loại</label>
              <input
                type="text"
                name="category"
                list="book-category-options"
                placeholder="Ví dụ: Lập trình"
                value={formData.category}
                onChange={handleChange}
              />
              <datalist id="book-category-options">
                {catalog.categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>

            <div className="form-group">
              <label>Nhà xuất bản</label>
              <input
                type="text"
                name="publisher"
                list="book-publisher-options"
                placeholder="Ví dụ: Prentice Hall"
                value={formData.publisher}
                onChange={handleChange}
              />
              <datalist id="book-publisher-options">
                {catalog.publishers.map((publisher) => (
                  <option key={publisher} value={publisher} />
                ))}
              </datalist>
            </div>

            <div className="form-group">
              <label>Năm xuất bản</label>
              <input
                type="number"
                name="year"
                placeholder="2008"
                value={formData.year}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Số lượng</label>
              <input
                type="number"
                name="quantity"
                placeholder="10"
                min="0"
                value={formData.quantity}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>ISBN</label>
              <input
                type="text"
                name="isbn"
                placeholder="Ví dụ: 9780132350884"
                value={formData.isbn}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Tình trạng bản sách</label>
              <select name="condition" value={formData.condition} onChange={handleChange}>
                <option value="good">Tốt</option>
                <option value="damaged">Hỏng nhẹ</option>
                <option value="repair">Đang sửa</option>
                <option value="lost">Mất</option>
              </select>
            </div>

            <div className="form-group">
              <label>Vị trí kệ sách</label>
              <input
                type="text"
                name="shelfLocation"
                placeholder="Ví dụ: Kệ A1"
                value={formData.shelfLocation}
                onChange={handleChange}
              />
            </div>

            <div className="form-group full">
              <label>Mô tả</label>
              <textarea
                rows="4"
                name="description"
                placeholder="Nhập mô tả ngắn về sách"
                value={formData.description}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button className="primary-button" type="submit">
            {editingBookId ? <Save size={18} /> : <BookPlus size={18} />}
            <span>{editingBookId ? "Cập nhật sách" : "Lưu sách"}</span>
          </button>
          <button className="secondary-button" type="button" onClick={editingBookId ? resetForm : onCancel}>
            {editingBookId ? "Hủy chỉnh sửa" : "Hủy"}
          </button>
        </div>
      </form>

      <BookTable
        books={books}
        loading={loadingBooks}
        error={booksError}
        onEditBook={handleEditBook}
        onDeleteBook={handleDeleteBook}
      />
    </div>
  );
}

export default BookCreate;

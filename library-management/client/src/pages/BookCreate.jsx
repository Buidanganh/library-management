import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookPlus, ClipboardCheck, Gauge, Save, Sparkles, Wand2 } from "lucide-react";
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

const bookTemplates = [
 {
 id: "tech",
 label: "Sách công nghệ",
 helper: "Phù hợp sách lập trình, dữ liệu, AI.",
 values: {
 category: "Công nghệ",
 publisher: "NXB Khoa học và Kỹ thuật",
 shelfLocation: "TECH-01",
 quantity: "5",
 description: "Tài liệu chuyên ngành phục vụ học tập, nghiên cứu và thực hành.",
 },
 },
 {
 id: "literature",
 label: "Văn học",
 helper: "Dùng cho tiểu thuyết, truyện ngắn, tác phẩm kinh điển.",
 values: {
 category: "Văn học",
 publisher: "NXB Văn học",
 shelfLocation: "LIT-01",
 quantity: "3",
 description: "Tác phẩm văn học phục vụ đọc mở rộng và sinh hoạt câu lạc bộ sách.",
 },
 },
 {
 id: "reference",
 label: "Sách tham khảo",
 helper: "Dành cho giáo trình, sách tra cứu, luyện thi.",
 values: {
 category: "Tham khảo",
 publisher: "NXB Giáo dục",
 shelfLocation: "REF-01",
 quantity: "8",
 description: "Sách tham khảo hỗ trợ học tập, ôn luyện và tra cứu nhanh tại thư viện.",
 },
 },
];

function BookCreate({ onSaveBook, onCancel, onDeleteBook, editingBook }) {
 const [formData, setFormData] = useState(emptyForm);
 const [editingBookId, setEditingBookId] = useState(null);
 const [coverPreviewFailed, setCoverPreviewFailed] = useState(false);
 const [books, setBooks] = useState([]);
 const [catalog, setCatalog] = useState({ categories: [], publishers: [] });
 const [loadingBooks, setLoadingBooks] = useState(true);
 const [booksError, setBooksError] = useState("");
 const [formError, setFormError] = useState("");

 const handleChange = (event) => {
 const { name, value } = event.target;
 if (name === "imageUrl") {
 setCoverPreviewFailed(false);
 }
 setFormData((prevState) => ({...prevState,
 [name]: value,
 }));
 };

 const applyBookTemplate = (template) => {
 setFormData((current) => ({...current,...Object.fromEntries(
 Object.entries(template.values).map(([key, value]) => [key, current[key] || value])
 ),
 }));
 setCoverPreviewFailed(false);
 };

 const resetForm = () => {
 setFormData(emptyForm);
 setEditingBookId(null);
 setCoverPreviewFailed(false);
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
 setCoverPreviewFailed(false);
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
 setFormError("Vui lòng điền đầy đủ tên sách, tác giả, thể loại và số lượng.");
 return;
 }

 try {
 setFormError("");
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
 setFormError(err.message || "Không thể lưu sách.");
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

 const duplicateBook = useMemo(() => {
 const normalizedIsbn = String(formData.isbn || "").trim().toLowerCase();
 const normalizedTitle = String(formData.title || "").trim().toLowerCase();
 const normalizedAuthor = String(formData.author || "").trim().toLowerCase();

 return books.find((book) => {
 if (editingBookId && book.id === editingBookId) return false;
 const sameIsbn = normalizedIsbn && String(book.isbn || "").trim().toLowerCase() === normalizedIsbn;
 const sameTitleAuthor =
 normalizedTitle &&
 normalizedAuthor &&
 String(book.title || "").trim().toLowerCase() === normalizedTitle &&
 String(book.author || "").trim().toLowerCase() === normalizedAuthor;

 return sameIsbn || sameTitleAuthor;
 });
 }, [books, editingBookId, formData.author, formData.isbn, formData.title]);

 const formQuality = useMemo(() => {
 const checks = [
 { id: "title", label: "Tên sách", done: Boolean(String(formData.title || "").trim()) },
 { id: "author", label: "Tác giả", done: Boolean(String(formData.author || "").trim()) },
 { id: "category", label: "Thể loại", done: Boolean(String(formData.category || "").trim()) },
 { id: "quantity", label: "Số lượng", done: formData.quantity !== "" && Number(formData.quantity) >= 0 },
 { id: "isbn", label: "ISBN", done: Boolean(String(formData.isbn || "").trim()) },
 { id: "publisher", label: "Nhà xuất bản", done: Boolean(String(formData.publisher || "").trim()) },
 { id: "shelf", label: "Vị trí kệ", done: Boolean(String(formData.shelfLocation || "").trim()) },
 { id: "description", label: "Mô tả", done: String(formData.description || "").trim().length >= 20 },
 { id: "image", label: "Ảnh bìa", done: Boolean(String(formData.imageUrl || "").trim()) && !coverPreviewFailed },
 ];
 const doneCount = checks.filter((check) => check.done).length;
 const score = Math.round((doneCount / checks.length) * 100);

 return {
 checks,
 doneCount,
 missing: checks.filter((check) => !check.done),
 score,
 tone: score >= 80 ? "success" : score >= 55 ? "warning" : "danger",
 };
 }, [coverPreviewFailed, formData]);

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

 <div className="book-create-command-panel table-card">
 <div className="table-card-header row-between">
 <div>
 <span className="page-eyebrow">
 <Wand2 size={15} />
 Smart Intake
 </span>
 <h3>Trợ lý nhập sách nhanh</h3>
 <p>Chọn mẫu để điền các trường kho thường dùng, rồi kiểm tra điểm chất lượng trước khi lưu.</p>
 </div>
 <div className={`book-quality-score ${formQuality.tone}`}>
 <Gauge size={18} />
 <strong>{formQuality.score}/100</strong>
 <span>độ đầy đủ</span>
 </div>
 </div>

 <div className="book-create-command-grid">
 <section className="book-template-grid">
 {bookTemplates.map((template) => (
 <button type="button" key={template.id} onClick={() => applyBookTemplate(template)}>
 <Sparkles size={16} />
 <span>
 <strong>{template.label}</strong>
 <small>{template.helper}</small>
 </span>
 </button>
 ))}
 </section>

 <section className="book-quality-checklist">
 <div className="book-quality-title">
 <ClipboardCheck size={18} />
 <strong>{formQuality.doneCount}/{formQuality.checks.length} mục đã đủ</strong>
 </div>
 <div className="book-quality-chips">
 {formQuality.checks.map((check) => (
 <span className={check.done ? "done" : ""} key={check.id}>
 {check.label}
 </span>
 ))}
 </div>
 {duplicateBook && (
 <div className="form-error-banner compact">
 Có thể trùng với sách "#{duplicateBook.id}" - {duplicateBook.title}.
 </div>
 )}
 </section>
 </div>
 </div>

 <form className="form-card book-editor-card" onSubmit={handleSubmit}>
 {formError && <div className="form-error-banner">{formError}</div>}
 <div className="book-form-layout">
 <div className="book-cover-preview">
 {formData.imageUrl && !coverPreviewFailed ? (
 <img
 src={formData.imageUrl}
 alt={`Ảnh bìa ${formData.title || "sách"}`}
 onError={() => setCoverPreviewFailed(true)}
 />
 ) : (
 <div className="book-cover-preview-empty">
 {formData.imageUrl ? "URL ảnh không hợp lệ" : "Ảnh sách"}
 </div>
 )}
 {coverPreviewFailed && (
 <small className="image-preview-error">Kiểm tra lại đường dẫn ảnh trước khi lưu.</small>
 )}
 </div>

 <div className="form-grid book-form-sectioned">
 <div className="form-section-title full">
 <strong>Thông tin chính</strong>
 <span>Tên sách, ảnh bìa, tác giả và phân loại cơ bản.</span>
 </div>
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

 <div className="form-section-title full">
 <strong>Kho và xuất bản</strong>
 <span>Số lượng, ISBN, vị trí kệ và thông tin nhà xuất bản.</span>
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
 <div className="form-section-title inline">
 <strong>Mô tả</strong>
 <span>Ghi chú ngắn để hỗ trợ tra cứu và quản lý.</span>
 </div>
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

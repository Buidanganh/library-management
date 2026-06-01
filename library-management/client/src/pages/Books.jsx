import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  FileJson,
  FileSpreadsheet,
  ImageOff,
  PackageCheck,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { createReservation, getBooks, getLoans } from "../services/api";

function getAvailableQuantity(book) {
  return Number(book.availableQuantity ?? book.quantity ?? 0);
}

function getBookStatus(book) {
  if (["lost", "repair"].includes(book.condition || "good")) return "blocked";
  const availableQuantity = getAvailableQuantity(book);
  if (availableQuantity <= 0) return "out";
  if (availableQuantity <= 2) return "low";
  return "available";
}

function getBookStatusLabel(book) {
  const status = getBookStatus(book);
  if (status === "blocked") return book.condition === "lost" ? "Mất sách" : "Đang sửa";
  if (status === "out") return "Hết sách";
  if (status === "low") return "Sắp hết";
  return "Có thể mượn";
}

function getConditionLabel(condition) {
  const labels = {
    good: "Tốt",
    damaged: "Hư hỏng nhẹ",
    repair: "Đang sửa",
    lost: "Mất sách",
  };
  return labels[condition || "good"] || labels.good;
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

function quoteCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function createBooksCsv(books) {
  const headers = [
    "title",
    "author",
    "category",
    "isbn",
    "condition",
    "publisher",
    "year",
    "quantity",
    "shelfLocation",
    "description",
    "imageUrl",
  ];
  const rows = books.map((book) =>
    headers.map((key) => quoteCsvValue(book[key])).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
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

function BookCover({ book }) {
  const [imageSrc, setImageSrc] = useState(book.imageUrl || book.fallbackImageUrl || "");
  const hasImage = Boolean(imageSrc);

  useEffect(() => {
    setImageSrc(book.imageUrl || book.fallbackImageUrl || "");
  }, [book.imageUrl, book.fallbackImageUrl]);

  if (hasImage) {
    return (
      <img
        className="book-cover"
        src={imageSrc}
        alt={`Bìa sách ${book.title}`}
        onError={() => {
          if (imageSrc !== book.fallbackImageUrl && book.fallbackImageUrl) {
            setImageSrc(book.fallbackImageUrl);
            return;
          }

          setImageSrc("");
        }}
      />
    );
  }

  return (
    <div className="book-cover book-cover-placeholder" aria-label={`Chưa có ảnh sách ${book.title}`}>
      {String(book.title || "?").charAt(0).toUpperCase()}
    </div>
  );
}

function BookDetailPanel({ book, loans, onClose, onEditBook, onBorrowBook, onReserveBook, canManage, canBorrow, borrowing }) {
  const availableQuantity = getAvailableQuantity(book);
  const borrowedQuantity = Math.max(0, Number(book.quantity || 0) - availableQuantity);
  const status = getBookStatus(book);
  const bookLoans = loans
    .filter((loan) => loan.bookId === book.id)
    .sort((first, second) => second.id - first.id);
  const activeLoans = bookLoans.filter((loan) => loan.status !== "returned");

  return (
    <div className="book-detail-panel">
      <div className="book-detail-cover">
        <BookCover book={book} />
      </div>

      <div className="book-detail-content">
        <div className="row-between">
          <div>
            <h3>{book.title}</h3>
            <p>{book.author || "Chưa có tác giả"}</p>
          </div>
          <span
            className={
              status === "out"
                ? "badge danger"
                : status === "blocked"
                ? "badge danger"
                : status === "low"
                ? "badge warning"
                : "badge success"
            }
          >
            {getBookStatusLabel(book)}
          </span>
        </div>

        <div className="book-detail-grid">
          <span>Thể loại: <strong>{book.category || "-"}</strong></span>
          <span>ISBN: <strong>{book.isbn || "-"}</strong></span>
          <span>Tình trạng bản sách: <strong>{getConditionLabel(book.condition)}</strong></span>
          <span>Nhà xuất bản: <strong>{book.publisher || "-"}</strong></span>
          <span>Năm xuất bản: <strong>{book.year || "-"}</strong></span>
          <span>Vị trí kệ: <strong>{book.shelfLocation || "-"}</strong></span>
          <span>Tổng số lượng: <strong>{book.quantity ?? 0}</strong></span>
          <span>Đang mượn: <strong>{borrowedQuantity}</strong></span>
          <span>Còn lại: <strong>{availableQuantity}</strong></span>
          <span>Lượt mượn: <strong>{bookLoans.length}</strong></span>
          <span>Phiếu chưa trả: <strong>{activeLoans.length}</strong></span>
          <span>Đánh giá: <strong>{book.reviewCount ? `${book.averageRating}/5 (${book.reviewCount})` : "Chưa có"}</strong></span>
          <span>Ảnh bìa: <strong>{hasBookImage(book) ? "Có" : "Thiếu"}</strong></span>
        </div>

        <p className="book-detail-description">
          {book.description || "Chưa có mô tả cho sách này."}
        </p>

        <div className="form-actions">
          {canBorrow && (
            <>
              <button
                className="primary-button"
                type="button"
                onClick={() => onBorrowBook(book)}
                disabled={borrowing || availableQuantity <= 0 || status === "blocked"}
              >
                {borrowing ? "Đang mượn..." : "Mượn sách"}
              </button>
              {(availableQuantity <= 0 || status === "blocked") && (
                <button className="secondary-button" type="button" onClick={() => onReserveBook(book)} disabled={borrowing}>
                  Đặt trước
                </button>
              )}
            </>
          )}
          {canManage && (
            <button className="primary-button" type="button" onClick={() => onEditBook(book)}>
              Sửa sách
            </button>
          )}
          <button className="secondary-button" type="button" onClick={onClose}>
            Đóng chi tiết
          </button>
        </div>

        <div className="book-loan-history">
          <h4>Lịch sử mượn sách</h4>
          {bookLoans.length === 0 ? (
            <div className="empty-state compact">Chưa có lịch sử mượn cho sách này.</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Độc giả</th>
                    <th>Ngày mượn</th>
                    <th>Hạn trả</th>
                    <th>Trạng thái</th>
                    <th>Phạt</th>
                  </tr>
                </thead>
                <tbody>
                  {bookLoans.slice(0, 8).map((loan) => (
                    <tr key={loan.id}>
                      <td>#{loan.id}</td>
                      <td>{loan.readerName}</td>
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
                      <td>{loan.fineAmount ? `${Number(loan.fineAmount).toLocaleString("vi-VN")}đ` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Books({
  onSaveBook,
  onDeleteBook,
  onEditBook,
  onNavigateToCreate,
  onBorrowBook,
  canManage = false,
  canBorrow = false,
}) {
  const [books, setBooks] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [publisherFilter, setPublisherFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [imageFilter, setImageFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [sortMode, setSortMode] = useState("title-asc");
  const [bulkUpdate, setBulkUpdate] = useState({
    category: "",
    publisher: "",
    shelfLocation: "",
  });
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBookId, setEditingBookId] = useState(null);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [borrowingBookId, setBorrowingBookId] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    imageUrl: "",
    author: "",
    category: "",
    isbn: "",
    condition: "good",
    quantity: "",
  });

  const loadBooks = async () => {
    setLoading(true);
    setError("");

    try {
      const [bookData, loanData] = await Promise.all([getBooks(), getLoans()]);
      setBooks(bookData);
      setLoans(loanData);
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

  const publishers = useMemo(
    () => Array.from(new Set(books.map((book) => book.publisher).filter(Boolean))).sort(),
    [books]
  );

  const bookSummary = useMemo(
    () => ({
      total: books.length,
      available: books.filter((book) => getBookStatus(book) === "available").length,
      low: books.filter((book) => getBookStatus(book) === "low").length,
      out: books.filter((book) => getBookStatus(book) === "out").length,
      blocked: books.filter((book) => getBookStatus(book) === "blocked").length,
      withImage: books.filter(hasBookImage).length,
      missingImage: books.filter((book) => !hasBookImage(book)).length,
    }),
    [books]
  );

  const borrowCountByBookId = useMemo(
    () =>
      loans.reduce((result, loan) => {
        result[loan.bookId] = (result[loan.bookId] || 0) + 1;
        return result;
      }, {}),
    [loans]
  );

  const activeLoanCountByBookId = useMemo(
    () =>
      loans.reduce((result, loan) => {
        if (loan.status !== "returned") {
          result[loan.bookId] = (result[loan.bookId] || 0) + 1;
        }
        return result;
      }, {}),
    [loans]
  );

  const popularBookSpotlight = useMemo(
    () =>
      books
        .map((book) => ({
          ...book,
          borrowedCount: borrowCountByBookId[book.id] || 0,
        }))
        .filter((book) => book.borrowedCount > 0)
        .sort((first, second) => second.borrowedCount - first.borrowedCount)
        .slice(0, 3),
    [books, borrowCountByBookId]
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
          book.isbn,
          book.condition,
          book.publisher,
          book.shelfLocation,
          book.description,
        ].some((value) => String(value || "").toLowerCase().includes(query));

      const matchesCategory = !categoryFilter || book.category === categoryFilter;
      const matchesPublisher = !publisherFilter || book.publisher === publisherFilter;
      const matchesStock = !stockFilter || getBookStatus(book) === stockFilter;
      const matchesCondition = !conditionFilter || (book.condition || "good") === conditionFilter;
      const matchesImage =
        !imageFilter ||
        (imageFilter === "with-image" && hasBookImage(book)) ||
        (imageFilter === "missing-image" && !hasBookImage(book));

      return matchesQuery && matchesCategory && matchesPublisher && matchesStock && matchesCondition && matchesImage;
    });

    return sortBooks(filtered, sortMode);
  }, [books, searchQuery, categoryFilter, publisherFilter, stockFilter, conditionFilter, imageFilter, sortMode]);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) || null,
    [books, selectedBookId]
  );

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    Boolean(categoryFilter) ||
    Boolean(publisherFilter) ||
    Boolean(stockFilter) ||
    Boolean(conditionFilter) ||
    Boolean(imageFilter) ||
    sortMode !== "title-asc";

  const bookKpis = [
    {
      label: "Tổng đầu sách",
      value: bookSummary.total,
      helper: "Danh mục đang quản lý",
      tone: "primary",
      icon: BookOpen,
    },
    {
      label: "Có thể mượn",
      value: bookSummary.available,
      helper: "Còn hàng và sẵn sàng",
      tone: "success",
      icon: PackageCheck,
    },
    {
      label: "Sắp hết / hết",
      value: bookSummary.low + bookSummary.out,
      helper: `${bookSummary.low} sắp hết, ${bookSummary.out} hết`,
      tone: bookSummary.low + bookSummary.out > 0 ? "warning" : "success",
      icon: AlertTriangle,
    },
    {
      label: "Thiếu ảnh bìa",
      value: bookSummary.missingImage,
      helper: `${bookSummary.withImage} sách đã có ảnh`,
      tone: bookSummary.missingImage > 0 ? "danger" : "success",
      icon: ImageOff,
    },
  ];

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
      isbn: "",
      condition: "good",
      quantity: "",
    });

    setEditingBookId(null);
    setShowForm(false);
  };

  const resetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("");
    setPublisherFilter("");
    setStockFilter("");
    setConditionFilter("");
    setImageFilter("");
    setSortMode("title-asc");
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
      isbn: formData.isbn,
      condition: formData.condition,
      quantity: Number(formData.quantity),
    });

    await loadBooks();
    resetForm();
  };

  const handleEditBook = (book) => {
    if (!canManage) return;

    if (onEditBook) {
      onEditBook(book);
      return;
    }

    setEditingBookId(book.id);

    setFormData({
      title: book.title || "",
      imageUrl: book.imageUrl || "",
      author: book.author || "",
      category: book.category || "",
      isbn: book.isbn || "",
      condition: book.condition || "good",
      quantity: book.quantity || "",
    });

    setShowForm(true);
  };

  const handleDeleteBook = async (bookId) => {
    if (!canManage || !onDeleteBook) return;

    if (activeLoanCountByBookId[bookId] > 0) {
      alert("Không thể xóa sách đang được mượn. Hãy xử lý phiếu mượn trước.");
      return;
    }

    setDeleteTarget(books.find((book) => book.id === bookId) || { id: bookId });
  };

  const confirmDeleteBook = async () => {
    if (!deleteTarget) return;

    await onDeleteBook(deleteTarget.id);
    if (selectedBookId === deleteTarget.id) {
      setSelectedBookId(null);
    }
    setDeleteTarget(null);
    await loadBooks();
  };

  const handleBorrowBook = async (book) => {
    if (!canBorrow || !onBorrowBook) return;

    setBorrowingBookId(book.id);
    try {
      await onBorrowBook(book);
      await loadBooks();
    } catch (err) {
      alert(err.message || "Không thể mượn sách.");
    } finally {
      setBorrowingBookId(null);
    }
  };

  const handleReserveBook = async (book) => {
    if (!canBorrow) return;

    setBorrowingBookId(book.id);
    try {
      await createReservation({ bookId: book.id });
      alert("Đã ghi nhận đặt trước sách. Thư viện sẽ xử lý khi sách sẵn sàng.");
      await loadBooks();
    } catch (err) {
      alert(err.message || "Không thể đặt trước sách.");
    } finally {
      setBorrowingBookId(null);
    }
  };

  const downloadFilteredBooksJson = () => {
    downloadFile(JSON.stringify(filteredBooks, null, 2), "books-export.json", "application/json");
  };

  const downloadFilteredBooksCsv = () => {
    const csv = createBooksCsv(filteredBooks);
    downloadFile(csv, "books-export.csv", "text/csv;charset=utf-8;");
  };

  const handleBulkUpdate = async () => {
    if (!canManage || !onSaveBook) return;

    const updates = Object.fromEntries(
      Object.entries(bulkUpdate).filter(([, value]) => String(value || "").trim())
    );

    if (Object.keys(updates).length === 0) {
      alert("Vui lòng nhập ít nhất một thông tin cần cập nhật.");
      return;
    }

    setBulkConfirmOpen(true);
  };

  const confirmBulkUpdate = async () => {
    const updates = Object.fromEntries(
      Object.entries(bulkUpdate).filter(([, value]) => String(value || "").trim())
    );

    setBulkUpdating(true);
    try {
      for (const book of filteredBooks) {
        await onSaveBook({
          ...book,
          ...updates,
        });
      }
      setBulkUpdate({ category: "", publisher: "", shelfLocation: "" });
      setBulkConfirmOpen(false);
      await loadBooks();
    } catch (err) {
      alert(err.message || "Không thể cập nhật hàng loạt.");
    } finally {
      setBulkUpdating(false);
    }
  };

  return (
    <div className="page-shell books-page">
      <div className="page-title row-between books-hero">
        <div>
          <span className="page-eyebrow">
            <Sparkles size={16} />
            Kho sách thư viện
          </span>
          <h2>Quản lý sách</h2>
          <p>Danh sách sách gồm tên sách, ảnh bìa và tình trạng tồn kho hiện tại.</p>
          <div className="page-hero-meta">
            <span>{filteredBooks.length} sách đang hiển thị</span>
            <span>{categories.length} thể loại</span>
            <span>{publishers.length} nhà xuất bản</span>
          </div>
        </div>

        {canManage && (
          <button className="primary-button hero-action-button" onClick={handleAddClick}>
            <Plus size={18} />
            <span>Thêm sách</span>
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {loading ? (
        <div className="skeleton-panel">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <div className="inventory-metric-grid">
            {bookKpis.map((item) => {
              const Icon = item.icon;

              return (
                <div className={`inventory-metric-card ${item.tone}`} key={item.label}>
                  <span className="inventory-metric-icon">
                    <Icon size={20} />
                  </span>
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.helper}</small>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="table-card inventory-filter-card" style={{ marginBottom: 24 }}>
            <div className="table-card-header row-between">
              <div>
                <h3>Tồn kho sách</h3>
              </div>
              <div className="loan-summary inventory-export-actions">
                <button className="secondary-button" type="button" onClick={downloadFilteredBooksJson}>
                  <FileJson size={16} />
                  <span>Xuất JSON</span>
                </button>
                <button className="secondary-button" type="button" onClick={downloadFilteredBooksCsv} style={{ marginLeft: 8 }}>
                  <FileSpreadsheet size={16} />
                  <span>Xuất CSV</span>
                </button>
                <div className="summary-values">
                  <span>Tổng đầu sách: {bookSummary.total}</span>
                  <span>Còn tốt: {bookSummary.available}</span>
                  <span>Sắp hết: {bookSummary.low}</span>
                  <span>Hết sách: {bookSummary.out}</span>
                  <span>Không cho mượn: {bookSummary.blocked}</span>
                  <span>Có ảnh: {bookSummary.withImage}</span>
                  <span>Thiếu ảnh: {bookSummary.missingImage}</span>
                  <span>Đang hiển thị: {filteredBooks.length}</span>
                </div>
              </div>
            </div>

            <div className="quick-filter-strip">
              <button
                className={`quick-filter-chip ${!hasActiveFilters ? "active" : ""}`}
                type="button"
                onClick={resetFilters}
              >
                Tất cả
              </button>
              <button
                className={`quick-filter-chip ${stockFilter === "available" ? "active" : ""}`}
                type="button"
                onClick={() => setStockFilter("available")}
              >
                Còn sách
              </button>
              <button
                className={`quick-filter-chip ${stockFilter === "low" ? "active" : ""}`}
                type="button"
                onClick={() => setStockFilter("low")}
              >
                Sắp hết
              </button>
              <button
                className={`quick-filter-chip ${stockFilter === "out" ? "active" : ""}`}
                type="button"
                onClick={() => setStockFilter("out")}
              >
                Hết sách
              </button>
              <button
                className={`quick-filter-chip ${stockFilter === "blocked" ? "active" : ""}`}
                type="button"
                onClick={() => setStockFilter("blocked")}
              >
                Đang sửa / mất
              </button>
              <button
                className={`quick-filter-chip ${imageFilter === "missing-image" ? "active" : ""}`}
                type="button"
                onClick={() => setImageFilter("missing-image")}
              >
                Thiếu ảnh bìa
              </button>
            </div>

            <div className="filters-row">
              <div className="search-bar">
                <label>Tìm kiếm</label>
                <span className="search-field-icon">
                  <Search size={17} />
                </span>
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
                <label>Nhà xuất bản</label>
                <select
                  value={publisherFilter}
                  onChange={(event) => setPublisherFilter(event.target.value)}
                >
                  <option value="">Tất cả</option>
                  {publishers.map((publisher) => (
                    <option key={publisher} value={publisher}>
                      {publisher}
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
                  <option value="blocked">Đang sửa / mất</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Tình trạng bản sách</label>
                <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)}>
                  <option value="">Tất cả</option>
                  <option value="good">Tốt</option>
                  <option value="damaged">Hư hỏng nhẹ</option>
                  <option value="repair">Đang sửa</option>
                  <option value="lost">Mất sách</option>
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

              <div className="filter-group">
                <label>Bộ lọc</label>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                >
                  Xóa bộ lọc
                </button>
              </div>
            </div>
          </div>

          {popularBookSpotlight.length > 0 && (
            <div className="table-card spotlight-card" style={{ marginBottom: 24 }}>
              <div className="table-card-header row-between">
                <div>
                  <h3>Sách được mượn nhiều</h3>
                  <p>Top sách có lịch sử mượn cao nhất trong hệ thống.</p>
                </div>
              </div>
              <div className="spotlight-grid">
                {popularBookSpotlight.map((book) => (
                  <button
                    className="spotlight-item"
                    type="button"
                    key={book.id}
                    onClick={() => setSelectedBookId(book.id)}
                  >
                    <BookCover book={book} />
                    <span>
                      <strong>{book.title}</strong>
                      <small>{book.borrowedCount} lượt mượn</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {canManage && (
            <div className="table-card bulk-update-card" style={{ marginBottom: 24 }}>
              <div className="table-card-header row-between">
                <div>
                  <h3>Cập nhật hàng loạt</h3>
                  <p>Áp dụng thể loại, nhà xuất bản hoặc vị trí kệ cho các sách đang hiển thị.</p>
                </div>
                <span className="badge">{filteredBooks.length} sách</span>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Thể loại mới</label>
                  <input
                    type="text"
                    value={bulkUpdate.category}
                    onChange={(event) => setBulkUpdate((state) => ({ ...state, category: event.target.value }))}
                    placeholder="Để trống nếu không đổi"
                  />
                </div>
                <div className="form-group">
                  <label>Nhà xuất bản mới</label>
                  <input
                    type="text"
                    value={bulkUpdate.publisher}
                    onChange={(event) => setBulkUpdate((state) => ({ ...state, publisher: event.target.value }))}
                    placeholder="Để trống nếu không đổi"
                  />
                </div>
                <div className="form-group">
                  <label>Vị trí kệ mới</label>
                  <input
                    type="text"
                    value={bulkUpdate.shelfLocation}
                    onChange={(event) => setBulkUpdate((state) => ({ ...state, shelfLocation: event.target.value }))}
                    placeholder="Để trống nếu không đổi"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleBulkUpdate}
                  disabled={bulkUpdating || filteredBooks.length === 0}
                >
                  {bulkUpdating ? "Đang cập nhật..." : "Cập nhật sách đang lọc"}
                </button>
              </div>
            </div>
          )}

          {selectedBook && (
            <BookDetailPanel
              book={selectedBook}
              loans={loans}
              onClose={() => setSelectedBookId(null)}
              onEditBook={handleEditBook}
              onBorrowBook={handleBorrowBook}
              onReserveBook={handleReserveBook}
              canManage={canManage}
              canBorrow={canBorrow}
              borrowing={borrowingBookId === selectedBook.id}
            />
          )}

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
                  <label>ISBN</label>
                  <input
                    type="text"
                    name="isbn"
                    placeholder="Nhập ISBN"
                    value={formData.isbn}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>Tình trạng bản sách</label>
                  <select name="condition" value={formData.condition} onChange={handleChange}>
                    <option value="good">Tốt</option>
                    <option value="damaged">Hư hỏng nhẹ</option>
                    <option value="repair">Đang sửa</option>
                    <option value="lost">Mất sách</option>
                  </select>
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

          <div className="table-card books-table-card">
            <div className="table-responsive">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Tên sách và ảnh</th>
                    <th>Tác giả</th>
                    <th>Thể loại</th>
                    <th>Tình trạng</th>
                    <th>Số lượng</th>
                    <th>Còn lại</th>
                    <th>Trạng thái</th>
                    {(canManage || canBorrow) && <th>Hành động</th>}
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
                              <span>{book.isbn ? `ISBN ${book.isbn}` : book.publisher || book.shelfLocation || "Chưa có thông tin thêm"}</span>
                              {book.reviewCount > 0 && <span>★ {book.averageRating}/5 từ {book.reviewCount} đánh giá</span>}
                            </div>
                          </div>
                        </td>
                        <td>{book.author}</td>
                        <td>{book.category}</td>
                        <td>{getConditionLabel(book.condition)}</td>
                        <td>{book.quantity}</td>
                        <td>{getAvailableQuantity(book)}</td>
                        <td>
                          <span
                            className={
                              status === "out"
                                ? "badge danger"
                                : status === "blocked"
                                ? "badge danger"
                                : status === "low"
                                ? "badge warning"
                                : "badge success"
                            }
                          >
                            {getBookStatusLabel(book)}
                          </span>
                        </td>
                        {(canManage || canBorrow) && (
                          <td>
                            <div className="action-buttons">
                              {canBorrow && (
                                <>
                                  <button
                                    className="small-button"
                                    type="button"
                                    onClick={() => handleBorrowBook(book)}
                                    disabled={
                                      borrowingBookId === book.id ||
                                      getAvailableQuantity(book) <= 0 ||
                                      status === "blocked"
                                    }
                                  >
                                    {borrowingBookId === book.id ? "Đang mượn..." : "Mượn sách"}
                                  </button>
                                  {(getAvailableQuantity(book) <= 0 || status === "blocked") && (
                                    <button
                                      className="small-button"
                                      type="button"
                                      onClick={() => handleReserveBook(book)}
                                      disabled={borrowingBookId === book.id}
                                    >
                                      Đặt trước
                                    </button>
                                  )}
                                </>
                              )}

                              <button
                                className="small-button"
                                type="button"
                                onClick={() => setSelectedBookId(book.id)}
                              >
                                Chi tiết
                              </button>

                              {canManage && (
                                <>
                                  <button className="small-button" onClick={() => handleEditBook(book)}>
                                    Sửa
                                  </button>

                                  <button
                                    className="small-button danger-button"
                                    onClick={() => handleDeleteBook(book.id)}
                                  >
                                    Xóa
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {filteredBooks.length === 0 && (
                    <tr>
                      <td colSpan={canManage || canBorrow ? 8 : 7} className="empty-table">
                        Không tìm thấy sách phù hợp.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {deleteTarget && (
            <div className="app-modal-backdrop" role="dialog" aria-modal="true">
              <div className="app-modal">
                <h3>Xóa sách</h3>
                <p>Bạn có chắc muốn xóa sách "{deleteTarget.title || `#${deleteTarget.id}`}"?</p>
                <div className="form-actions">
                  <button className="primary-button" type="button" onClick={confirmDeleteBook}>
                    Xác nhận xóa
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setDeleteTarget(null)}>
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          )}

          {bulkConfirmOpen && (
            <div className="app-modal-backdrop" role="dialog" aria-modal="true">
              <div className="app-modal">
                <h3>Cập nhật hàng loạt</h3>
                <p>Cập nhật {filteredBooks.length} sách đang hiển thị theo bộ lọc hiện tại?</p>
                <div className="modal-summary">
                  {bulkUpdate.category && <span>Thể loại: <strong>{bulkUpdate.category}</strong></span>}
                  {bulkUpdate.publisher && <span>Nhà xuất bản: <strong>{bulkUpdate.publisher}</strong></span>}
                  {bulkUpdate.shelfLocation && <span>Vị trí kệ: <strong>{bulkUpdate.shelfLocation}</strong></span>}
                </div>
                <div className="form-actions">
                  <button className="primary-button" type="button" onClick={confirmBulkUpdate} disabled={bulkUpdating}>
                    {bulkUpdating ? "Đang cập nhật..." : "Xác nhận cập nhật"}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setBulkConfirmOpen(false)} disabled={bulkUpdating}>
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Books;

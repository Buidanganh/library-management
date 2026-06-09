import { useEffect, useMemo, useState } from "react";
import {
 AlertTriangle,
 BookOpen,
 Brain,
 CheckSquare,
 ClipboardList,
 FileJson,
 FileSpreadsheet,
 Gauge,
 Heart,
 LayoutGrid,
 ImageOff,
 List,
 PackageCheck,
 Plus,
 Rows3,
 Search,
 SlidersHorizontal,
 Sparkles,
 Wand2,
 UserRound,
 Upload,
} from "lucide-react";
import { createReservation, getBooks, getLoans, getReservations, getReviews } from "../services/api";
import { EmptyState, LoadingState } from "../components/ui";

const WISHLIST_KEY = "libraryWishlistBookIds";
const BOOK_SAVED_VIEWS_KEY = "libraryBookSavedViews";
const QUALITY_FIELD_LABELS = {
 category: "Thể loại",
 description: "Mô tả",
 duplicate: "Trùng sách",
 image: "Ảnh bìa",
 isbn: "ISBN",
 publisher: "NXB",
 quantity: "Số lượng",
 shelf: "Vị trí kệ",
 year: "Năm XB",
};

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

function getStatusBadgeClass(status) {
 if (status === "available") return "badge success";
 if (status === "low") return "badge warning";
 return "badge danger";
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

function normalizeBookQualityText(value) {
 return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ");
}

function getBookQualityIssues(book, duplicateCount = 1, activeLoanCount = 0) {
 const issues = [];

 if (!String(book.isbn || "").trim()) issues.push({ label: "Thiếu ISBN", weight: 14, field: "isbn" });
 if (!hasBookImage(book)) issues.push({ label: "Thiếu ảnh bìa", weight: 14, field: "image" });
 if (!String(book.description || "").trim()) issues.push({ label: "Thiếu mô tả", weight: 12, field: "description" });
 if (!String(book.shelfLocation || "").trim()) issues.push({ label: "Thiếu vị trí kệ", weight: 10, field: "shelf" });
 if (!String(book.publisher || "").trim()) issues.push({ label: "Thiếu NXB", weight: 8, field: "publisher" });
 if (!String(book.year || "").trim()) issues.push({ label: "Thiếu năm XB", weight: 7, field: "year" });
 if (!String(book.category || "").trim()) issues.push({ label: "Thiếu thể loại", weight: 12, field: "category" });
 if (duplicateCount > 1) issues.push({ label: "Có khả năng trùng sách", weight: 18, field: "duplicate" });
 if (Number(book.quantity || 0) < Number(activeLoanCount || 0)) {
 issues.push({ label: "Số lượng thấp hơn phiếu đang mượn", weight: 18, field: "quantity" });
 }

 return issues;
}

function isLoanOverdue(loan) {
 if (loan.status === "overdue") return true;
 if (loan.status !== "borrowed" || !loan.dueDate) return false;

 const dueDate = new Date(loan.dueDate);
 const today = new Date();
 today.setHours(0, 0, 0, 0);
 dueDate.setHours(0, 0, 0, 0);

 return dueDate < today;
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
 return [headers.join(","),...rows].join("\n");
}

function getImportKey(book) {
 const isbn = String(book.isbn || "").trim().toLowerCase();
 if (isbn) return `isbn:${isbn}`;
 return `book:${String(book.title || "").trim().toLowerCase()}::${String(book.author || "").trim().toLowerCase()}`;
}

function normalizeImportBook(book) {
 return {
 title: String(book.title || book.name || "").trim(),
 imageUrl: String(book.imageUrl || book.imageurl || book.coverImage || "").trim(),
 author: String(book.author || "").trim(),
 category: String(book.category || "").trim(),
 isbn: String(book.isbn || "").trim(),
 condition: ["good", "damaged", "repair", "lost"].includes(String(book.condition || "good")) ? String(book.condition || "good") : "good",
 publisher: String(book.publisher || "").trim(),
 year: book.year === undefined || book.year === null ? "" : String(book.year).trim(),
 quantity: Number(book.quantity || 0),
 shelfLocation: String(book.shelfLocation || book.shelflocation || "").trim(),
 description: String(book.description || "").trim(),
 };
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

function BookImagePreview({ book }) {
 const [failed, setFailed] = useState(false);
 const imageUrl = String(book.imageUrl || "").trim();

 useEffect(() => {
 setFailed(false);
 }, [imageUrl]);

 if (!imageUrl) return null;

 return (
 <div className={`book-inline-preview ${failed ? "invalid" : ""}`}>
 {!failed ? (
 <img
 className="book-cover"
 src={imageUrl}
 alt={`Xem trước ảnh sách ${book.title || ""}`}
 onError={() => setFailed(true)}
 />
 ) : (
 <div className="book-cover book-cover-placeholder">
 {String(book.title || "?").charAt(0).toUpperCase()}
 </div>
 )}
 <span>
 <strong>{failed ? "URL ảnh không hợp lệ" : "Xem trước ảnh sách"}</strong>
 <small>{failed ? "Kiểm tra lại đường dẫn ảnh trước khi lưu." : "Ảnh này sẽ hiển thị trong danh sách, grid và chi tiết sách."}</small>
 </span>
 </div>
 );
}

function BookDetailPanel({
 book,
 loans,
 reviews,
 reservations,
 relatedBooks,
 onClose,
 onEditBook,
 onBorrowBook,
 onReserveBook,
 onToggleWishlist,
 onSelectBook,
 canManage,
 canBorrow,
 borrowing,
 wishlisted,
}) {
 const [activeTab, setActiveTab] = useState("overview");
 const availableQuantity = getAvailableQuantity(book);
 const borrowedQuantity = Math.max(0, Number(book.quantity || 0) - availableQuantity);
 const status = getBookStatus(book);
 const bookLoans = loans.filter((loan) => loan.bookId === book.id).sort((first, second) => second.id - first.id);
 const activeLoans = bookLoans.filter((loan) => loan.status !== "returned");
 const bookReviews = reviews.filter((review) => review.bookId === book.id && review.status !== "hidden");
 const waitingReservations = reservations.filter(
 (reservation) => reservation.bookId === book.id && reservation.status === "waiting"
 );
 const drawerStats = [
 { label: "Còn lại", value: `${availableQuantity}/${book.quantity ?? 0}` },
 { label: "Đang mượn", value: borrowedQuantity },
 { label: "Lượt mượn", value: bookLoans.length },
 { label: "Đặt trước", value: waitingReservations.length },
 ];
 const timelineItems = [...bookLoans.map((loan) => ({
 id: `loan-${loan.id}`,
 tone: loan.status === "overdue" ? "danger" : loan.status === "returned" ? "success" : "primary",
 date: loan.returnedDate || loan.dueDate || loan.borrowedDate,
 title: loan.status === "returned" ? "Đã trả sách" : loan.status === "overdue" ? "Phiếu quá hạn" : "Đang mượn",
 detail: `${loan.readerName || "Độc giả"} · Mượn ${loan.borrowedDate || "-"} · Hạn ${loan.dueDate || "-"}`,
 })),...waitingReservations.map((reservation) => ({
 id: `reservation-${reservation.id}`,
 tone: "warning",
 date: reservation.createdAt,
 title: "Đặt trước đang chờ",
 detail: `${reservation.readerName || "Độc giả"} đang chờ sách`,
 })),...bookReviews.slice(0, 6).map((review) => ({
 id: `review-${review.id}`,
 tone: "success",
 date: review.createdAt,
 title: `Đánh giá ${review.rating || 0}/5`,
 detail: `${review.readerName || "Độc giả"} · ${review.comment || "Không có bình luận."}`,
 })),
 ].filter((item) => item.date || item.detail).sort((first, second) => new Date(second.date || 0) - new Date(first.date || 0)).slice(0, 10);

 return (
 <div className="book-detail-panel book-detail-drawer" data-active-tab={activeTab}>
 <div className="book-detail-cover">
 <BookCover book={book} />
 </div>

 <div className="book-detail-content">
 <div className="book-drawer-topbar">
 <span>Book detail drawer</span>
 <button className="icon-button" type="button" onClick={onClose} aria-label="Đóng chi tiết sách">
 ×
 </button>
 </div>

 <div className="row-between">
 <div>
 <h3>{book.title}</h3>
 <p>{book.author || "Chưa có tác giả"}</p>
 </div>
 <span
 className={getStatusBadgeClass(status)}
 >
 {getBookStatusLabel(book)}
 </span>
 </div>

 <div className="book-drawer-hero-stats">
 {drawerStats.map((item) => (
 <span key={item.label}>
 <strong>{item.value}</strong>
 {item.label}
 </span>
 ))}
 </div>

 <div className="book-drawer-action-strip">
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
 <button className="secondary-button" type="button" onClick={() => onEditBook(book)}>
 Sửa sách
 </button>
 )}
 </div>

 <div className="drawer-tab-list" role="tablist">
 {[
 ["overview", "Tổng quan"],
 ["history", "Timeline"],
 ["reviews", "Đánh giá"],
 ["reservations", "Đặt trước"],
 ["related", "Gợi ý"],
 ].map(([tab, label]) => (
 <button
 className={activeTab === tab ? "active" : ""}
 type="button"
 role="tab"
 aria-selected={activeTab === tab}
 key={tab}
 onClick={() => setActiveTab(tab)}
 >
 {label}
 </button>
 ))}
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
 <button className="secondary-button" type="button" onClick={() => onToggleWishlist(book)}>
 <Heart size={17} fill={wishlisted ? "currentColor" : "none"} />
 {wishlisted ? "Bỏ yêu thích" : "Yêu thích"}
 </button>
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

 <div className="book-life-timeline">
 <h4>Timeline vòng đời sách</h4>
 {timelineItems.length === 0 ? (
 <div className="empty-state compact">Chưa có hoạt động nào cho sách này.</div>
 ) : (
 <div className="book-timeline-list">
 {timelineItems.map((item) => (
 <div className={`book-timeline-item ${item.tone}`} key={item.id}>
 <span className="book-timeline-dot" />
 <div>
 <strong>{item.title}</strong>
 <small>{item.date ? new Date(item.date).toLocaleDateString("vi-VN") : "Chưa có ngày"}</small>
 <p>{item.detail}</p>
 </div>
 </div>
 ))}
 </div>
 )}
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

 <div className="book-insight-grid">
 <div className="book-insight-card">
 <h4>Đánh giá độc giả</h4>
 {bookReviews.length === 0 ? (
 <div className="empty-state compact">Chưa có đánh giá cho sách này.</div>
 ) : (
 <div className="book-review-list">
 {bookReviews.slice(0, 5).map((review) => (
 <div className="book-review-item" key={review.id}>
 <strong>{review.readerName}</strong>
 <span>{"★".repeat(Number(review.rating || 0))}</span>
 <small>{review.comment || "Không có bình luận."}</small>
 </div>
 ))}
 </div>
 )}
 </div>

 <div className="book-insight-card">
 <h4>Đặt trước đang chờ</h4>
 {waitingReservations.length === 0 ? (
 <div className="empty-state compact">Không có hàng chờ cho sách này.</div>
 ) : (
 <div className="reservation-mini-list">
 {waitingReservations.slice(0, 5).map((reservation, index) => (
 <span key={reservation.id}>
 #{index + 1} {reservation.readerName} - {new Date(reservation.createdAt).toLocaleDateString("vi-VN")}
 </span>
 ))}
 </div>
 )}
 </div>
 </div>

 {relatedBooks.length > 0 && (
 <div className="book-related-section">
 <h4>Gợi ý sách liên quan</h4>
 <div className="book-related-grid">
 {relatedBooks.map((relatedBook) => (
 <button className="book-related-item" type="button" key={relatedBook.id} onClick={() => onSelectBook(relatedBook.id)}>
 <BookCover book={relatedBook} />
 <span>
 <strong>{relatedBook.title}</strong>
 <small>{relatedBook.author}</small>
 </span>
 </button>
 ))}
 </div>
 </div>
 )}
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
 const [reviews, setReviews] = useState([]);
 const [reservations, setReservations] = useState([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const [searchQuery, setSearchQuery] = useState("");
 const [categoryFilter, setCategoryFilter] = useState("");
 const [authorFilter, setAuthorFilter] = useState("");
 const [publisherFilter, setPublisherFilter] = useState("");
 const [yearFilter, setYearFilter] = useState("");
 const [stockFilter, setStockFilter] = useState("");
 const [imageFilter, setImageFilter] = useState("");
 const [conditionFilter, setConditionFilter] = useState("");
 const [sortMode, setSortMode] = useState("title-asc");
 const [viewMode, setViewMode] = useState("table");
 const [pageDensity, setPageDensity] = useState("comfortable");
 const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
 const [currentPage, setCurrentPage] = useState(1);
 const [pageSize, setPageSize] = useState(12);
 const [selectedBookIds, setSelectedBookIds] = useState([]);
 const [wishlistIds, setWishlistIds] = useState(() => {
 try {
 const raw = JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]");
 return Array.isArray(raw) ? raw : [];
 } catch {
 return [];
 }
 });
 const [importMode, setImportMode] = useState("upsert");
 const [importRows, setImportRows] = useState([]);
 const [importError, setImportError] = useState("");
 const [importing, setImporting] = useState(false);
 const [savedViews, setSavedViews] = useState(() => {
 try {
 const raw = JSON.parse(localStorage.getItem(BOOK_SAVED_VIEWS_KEY) || "[]");
 return Array.isArray(raw) ? raw : [];
 } catch {
 return [];
 }
 });
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
 const [formSubmitted, setFormSubmitted] = useState(false);
 const [formData, setFormData] = useState({
 title: "",
 imageUrl: "",
 author: "",
 category: "",
 isbn: "",
 condition: "good",
 publisher: "",
 year: "",
 quantity: "",
 shelfLocation: "",
 description: "",
 });

 const loadBooks = async () => {
 setLoading(true);
 setError("");

 try {
 const [bookData, loanData, reviewData, reservationData] = await Promise.all([
 getBooks(),
 getLoans(),
 getReviews(),
 getReservations(),
 ]);
 setBooks(bookData);
 setLoans(loanData);
 setReviews(reviewData);
 setReservations(reservationData);
 } catch (err) {
 setError(err.message || "Không thể tải dữ liệu sách.");
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 loadBooks();
 }, []);

 useEffect(() => {
 try {
 localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlistIds));
 } catch {}
 }, [wishlistIds]);

 useEffect(() => {
 try {
 localStorage.setItem(BOOK_SAVED_VIEWS_KEY, JSON.stringify(savedViews));
 } catch {}
 }, [savedViews]);

 const categories = useMemo(
 () => Array.from(new Set(books.map((book) => book.category).filter(Boolean))).sort(),
 [books]
 );

 const authors = useMemo(
 () => Array.from(new Set(books.map((book) => book.author).filter(Boolean))).sort(),
 [books]
 );

 const publishers = useMemo(
 () => Array.from(new Set(books.map((book) => book.publisher).filter(Boolean))).sort(),
 [books]
 );

 const years = useMemo(
 () =>
 Array.from(new Set(books.map((book) => String(book.year || "").trim()).filter(Boolean))).sort(
 (first, second) => Number(second) - Number(first)
 ),
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
 activeLoans: loans.filter((loan) => loan.status !== "returned").length,
 overdueLoans: loans.filter(isLoanOverdue).length,
 }),
 [books, loans]
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
 books.map((book) => ({...book,
 borrowedCount: borrowCountByBookId[book.id] || 0,
 })).filter((book) => book.borrowedCount > 0).sort((first, second) => second.borrowedCount - first.borrowedCount).slice(0, 3),
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
 const matchesAuthor = !authorFilter || book.author === authorFilter;
 const matchesPublisher = !publisherFilter || book.publisher === publisherFilter;
 const matchesYear = !yearFilter || String(book.year || "").trim() === yearFilter;
 const status = getBookStatus(book);
 const matchesStock =
 !stockFilter ||
 (stockFilter === "attention" && (["low", "out", "blocked"].includes(status) || !hasBookImage(book))) ||
 status === stockFilter;
 const matchesCondition = !conditionFilter || (book.condition || "good") === conditionFilter;
 const matchesImage =
 !imageFilter ||
 (imageFilter === "with-image" && hasBookImage(book)) ||
 (imageFilter === "missing-image" && !hasBookImage(book));

 return matchesQuery && matchesCategory && matchesAuthor && matchesPublisher && matchesYear && matchesStock && matchesCondition && matchesImage;
 });

 return sortBooks(filtered, sortMode);
 }, [books, searchQuery, categoryFilter, authorFilter, publisherFilter, yearFilter, stockFilter, conditionFilter, imageFilter, sortMode]);

 const totalPages = Math.max(1, Math.ceil(filteredBooks.length / pageSize));
 const pagedBooks = useMemo(
 () => filteredBooks.slice((currentPage - 1) * pageSize, currentPage * pageSize),
 [filteredBooks, currentPage, pageSize]
 );

 useEffect(() => {
 setCurrentPage(1);
 }, [searchQuery, categoryFilter, authorFilter, publisherFilter, yearFilter, stockFilter, conditionFilter, imageFilter, sortMode, pageSize]);

 useEffect(() => {
 setCurrentPage((page) => Math.min(page, totalPages));
 }, [totalPages]);

 const selectedBook = useMemo(
 () => books.find((book) => book.id === selectedBookId) || null,
 [books, selectedBookId]
 );

 const selectedBooks = useMemo(
 () => books.filter((book) => selectedBookIds.includes(book.id)),
 [books, selectedBookIds]
 );

 const visibleBookIds = useMemo(() => pagedBooks.map((book) => book.id), [pagedBooks]);
 const allVisibleSelected = visibleBookIds.length > 0 && visibleBookIds.every((id) => selectedBookIds.includes(id));
 const bulkTargetBooks = selectedBooks.length > 0 ? selectedBooks : filteredBooks;

 const wishlistBooks = useMemo(
 () => books.filter((book) => wishlistIds.includes(book.id)).slice(0, 6),
 [books, wishlistIds]
 );

 const duplicateBookMap = useMemo(() => {
 const map = new Map();
 books.forEach((book) => {
 const key = getImportKey(book);
 if (key !== "book:::") map.set(key, book);
 });
 return map;
 }, [books]);

 const importPreview = useMemo(
 () =>
 importRows.map((book, index) => {
 const duplicate = duplicateBookMap.get(getImportKey(book));
 const valid = Boolean(book.title && book.author && book.category && Number.isFinite(book.quantity) && book.quantity >= 0);
 const action = !valid
 ? "invalid"
 : duplicate && importMode === "add"
 ? "skip"
 : duplicate && importMode === "update"
 ? "update"
 : duplicate && importMode === "upsert"
 ? "update"
 : !duplicate && importMode === "update"
 ? "skip"
 : "create";

 return { id: `${book.title}-${index}`, book, duplicate, valid, action };
 }),
 [duplicateBookMap, importMode, importRows]
 );

 const importSummary = useMemo(
 () => ({
 create: importPreview.filter((item) => item.action === "create").length,
 update: importPreview.filter((item) => item.action === "update").length,
 skip: importPreview.filter((item) => item.action === "skip").length,
 invalid: importPreview.filter((item) => item.action === "invalid").length,
 }),
 [importPreview]
 );

 const catalogDuplicateCounts = useMemo(
 () =>
 books.reduce((result, book) => {
 const key = [
 normalizeBookQualityText(book.title),
 normalizeBookQualityText(book.author),
 ].join("::");
 if (key !== "::") result[key] = (result[key] || 0) + 1;
 return result;
 }, {}),
 [books]
 );

 const catalogQualityItems = useMemo(
 () =>
 books.map((book) => {
 const duplicateKey = [
 normalizeBookQualityText(book.title),
 normalizeBookQualityText(book.author),
 ].join("::");
 const issues = getBookQualityIssues(
 book,
 catalogDuplicateCounts[duplicateKey] || 1,
 activeLoanCountByBookId[book.id] || 0
 );
 const penalty = issues.reduce((total, issue) => total + issue.weight, 0);
 const score = Math.max(0, Math.min(100, 100 - penalty));

 return {
 book,
 issues,
 score,
 tone: score >= 86 ? "success" : score >= 66 ? "warning" : "danger",
 };
 }).sort((first, second) => first.score - second.score || second.issues.length - first.issues.length),
 [activeLoanCountByBookId, books, catalogDuplicateCounts]
 );

 const catalogQualitySummary = useMemo(() => {
 const total = Math.max(1, catalogQualityItems.length);
 const totalScore = catalogQualityItems.reduce((sum, item) => sum + item.score, 0);
 const issueCounts = catalogQualityItems.reduce((counts, item) => {
 item.issues.forEach((issue) => {
 counts[issue.field] = (counts[issue.field] || 0) + 1;
 });
 return counts;
 }, {});

 return {
 averageScore: Math.round(totalScore / total),
 cleanBooks: catalogQualityItems.filter((item) => item.issues.length === 0).length,
 issueBooks: catalogQualityItems.filter((item) => item.issues.length > 0).length,
 criticalBooks: catalogQualityItems.filter((item) => item.score < 66).length,
 issueCounts,
 topIssues: Object.entries(issueCounts).sort((first, second) => second[1] - first[1]).slice(0, 4),
 };
 }, [catalogQualityItems]);

 const catalogQualityQueue = useMemo(
 () => catalogQualityItems.filter((item) => item.issues.length > 0).slice(0, 6),
 [catalogQualityItems]
 );

 const openCatalogQualityIssue = (item) => {
 setSelectedBookIds([item.book.id]);
 setSelectedBookId(item.book.id);
 setSearchQuery(item.book.title || "");
 setCurrentPage(1);
 window.setTimeout(() => {
 document.querySelector(".books-control-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
 }, 0);
 };

 const auditGroups = useMemo(
 () => [
 {
 id: "missing-isbn",
 label: "Thiếu ISBN",
 books: books.filter((book) => !String(book.isbn || "").trim()),
 apply: () => {
 setSearchQuery("");
 setStockFilter("");
 setImageFilter("");
 setConditionFilter("");
 setSortMode("title-asc");
 },
 },
 {
 id: "missing-image",
 label: "Thiếu ảnh bìa",
 books: books.filter((book) => !hasBookImage(book)),
 apply: () => setImageFilter("missing-image"),
 },
 {
 id: "stock-risk",
 label: "Sắp hết / hết",
 books: books.filter((book) => ["low", "out"].includes(getBookStatus(book))),
 apply: () => setStockFilter("attention"),
 },
 {
 id: "blocked",
 label: "Đang sửa / mất",
 books: books.filter((book) => getBookStatus(book) === "blocked"),
 apply: () => setStockFilter("blocked"),
 },
 {
 id: "quantity-risk",
 label: "Số lượng bất thường",
 books: books.filter((book) => Number(book.quantity || 0) < Number(activeLoanCountByBookId[book.id] || 0)),
 apply: () => setSortMode("quantity-asc"),
 },
 ],
 [books, activeLoanCountByBookId]
 );

 const relatedBooks = useMemo(() => {
 if (!selectedBook) return [];

 return books.filter(
 (book) =>
 book.id !== selectedBook.id &&
 (book.category === selectedBook.category || book.author === selectedBook.author)
 ).sort((first, second) => {
 const firstScore =
 Number(first.category === selectedBook.category) + Number(first.author === selectedBook.author);
 const secondScore =
 Number(second.category === selectedBook.category) + Number(second.author === selectedBook.author);
 return secondScore - firstScore;
 }).slice(0, 4);
 }, [books, selectedBook]);

 const hasActiveFilters =
 Boolean(searchQuery.trim()) ||
 Boolean(categoryFilter) ||
 Boolean(authorFilter) ||
 Boolean(publisherFilter) ||
 Boolean(yearFilter) ||
 Boolean(stockFilter) ||
 Boolean(conditionFilter) ||
 Boolean(imageFilter) ||
 sortMode !== "title-asc";

 const activeFilterCount = [
 searchQuery.trim(),
 categoryFilter,
 authorFilter,
 publisherFilter,
 yearFilter,
 stockFilter,
 conditionFilter,
 imageFilter,
 sortMode !== "title-asc" ? sortMode : "",
 ].filter(Boolean).length;

 const bookKpis = [
 {
 label: "Tổng đầu sách",
 value: bookSummary.total,
 helper: "Danh mục đang quản lý ",
 tone: "primary",
 icon: BookOpen,
 },
 {
 label: "Có thể mượn",
 value: bookSummary.available,
 helper: "Cần hàng và sẵn sàng",
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
 label: "Đang mượn",
 value: bookSummary.activeLoans,
 helper: `${bookSummary.overdueLoans} lượt quá hạn`,
 tone: bookSummary.overdueLoans > 0 ? "danger" : "primary",
 icon: UserRound,
 },
 {
 label: "Thiếu ảnh bìa",
 value: bookSummary.missingImage,
 helper: `${bookSummary.withImage} sách đã có ảnh`,
 tone: bookSummary.missingImage > 0 ? "danger" : "success",
 icon: ImageOff,
 },
 ];
 const bookDiscoverySnapshot = [
 {
 label: "Tìm sách cần hàng",
 value: bookSummary.available,
 detail: "Lọc nhanh các sách có thể mượn ngay",
 tone: "success",
 action: () => setStockFilter("available"),
 },
 {
 label: "Cần bổ sung dữ liệu",
 value: bookSummary.missingImage,
 detail: "Sách thiếu ảnh bìa trong danh mục",
 tone: bookSummary.missingImage > 0 ? "warning" : "success",
 action: () => setImageFilter("missing-image"),
 },
 {
 label: "Được mượn nhiều",
 value: popularBookSpotlight.length,
 detail: "Mở nhóm sách có sức hút cao",
 tone: "primary",
 action: () => setSortMode("available-desc"),
 },
 {
 label: "Wishlist",
 value: wishlistBooks.length,
 detail: "Sách độc giả đang quan tâm",
 tone: wishlistBooks.length > 0 ? "primary" : "neutral",
 action: () => setViewMode("grid"),
 },
 ];
 const collectionLanes = [
 {
 label: "Sẵn sàng mượn",
 detail: "Cần hàng, trạng thái tốt",
 tone: "success",
 books: books.filter((book) => getBookStatus(book) === "available" && (book.condition || "good") === "good").slice(0, 4),
 action: () => {
 setStockFilter("available");
 setConditionFilter("good");
 },
 },
 {
 label: "Cần kiểm kê",
 detail: "Sắp hết, hết hoặc đang sửa/mất",
 tone: "warning",
 books: books.filter((book) => ["low", "out", "blocked"].includes(getBookStatus(book))).slice(0, 4),
 action: () => setStockFilter("attention"),
 },
 {
 label: "Thiếu dữ liệu",
 detail: "Thiếu ảnh bìa hoặc ISBN",
 tone: "danger",
 books: books.filter((book) => !hasBookImage(book) || !String(book.isbn || "").trim()).slice(0, 4),
 action: () => setImageFilter("missing-image"),
 },
 {
 label: "Gợi ýkhám phá",
 detail: "Sách nổi bật theo lịch sử mượn",
 tone: "primary",
 books: popularBookSpotlight.slice(0, 4),
 action: () => setViewMode("grid"),
 },
 ];

 const recommendationEngine = useMemo(() => {
 const waitingReservationCountByBookId = reservations.reduce((result, reservation) => {
 if (reservation.status === "waiting") {
 result[reservation.bookId] = (result[reservation.bookId] || 0) + 1;
 }
 return result;
 }, {});

 const reviewStatsByBookId = reviews.reduce((result, review) => {
 if (review.status === "hidden") return result;

 const current = result[review.bookId] || { total: 0, count: 0 };
 current.total += Number(review.rating || 0);
 current.count += 1;
 result[review.bookId] = current;
 return result;
 }, {});

 const enrichedBooks = books.map((book) => {
 const borrowedCount = borrowCountByBookId[book.id] || 0;
 const activeLoans = activeLoanCountByBookId[book.id] || 0;
 const waitingReservations = waitingReservationCountByBookId[book.id] || 0;
 const reviewStats = reviewStatsByBookId[book.id] || { total: 0, count: 0 };
 const averageRating = reviewStats.count ? reviewStats.total / reviewStats.count : Number(book.averageRating || 0);
 const availableQuantity = getAvailableQuantity(book);
 const status = getBookStatus(book);
 const demandScore = borrowedCount * 4 + waitingReservations * 6 + reviewStats.count * 2 + Math.round(averageRating || 0);
 const stockPressure =
 status === "out" || status === "low" || waitingReservations > availableQuantity || (borrowedCount >= 3 && availableQuantity <= 1);

 return {...book,
 activeLoans,
 averageRating,
 availableQuantity,
 borrowedCount,
 demandScore,
 reviewCount: reviewStats.count || book.reviewCount || 0,
 stockPressure,
 waitingReservations,
 };
 });

 const reorderBooks = enrichedBooks.filter((book) => book.demandScore > 0 && book.stockPressure).sort((first, second) => second.demandScore - first.demandScore || first.availableQuantity - second.availableQuantity).slice(0, 4);

 const promoteBooks = enrichedBooks.filter((book) => getBookStatus(book) === "available" && book.demandScore > 0 && book.availableQuantity > 1).sort((first, second) => second.demandScore - first.demandScore || second.averageRating - first.averageRating).slice(0, 4);

 const quietInventory = enrichedBooks.filter((book) => getBookStatus(book) === "available" && book.borrowedCount === 0 && book.availableQuantity >= 3).sort((first, second) => second.availableQuantity - first.availableQuantity).slice(0, 4);

 const categoryDemand = Object.values(
 enrichedBooks.reduce((result, book) => {
 const category = book.category || "Chưa phân loại";
 const current = result[category] || { category, demandScore: 0, borrowedCount: 0, waitingReservations: 0, stockPressure: 0 };
 current.demandScore += book.demandScore;
 current.borrowedCount += book.borrowedCount;
 current.waitingReservations += book.waitingReservations;
 current.stockPressure += book.stockPressure ? 1 : 0;
 result[category] = current;
 return result;
 }, {})
 ).filter((item) => item.demandScore > 0).sort((first, second) => second.demandScore - first.demandScore).slice(0, 4);

 const topCategory = categoryDemand[0];
 const totalDemand = enrichedBooks.reduce((total, book) => total + book.demandScore, 0);
 const stockRiskCount = enrichedBooks.filter((book) => book.stockPressure).length;

 return {
 categoryDemand,
 healthText:
 stockRiskCount > 0
 ? `${stockRiskCount} đầu sách cần quyết định nhập thêm`
 : "Tồn kho đang khỏe, có thể tập trung quảng básách",
 promoteBooks,
 quietInventory,
 reorderBooks,
 topCategory,
 totalDemand,
 };
 }, [activeLoanCountByBookId, books, borrowCountByBookId, reservations, reviews]);

 const demandPlanner = useMemo(() => {
 const candidates = recommendationEngine.reorderBooks.map((book) => {
 const targetStock = Math.max(3, book.activeLoans + book.waitingReservations + 2);
 const suggestedQuantity = Math.max(1, targetStock - book.availableQuantity);
 const urgency =
 book.availableQuantity <= 0 || book.waitingReservations > book.availableQuantity
 ? "danger"
 : book.availableQuantity <= 1
 ? "warning"
 : "success";

 return {...book,
 suggestedQuantity,
 targetStock,
 urgency,
 };
 });

 const totalSuggested = candidates.reduce((total, book) => total + book.suggestedQuantity, 0);
 const blockedDemand = candidates.filter((book) => book.availableQuantity <= 0).length;
 const waitingReaders = candidates.reduce((total, book) => total + book.waitingReservations, 0);

 return {
 blockedDemand,
 candidates,
 totalSuggested,
 waitingReaders,
 };
 }, [recommendationEngine.reorderBooks]);

 const formErrors = useMemo(() => {
 const errors = {};
 if (!String(formData.title || "").trim()) errors.title = "Cần nhập tên sách.";
 if (!String(formData.author || "").trim()) errors.author = "Cần nhập tác giả.";
 if (!String(formData.category || "").trim()) errors.category = "Cần nhập thể loại.";
 if (formData.quantity === "" || Number(formData.quantity) < 0) errors.quantity = "Số lượng phải từ 0 trở lên.";
 if (formData.year && !/^\d{4}$/.test(String(formData.year))) errors.year = "Năm xuất bản cần có 4 chữ số.";
 if (formData.imageUrl && !/^https?:\/\//i.test(String(formData.imageUrl))) errors.imageUrl = "URL ảnh nên bắt đầu bằng http:// hoặc https://.";
 return errors;
 }, [formData]);

 const handleChange = (event) => {
 const { name, value } = event.target;

 setFormData({...formData,
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
 publisher: "",
 year: "",
 quantity: "",
 shelfLocation: "",
 description: "",
 });

 setFormSubmitted(false);
 setEditingBookId(null);
 setShowForm(false);
 };

 const resetFilters = () => {
 setSearchQuery("");
 setCategoryFilter("");
 setAuthorFilter("");
 setPublisherFilter("");
 setYearFilter("");
 setStockFilter("");
 setConditionFilter("");
 setImageFilter("");
 setSortMode("title-asc");
 };

 const openRecommendedBook = (book) => {
 setSelectedBookId(book.id);
 setSearchQuery(book.title || "");
 setViewMode("grid");
 setCurrentPage(1);
 };

 const applyRecommendationLane = (lane, item) => {
 resetFilters();
 setViewMode("grid");

 if (lane === "reorder") {
 setStockFilter("attention");
 setSortMode("available-asc");
 }

 if (lane === "promote") {
 setStockFilter("available");
 setSortMode("available-desc");
 }

 if (lane === "quiet") {
 setStockFilter("available");
 setSortMode("quantity-desc");
 }

 if (lane === "category" && item?.category) {
 setCategoryFilter(item.category);
 }

 setCurrentPage(1);
 };

 const openDemandPlanBook = (book) => {
 setSelectedBookIds([book.id]);
 openRecommendedBook(book);
 };

 const saveCurrentView = () => {
 const name = window.prompt("Đặt tên saved view", stockFilter === "attention" ? "Sách cần xử lý" : "Bộ lọc sách");
 if (!name) return;

 const view = {
 id: `view-${Date.now()}`,
 name,
 filters: { searchQuery, categoryFilter, authorFilter, publisherFilter, yearFilter, stockFilter, imageFilter, conditionFilter, sortMode, viewMode, pageSize },
 };
 setSavedViews((views) => [view,...views.filter((item) => item.name !== name)].slice(0, 8));
 };

 const applySavedView = (view) => {
 const filters = view.filters || {};
 setSearchQuery(filters.searchQuery || "");
 setCategoryFilter(filters.categoryFilter || "");
 setAuthorFilter(filters.authorFilter || "");
 setPublisherFilter(filters.publisherFilter || "");
 setYearFilter(filters.yearFilter || "");
 setStockFilter(filters.stockFilter || "");
 setImageFilter(filters.imageFilter || "");
 setConditionFilter(filters.conditionFilter || "");
 setSortMode(filters.sortMode || "title-asc");
 setViewMode(filters.viewMode || "table");
 setPageSize(filters.pageSize || 12);
 };

 const handleAddClick = () => {
 if (!canManage || !onNavigateToCreate) return;

 resetForm();
 onNavigateToCreate();
 };

 const toggleBookSelection = (bookId) => {
 setSelectedBookIds((ids) => (ids.includes(bookId) ? ids.filter((id) => id !== bookId) : [...ids, bookId]));
 };

 const toggleVisibleSelection = () => {
 setSelectedBookIds((ids) => {
 if (allVisibleSelected) {
 return ids.filter((id) => !visibleBookIds.includes(id));
 }

 return Array.from(new Set([...ids,...visibleBookIds]));
 });
 };

 const toggleWishlist = (book) => {
 setWishlistIds((ids) => (ids.includes(book.id) ? ids.filter((id) => id !== book.id) : [...ids, book.id]));
 };

 const handleImportFile = async (event) => {
 const file = event.target.files?.[0];
 event.target.value = "";
 if (!file) return;

 try {
 const content = await file.text();
 const payload = JSON.parse(content);
 const rows = Array.isArray(payload) ? payload : payload.books;
 if (!Array.isArray(rows)) {
 throw new Error("File JSON phải là mảng sách hoặc object có trường books.");
 }
 setImportRows(rows.map(normalizeImportBook));
 setImportError("");
 } catch (err) {
 setImportRows([]);
 setImportError(err.message || "Không thể đọc file JSON.");
 }
 };

 const confirmImportBooks = async () => {
 if (!canManage || !onSaveBook || importSummary.invalid > 0) return;

 setImporting(true);
 setImportError("");
 try {
 for (const item of importPreview) {
 if (item.action === "skip" || item.action === "invalid") continue;
 await onSaveBook({...(item.duplicate || {}),...item.book,
 id: item.action === "update" ? item.duplicate.id : undefined,
 });
 }
 setImportRows([]);
 await loadBooks();
 } catch (err) {
 setImportError(err.message || "Không thể nhập dữ liệu sách.");
 } finally {
 setImporting(false);
 }
 };

 const handleSaveBook = async () => {
 if (!canManage || !onSaveBook) return;

 setFormSubmitted(true);

 if (Object.keys(formErrors).length > 0) {
 return;
 }

 await onSaveBook({
 id: editingBookId,
 title: formData.title.trim(),
 imageUrl: formData.imageUrl.trim(),
 author: formData.author.trim(),
 category: formData.category.trim(),
 isbn: formData.isbn.trim(),
 condition: formData.condition,
 publisher: formData.publisher.trim(),
 year: formData.year.trim(),
 quantity: Number(formData.quantity),
 shelfLocation: formData.shelfLocation.trim(),
 description: formData.description.trim(),
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
 publisher: book.publisher || "",
 year: book.year || "",
 quantity: book.quantity || "",
 shelfLocation: book.shelfLocation || "",
 description: book.description || "",
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
 const queuePosition =
 reservations.filter((reservation) => reservation.bookId === book.id && reservation.status === "waiting").length + 1;
 await createReservation({ bookId: book.id });
 alert(`Đã ghi nhận đặt trước sách. Vị trí dự kiến trong hàng chờ: #${queuePosition}.`);
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
 for (const book of bulkTargetBooks) {
 await onSaveBook({...book,...updates,
 });
 }
 setBulkUpdate({ category: "", publisher: "", shelfLocation: "" });
 setSelectedBookIds([]);
 setBulkConfirmOpen(false);
 await loadBooks();
 } catch (err) {
 alert(err.message || "Không thể cập nhật hàng loạt.");
 } finally {
 setBulkUpdating(false);
 }
 };

 return (
 <div className={`page-shell books-page page-density-${pageDensity}`}>
 <div className="page-title row-between books-hero">
 <div>
 <span className="page-eyebrow">
 <Sparkles size={16} />
 Kho sách thư viện
 </span>
 <h2>Quản lý sách</h2>
 <p>Danh sách sách gồm tên sách, ảnh bìa và tênh trạng tồn kho hiện tại.</p>
 <div className="page-hero-meta">
 <span>{filteredBooks.length} sách đang hiển thị</span>
 <span>{categories.length} thể loại</span>
 <span>{authors.length} tác giả</span>
 <span>{bookSummary.overdueLoans} quá hạn</span>
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
 <LoadingState lines={4} />
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

 <div className="book-discovery-snapshot">
 {bookDiscoverySnapshot.map((item) => (
 <button className={`book-discovery-card ${item.tone}`} type="button" key={item.label} onClick={item.action}>
 <span>{item.label}</span>
 <strong>{item.value}</strong>
 <small>{item.detail}</small>
 </button>
 ))}
 </div>

 <div className="book-collection-lanes">
 {collectionLanes.map((lane) => (
 <button className={`book-collection-card ${lane.tone}`} type="button" key={lane.label} onClick={lane.action}>
 <span>{lane.label}</span>
 <strong>{lane.books.length}</strong>
 <small>{lane.detail}</small>
 <em>{lane.books.map((book) => book.title).join(", ") || "Không có sách trong nhóm này"}</em>
 </button>
 ))}
 </div>

 <div className="table-card smart-recommendation-panel-clean" style={{ marginBottom: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <span className="page-eyebrow">
 <Brain size={15} />
 AI Demand Planner
 </span>
 <h3>Gợi ý nhập thêm & quảng básách</h3>
 <p>Ưu tiên theo lượt mượn, hàng chờ đặt trước, đánh giá và áp lực tồn kho hiện tại.</p>
 </div>
 <div className="recommendation-health">
 <Sparkles size={18} />
 <strong>{recommendationEngine.totalDemand}</strong>
 <span>điểm nhu cầu</span>
 </div>
 </div>

 <div className="recommendation-brief">
 <strong>{recommendationEngine.healthText}</strong>
 <span>
 {recommendationEngine.topCategory
 ? `Thể loại nổi bật: ${recommendationEngine.topCategory.category} với ${recommendationEngine.topCategory.borrowedCount} lượt mượn và ${recommendationEngine.topCategory.waitingReservations} đặt trước.`
 : "Chưa đủ lịch sử mượn/đặt trước để xếp hạng nhu cầu."}
 </span>
 </div>

 <div className="recommendation-grid">
 <section className="recommendation-column warning">
 <button type="button" className="recommendation-column-action" onClick={() => applyRecommendationLane("reorder")}>
 <span>Nên nhập thêm</span>
 <strong>{recommendationEngine.reorderBooks.length}</strong>
 <small>Sách có nhu cầu cao nhưng tồn kho đang yếu.</small>
 </button>
 <div className="recommendation-list">
 {recommendationEngine.reorderBooks.map((book) => (
 <button type="button" key={book.id} onClick={() => openRecommendedBook(book)}>
 <strong>{book.title}</strong>
 <small>{book.borrowedCount} mượn · {book.waitingReservations} đặt · cần {book.availableQuantity}</small>
 </button>
 ))}
 {recommendationEngine.reorderBooks.length === 0 && <span className="recommendation-empty">Không có sách cần nhập gấp.</span>}
 </div>
 </section>

 <section className="recommendation-column success">
 <button type="button" className="recommendation-column-action" onClick={() => applyRecommendationLane("promote")}>
 <span>Nên quảng bá</span>
 <strong>{recommendationEngine.promoteBooks.length}</strong>
 <small>Sách có sức hút và vẫn cần đủ bản để mượn.</small>
 </button>
 <div className="recommendation-list">
 {recommendationEngine.promoteBooks.map((book) => (
 <button type="button" key={book.id} onClick={() => openRecommendedBook(book)}>
 <strong>{book.title}</strong>
 <small>{book.borrowedCount} mượn · {book.reviewCount} đánh giá · cần {book.availableQuantity}</small>
 </button>
 ))}
 {recommendationEngine.promoteBooks.length === 0 && <span className="recommendation-empty">Chưa có sách đủ tín hiệu quảng bá.</span>}
 </div>
 </section>

 <section className="recommendation-column primary">
 <button
 type="button"
 className="recommendation-column-action"
 onClick={() => applyRecommendationLane("category", recommendationEngine.topCategory)}
 >
 <span>Thể loại nêng</span>
 <strong>{recommendationEngine.categoryDemand.length}</strong>
 <small>Nhóm nội dung đang tạo nhu cầu mượn/đặt.</small>
 </button>
 <div className="recommendation-list">
 {recommendationEngine.categoryDemand.map((item) => (
 <button type="button" key={item.category} onClick={() => applyRecommendationLane("category", item)}>
 <strong>{item.category}</strong>
 <small>{item.borrowedCount} mượn · {item.waitingReservations} đặt · {item.stockPressure} rủi ro tồn</small>
 </button>
 ))}
 {recommendationEngine.categoryDemand.length === 0 && <span className="recommendation-empty">Chưa có thể loại nổi bật.</span>}
 </div>
 </section>

 <section className="recommendation-column neutral">
 <button type="button" className="recommendation-column-action" onClick={() => applyRecommendationLane("quiet")}>
 <span>Kho im lặng</span>
 <strong>{recommendationEngine.quietInventory.length}</strong>
 <small>Sách cần nhiều nhưng chưa phát sinh lượt mượn.</small>
 </button>
 <div className="recommendation-list">
 {recommendationEngine.quietInventory.map((book) => (
 <button type="button" key={book.id} onClick={() => openRecommendedBook(book)}>
 <strong>{book.title}</strong>
                      <small>{book.category || "Chưa phân loại"} · cần {book.availableQuantity} bản</small>
 </button>
 ))}
 {recommendationEngine.quietInventory.length === 0 && <span className="recommendation-empty">Không có sách tồn cao bị bỏ quản.</span>}
 </div>
 </section>
 </div>
 </div>

 {canManage && (
 <div className="table-card demand-planner-card" style={{ marginBottom: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <span className="page-eyebrow">
 <Sparkles size={15} />
 Demand Planner
 </span>
 <h3>Kế hoạch nhập thêm theo nhu cầu</h3>
 <p>Ước tính sách cần bổ sung từ lượt mượn, đặt trước, đánh giá và tồn kho còn lại.</p>
 </div>
 <button className="secondary-button icon-label-button" type="button" onClick={() => applyRecommendationLane("reorder")}>
 <PackageCheck size={16} />
 <span>Mở nhóm cần nhập</span>
 </button>
 </div>

 <div className="demand-planner-grid">
 <section className="demand-planner-summary">
 <span className="demand-score-card danger">
 <strong>{demandPlanner.totalSuggested}</strong>
 bản nên nhập thêm
 </span>
 <span className="demand-score-card warning">
 <strong>{demandPlanner.blockedDemand}</strong>
 đầu sách đang nghẽn
 </span>
 <span className="demand-score-card success">
 <strong>{demandPlanner.waitingReaders}</strong>
 lượt đặt trước
 </span>
 </section>

 <section className="demand-plan-list">
 {demandPlanner.candidates.map((book) => (
 <article className={book.urgency} key={book.id}>
 <div>
 <strong>{book.title}</strong>
 <span>
 Còn {book.availableQuantity}/{book.quantity || 0} · {book.borrowedCount} lượt mượn · {book.waitingReservations} đặt trước
 </span>
 </div>
 <small>+{book.suggestedQuantity} bản</small>
 <button type="button" onClick={() => openDemandPlanBook(book)}>
 Xử lý
 </button>
 </article>
 ))}
 {demandPlanner.candidates.length === 0 && (
 <div className="empty-state compact">Chưa có sách nào cần nhập thêm ngay.</div>
 )}
 </section>
 </div>
 </div>
 )}

 {canManage && (
 <div className="table-card books-audit-card" style={{ marginBottom: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <h3>Audit kho sách</h3>
 <p>Checklist các nhóm dữ liệu cần bổ sung hoặc kiểm kê.</p>
 </div>
 <span className="badge">{auditGroups.reduce((total, group) => total + group.books.length, 0)} vấn đề</span>
 </div>
 <div className="books-audit-grid">
 {auditGroups.map((group) => (
 <button className="books-audit-item" type="button" key={group.id} onClick={group.apply}>
 <strong>{group.books.length}</strong>
 <span>{group.label}</span>
 <small>{group.books.slice(0, 2).map((book) => book.title).join(", ") || "Không có vấn đề"}</small>
 </button>
 ))}
 </div>
 </div>
 )}

 {canManage && (
 <div className="table-card catalog-quality-lab" style={{ marginBottom: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <span className="page-eyebrow">
 <Brain size={15} />
 AI Catalog Quality Lab
 </span>
 <h3>Phòng kiểm định dữ liệu sách</h3>
 <p>Chấm điểm metadata, phát hiện sách trùng và gom các đầu sách cần chuẩn hóa.</p>
 </div>
 <div className={`catalog-quality-score ${catalogQualitySummary.averageScore >= 86 ? "success" : catalogQualitySummary.averageScore >= 66 ? "warning" : "danger"}`}>
 <Gauge size={18} />
 <strong>{catalogQualitySummary.averageScore}/100</strong>
 <span>độ sạch catalog</span>
 </div>
 </div>

 <div className="catalog-quality-grid">
 <section className="catalog-quality-overview">
 <div className="catalog-quality-kpis">
 <span>
 <strong>{catalogQualitySummary.cleanBooks}</strong>
 Sách sạch dữ liệu
 </span>
 <span>
 <strong>{catalogQualitySummary.issueBooks}</strong>
 Cần bổ sung
 </span>
 <span className={catalogQualitySummary.criticalBooks > 0 ? "danger" : "success"}>
 <strong>{catalogQualitySummary.criticalBooks}</strong>
 Rủi ro cao
 </span>
 </div>
 <div className="catalog-issue-cloud">
 {catalogQualitySummary.topIssues.length > 0 ? (
 catalogQualitySummary.topIssues.map(([field, count]) => (
 <span key={field}>
 {QUALITY_FIELD_LABELS[field] || field}
 <strong>{count}</strong>
 </span>
 ))
 ) : (
 <span>
 Catalog sạch
 <strong>0</strong>
 </span>
 )}
 </div>
 </section>

 <section className="catalog-quality-queue">
 <div className="catalog-quality-section-title">
 <ClipboardList size={18} />
 <strong>Hàng chờ dọn dữ liệu</strong>
 </div>
 <div className="catalog-quality-list">
 {catalogQualityQueue.map((item) => (
 <article className={item.tone} key={item.book.id}>
 <div>
 <strong>{item.book.title}</strong>
 <span>{item.issues.slice(0, 3).map((issue) => issue.label).join(" · ")}</span>
 </div>
 <small>{item.score}/100</small>
 <button type="button" onClick={() => openCatalogQualityIssue(item)}>
 <Wand2 size={15} />
 Sửa
 </button>
 </article>
 ))}
 {catalogQualityQueue.length === 0 && (
 <div className="empty-state compact">Không có sách cần dọn dữ liệu.</div>
 )}
 </div>
 </section>
 </div>
 </div>
 )}

 <div className="table-card inventory-filter-card books-control-card">
 <div className="books-control-top">
 <div className="books-control-title">
 <h3>Tồn kho sách</h3>
 <div className="summary-values books-summary-pills">
 <span>{filteredBooks.length}/{bookSummary.total} đang hiển thị</span>
 <span>{activeFilterCount} bộ lọc</span>
 <span>{bookSummary.available} cần tốt</span>
 <span>{bookSummary.low + bookSummary.out} sắp hết / hết</span>
 <span>{bookSummary.overdueLoans} quá hạn</span>
 {canManage && <span>{selectedBookIds.length} đã chọn</span>}
 </div>
 </div>

 <div className="books-control-actions">
 <div className="view-mode-toggle" role="group" aria-label="Chọn kiểu hiển thị">
 {[
 ["table", List, "Bảng"],
 ["grid", LayoutGrid, "Lưới"],
 ["compact", Rows3, "Gọn"],
 ].map(([mode, Icon, label]) => (
 <button
 className={viewMode === mode ? "active" : ""}
 type="button"
 key={mode}
 onClick={() => setViewMode(mode)}
 title={label}
 >
 <Icon size={16} />
 </button>
 ))}
 </div>
 <span className="books-view-caption">
 {viewMode === "grid" ? "Lưới ảnh" : viewMode === "compact" ? "Bảng gọn" : "Bảng chi tiết"}
 </span>
 <div className="view-mode-toggle density-toggle" role="group" aria-label="Chọn mật độ hiển thị">
 {[
 ["comfortable", "Thoáng"],
 ["compact", "Gọn"],
 ].map(([mode, label]) => (
 <button
 className={pageDensity === mode ? "active" : ""}
 type="button"
 key={mode}
 onClick={() => setPageDensity(mode)}
 title={label}
 >
 {label}
 </button>
 ))}
 </div>
 <button className="secondary-button icon-label-button" type="button" onClick={downloadFilteredBooksJson}>
 <FileJson size={16} />
 <span>JSON</span>
 </button>
 <button className="secondary-button icon-label-button" type="button" onClick={downloadFilteredBooksCsv}>
 <FileSpreadsheet size={16} />
 <span>CSV</span>
 </button>
 </div>
 </div>

 <div className="books-control-main">
 <div className="search-bar books-search-bar">
 <label>Tìm kiếm</label>
 <span className="search-field-icon">
 <Search size={17} />
 </span>
 <input
 type="search"
 value={searchQuery}
 onChange={(event) => setSearchQuery(event.target.value)}
 placeholder="Tìm tên sách, tác giả, ISBN, NXB hoặc vị trí"
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
 <label>Tác giả</label>
 <select value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)}>
 <option value="">Tất cả</option>
 {authors.map((author) => (
 <option key={author} value={author}>
 {author}
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
 <option value="attention">Cần xử lý</option>
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

 <div className="quick-filter-strip books-quick-filters">
 {savedViews.map((view) => (
 <button className="quick-filter-chip saved-view-chip" type="button" key={view.id} onClick={() => applySavedView(view)}>
 {view.name}
 </button>
 ))}
 <button className="quick-filter-chip" type="button" onClick={saveCurrentView}>
 Lưu view
 </button>
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
 Thiếu ảnh
 </button>
 <button
 className={`quick-filter-chip ${stockFilter === "attention" ? "active" : ""}`}
 type="button"
 onClick={() => setStockFilter("attention")}
 >
 Cần xử lý
 </button>
 </div>

 <details className="books-advanced-filters" open={advancedFiltersOpen || activeFilterCount > 3}>
 <summary onClick={(event) => {
 event.preventDefault();
 setAdvancedFiltersOpen((open) => !open);
 }}>
 <span>
 <SlidersHorizontal size={16} />
 Bộ lọc nâng cao
 </span>
 <strong>{activeFilterCount}</strong>
 </summary>

 <div className="filters-row">
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
 <label>Năm xuất bản</label>
 <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
 <option value="">Tất cả</option>
 {years.map((year) => (
 <option key={year} value={year}>
 {year}
 </option>
 ))}
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
 <label>Hiển thị</label>
 <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
 <option value={8}>8 / trang</option>
 <option value={12}>12 / trang</option>
 <option value={20}>20 / trang</option>
 <option value={50}>50 / trang</option>
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
 </details>
 </div>

 <div className="books-workspace-layout">
 <section className="books-workspace-main">

 {canManage && (
 <div className="table-card import-preview-card" style={{ marginBottom: 24 }}>
 <div className="table-card-header row-between">
 <div>
 <h3>Nhập sách từ JSON</h3>
 <p>Preview sách mới, sách trùng ISBN/tên tác giả và chọn cách xử lý trước khi nhập.</p>
 </div>
 <label className="secondary-button">
 <Upload size={16} />
 <span>Chọn file JSON</span>
 <input type="file" accept=".json,application/json" onChange={handleImportFile} hidden />
 </label>
 </div>

 <div className="import-mode-row">
 <label>
 <input type="radio" name="importMode" value="upsert" checked={importMode === "upsert"} onChange={(event) => setImportMode(event.target.value)} />
 Thêm mới và cập nhật sách trùng
 </label>
 <label>
 <input type="radio" name="importMode" value="add" checked={importMode === "add"} onChange={(event) => setImportMode(event.target.value)} />
 Chỉ thêm mới, bỏ qua sách trùng
 </label>
 <label>
 <input type="radio" name="importMode" value="update" checked={importMode === "update"} onChange={(event) => setImportMode(event.target.value)} />
 Chỉ cập nhật sách trùng
 </label>
 </div>

 {importError && <div className="form-error-banner">{importError}</div>}
 {importRows.length > 0 && (
 <>
 <div className="import-summary-row">
 <span>Tạo mới: <strong>{importSummary.create}</strong></span>
 <span>Cập nhật: <strong>{importSummary.update}</strong></span>
 <span>Bỏ qua: <strong>{importSummary.skip}</strong></span>
 <span>Lỗi: <strong>{importSummary.invalid}</strong></span>
 </div>
 <div className="import-preview-list">
 {importPreview.slice(0, 8).map((item) => (
 <div className={`import-preview-item ${item.action}`} key={item.id}>
 <strong>{item.book.title || "Thiếu tên sách"}</strong>
 <span>{item.book.author || "Thiếu tác giả"} · {item.book.category || "Thiếu thể loại"}</span>
 <small>
 {item.action === "create" && "Sẽ thêm mới"}
 {item.action === "update" && `Sẽ cập nhật #${item.duplicate.id}`}
 {item.action === "skip" && "Sẽ bỏ qua vì bị trùng"}
 {item.action === "invalid" && "Thiếu dữ liệu bắt buộc"}
 </small>
 </div>
 ))}
 </div>
 <div className="form-actions">
 <button className="primary-button" type="button" onClick={confirmImportBooks} disabled={importing || importSummary.invalid > 0}>
 {importing ? "Đang nhập..." : "Xác nhận nhập"}
 </button>
 <button className="secondary-button" type="button" onClick={() => setImportRows([])} disabled={importing}>
 Hủy preview
 </button>
 </div>
 </>
 )}
 </div>
 )}

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
 <span className="badge">{bulkTargetBooks.length} sách</span>
 </div>

 <div className="bulk-workspace-scope">
 <span>
 <strong>{selectedBookIds.length > 0 ? "Theo lựa chọn" : "Theo bộ lọc"}</strong>
 Phạm vi áp dụng
 </span>
 <span>
 <strong>{selectedBookIds.length}</strong>
 Sách đã chọn
 </span>
 <span>
 <strong>{filteredBooks.length}</strong>
 Đang hiển thị theo lọc
 </span>
 <span>
 <strong>{importRows.length}</strong>
 Dòng import preview
 </span>
 </div>

 <div className="form-grid">
 <div className="form-group">
 <label>Thể loại mới</label>
 <input
 type="text"
 value={bulkUpdate.category}
 onChange={(event) => setBulkUpdate((state) => ({...state, category: event.target.value }))}
 placeholder="Để trống nếu không đổi"
 />
 </div>
 <div className="form-group">
 <label>Nhà xuất bản mới</label>
 <input
 type="text"
 value={bulkUpdate.publisher}
 onChange={(event) => setBulkUpdate((state) => ({...state, publisher: event.target.value }))}
 placeholder="Để trống nếu không đổi"
 />
 </div>
 <div className="form-group">
 <label>Vị trí kệ mới</label>
 <input
 type="text"
 value={bulkUpdate.shelfLocation}
 onChange={(event) => setBulkUpdate((state) => ({...state, shelfLocation: event.target.value }))}
 placeholder="Để trống nếu không đổi"
 />
 </div>
 </div>

 <div className="form-actions">
 <button
 className="primary-button"
 type="button"
 onClick={handleBulkUpdate}
 disabled={bulkUpdating || bulkTargetBooks.length === 0}
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
 reviews={reviews}
 reservations={reservations}
 relatedBooks={relatedBooks}
 onClose={() => setSelectedBookId(null)}
 onEditBook={handleEditBook}
 onBorrowBook={handleBorrowBook}
 onReserveBook={handleReserveBook}
 onToggleWishlist={toggleWishlist}
 onSelectBook={setSelectedBookId}
 canManage={canManage}
 canBorrow={canBorrow}
 borrowing={borrowingBookId === selectedBook.id}
 wishlisted={wishlistIds.includes(selectedBook.id)}
 />
 )}

 {canManage && showForm && (
 <div className="form-card book-editor-card">
 <div className="book-editor-header">
 <div>
 <span className="page-eyebrow">
 <BookOpen size={15} />
 {editingBookId ? "Chỉnh sửa đầu sách" : "Đầu sách mới"}
 </span>
 <h3>{editingBookId ? "Cập nhật sách" : "Thêm sách mới"}</h3>
 <p>Nhập đủ thông tin chính, phân loại kho và ảnh bìa trước khi lưu.</p>
 </div>
 <button className="secondary-button" type="button" onClick={resetForm}>
 Hủy
 </button>
 </div>

 <div className="book-editor-layout">
 <aside className="book-editor-preview">
 <BookImagePreview book={formData} />
 {!formData.imageUrl && (
 <div className="book-editor-empty-preview">
 <ImageOff size={26} />
 <strong>Chưa có ảnh bìa</strong>
 <span>Thêm URL ảnh để card và bảng dễ nhận diện hơn.</span>
 </div>
 )}
 </aside>

 <div className="book-editor-fields">
 <section className="form-section">
 <div className="form-section-title">
 <h4>Thông tin sách</h4>
 <span className="badge">Bắt buộc</span>
 </div>
 <div className="form-grid">
 <div className="form-group">
 <label>Tên sách</label>
 <input type="text" name="title" placeholder="Nhập tên sách" value={formData.title} onChange={handleChange} />
 {formSubmitted && formErrors.title && <small className="field-error">{formErrors.title}</small>}
 </div>

 <div className="form-group">
 <label>Tác giả</label>
 <input type="text" name="author" placeholder="Nhập tác giả" value={formData.author} onChange={handleChange} />
 {formSubmitted && formErrors.author && <small className="field-error">{formErrors.author}</small>}
 </div>

 <div className="form-group">
 <label>Thể loại</label>
 <input type="text" name="category" placeholder="Nhập thể loại" value={formData.category} onChange={handleChange} />
 {formSubmitted && formErrors.category && <small className="field-error">{formErrors.category}</small>}
 </div>

 <div className="form-group">
 <label>ISBN</label>
 <input type="text" name="isbn" placeholder="Nhập ISBN" value={formData.isbn} onChange={handleChange} />
 </div>
 </div>
 </section>

 <section className="form-section">
 <div className="form-section-title">
 <h4>Kho và phân loại</h4>
 <span className={formData.condition === "good" ? "badge success" : "badge warning"}>{getConditionLabel(formData.condition)}</span>
 </div>
 <div className="form-grid">
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
 <input type="number" name="quantity" placeholder="Nhập số lượng" min="0" value={formData.quantity} onChange={handleChange} />
 {formSubmitted && formErrors.quantity && <small className="field-error">{formErrors.quantity}</small>}
 </div>

 <div className="form-group">
 <label>Nhà xuất bản</label>
 <input type="text" name="publisher" placeholder="Nhập nhà xuất bản" value={formData.publisher} onChange={handleChange} />
 </div>

 <div className="form-group">
 <label>Năm xuất bản</label>
 <input type="text" name="year" inputMode="numeric" placeholder="VD: 2024" value={formData.year} onChange={handleChange} />
 {formSubmitted && formErrors.year && <small className="field-error">{formErrors.year}</small>}
 </div>

 <div className="form-group">
 <label>Vị trí kệ</label>
 <input type="text" name="shelfLocation" placeholder="VD: A2-03" value={formData.shelfLocation} onChange={handleChange} />
 </div>

 <div className="form-group">
 <label>Ảnh sách</label>
 <input type="url" name="imageUrl" placeholder="https://example.com/book-cover.jpg" value={formData.imageUrl} onChange={handleChange} />
 {formSubmitted && formErrors.imageUrl && <small className="field-error">{formErrors.imageUrl}</small>}
 </div>
 </div>
 </section>

 <section className="form-section">
 <div className="form-section-title">
 <h4>Mô tả</h4>
 </div>
 <div className="form-group">
 <textarea name="description" rows="4" placeholder="Tóm tắt nội dung, ghi chú bảo quản hoặc thông tin đặc biệt" value={formData.description} onChange={handleChange} />
 </div>
 </section>

 <div className="form-actions book-editor-actions">
 <button className="primary-button" type="button" onClick={handleSaveBook}>
 {editingBookId ? "Cập nhật" : "Lưu sách"}
 </button>
 <button className="secondary-button" type="button" onClick={resetForm}>
 Hủy
 </button>
 </div>
 </div>
 </div>
 </div>
 )}

 {canManage && (
 <div className="bulk-selection-bar">
 <button className="secondary-button" type="button" onClick={toggleVisibleSelection} disabled={pagedBooks.length === 0}>
 <CheckSquare size={16} />
 <span>{allVisibleSelected ? "Bỏ chọn trang này" : "Chọn tất cả trang này"}</span>
 </button>
 <span>{selectedBookIds.length} sách đã chọn</span>
 {selectedBookIds.length > 0 && (
 <button className="small-button" type="button" onClick={() => setSelectedBookIds([])}>
 Bỏ chọn
 </button>
 )}
 </div>
 )}

 {viewMode === "grid" && (
 <div className="book-card-grid">
 {pagedBooks.map((book) => {
 const status = getBookStatus(book);

 return (
 <article className={"book-card-item" + (selectedBookIds.includes(book.id) ? " selected" : "")} key={book.id}>
 {canManage && (
 <label className="book-select-check">
 <input type="checkbox" checked={selectedBookIds.includes(book.id)} onChange={() => toggleBookSelection(book.id)} />
 <span>Chọn</span>
 </label>
 )}
 <BookCover book={book} />
 <div>
 <strong>{book.title}</strong>
 <span>{book.author || "-"}</span>
 <small>{book.category || "Chưa phân loại"}</small>
 </div>
 <div className="book-card-meta">
 <span>Còn {getAvailableQuantity(book)}/{book.quantity}</span>
 <span className={getStatusBadgeClass(status)}>
 {getBookStatusLabel(book)}
 </span>
 </div>
 <div className="book-card-status-row">
 <span className="badge">Đang mượn {activeLoanCountByBookId[book.id] || 0}</span>
 <span className={hasBookImage(book) ? "badge success" : "badge warning"}>{hasBookImage(book) ? "Có ảnh" : "Thiếu ảnh"}</span>
 </div>
 <div className="action-buttons">
 {canBorrow && (
 <button className="small-button" type="button" onClick={() => toggleWishlist(book)}>
 <Heart size={14} fill={wishlistIds.includes(book.id) ? "currentColor" : "none"} />
 </button>
 )}
 <button className="small-button" type="button" onClick={() => setSelectedBookId(book.id)}>Chi tiết</button>
 {canManage && <button className="small-button" type="button" onClick={() => handleEditBook(book)}>Sửa</button>}
 </div>
 </article>
 );
 })}
 {filteredBooks.length === 0 && (
 <EmptyState
 title="Không tìm thấy sách phù hợp"
 description="Thử xóa bộ lọc hoặc thêm sách mới vào kho."
 action={
 <button className="secondary-button" type="button" onClick={resetFilters} disabled={!hasActiveFilters}>
 Xóa bộ lọc
 </button>
 }
 />
 )}
 </div>
 )}

 <div className={"table-card books-table-card" + (viewMode === "grid" ? " is-hidden" : "") + (viewMode === "compact" ? " compact-mode" : "")}>
 <div className="table-responsive">
 <table className="table table-sm">
 <thead>
 <tr>
 {canManage && <th className="select-column">Chọn</th>}
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
 {pagedBooks.map((book) => {
 const status = getBookStatus(book);

 return (
 <tr key={book.id}>
 {canManage && (
 <td className="select-column">
 <input
 type="checkbox"
 checked={selectedBookIds.includes(book.id)}
 onChange={() => toggleBookSelection(book.id)}
 aria-label={`Chọn ${book.title}`}
 />
 </td>
 )}
 <td>#{book.id}</td>
 <td>
 <div className="book-info">
 <BookCover book={book} />
 <div>
 <strong>{book.title}</strong>
 <span>{book.isbn ? `ISBN ${book.isbn}` : book.publisher || book.shelfLocation || "Chưa có thông tin thêm"}</span>
 {book.reviewCount > 0 && <span>★ {book.averageRating}/5 từ {book.reviewCount} đánh giá</span>}
 <span className="book-table-badges">
 <span className="badge">Đang mượn {activeLoanCountByBookId[book.id] || 0}</span>
 <span className={hasBookImage(book) ? "badge success" : "badge warning"}>{hasBookImage(book) ? "Có ảnh" : "Thiếu ảnh"}</span>
 </span>
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
 className={getStatusBadgeClass(status)}
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

 {canBorrow && (
 <button className="small-button" type="button" onClick={() => toggleWishlist(book)}>
 <Heart size={14} fill={wishlistIds.includes(book.id) ? "currentColor" : "none"} />
 </button>
 )}

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
 <td colSpan={(canManage || canBorrow ? 8 : 7) + (canManage ? 1 : 0)} className="empty-table">
 <EmptyState
 title="Không tìm thấy sách phù hợp"
 description="Bộ lọc hiện tại không có kết quả. Có thể xóa bộ lọc để xem lại toàn bộ kho."
 action={
 <button className="secondary-button" type="button" onClick={resetFilters} disabled={!hasActiveFilters}>
 Xóa bộ lọc
 </button>
 }
 />
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </div>

 {filteredBooks.length > 0 && (
 <div className="pagination-row books-pagination-row">
 <span>
 Trang {currentPage}/{totalPages} - hiển thị {pagedBooks.length}/{filteredBooks.length} sách
 </span>
 <div className="action-buttons">
 <button
 className="small-button"
 type="button"
 onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
 disabled={currentPage <= 1}
 >
 Trước
 </button>
 <button
 className="small-button"
 type="button"
 onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
 disabled={currentPage >= totalPages}
 >
 Sau
 </button>
 </div>
 </div>
 )}

 </section>

 <aside className="books-workspace-side">
 <div className="table-card">
 <div className="table-card-header">
 <div>
 <h3>Bảng điều khiển kho</h3>
 <p>Thông tin thao tác nhanh theo danh sách hiện tại.</p>
 </div>
 </div>
 <div className="workspace-side-list">
 <span>Đang hiển thị <strong>{filteredBooks.length}</strong></span>
 <span>Đã chọn <strong>{selectedBookIds.length}</strong></span>
 <span>Sắp hết / hết <strong>{bookSummary.low + bookSummary.out}</strong></span>
 <span>Thiếu ảnh <strong>{bookSummary.missingImage}</strong></span>
 </div>
 {selectedBooks.length > 0 && (
 <div className="workspace-selected-list">
 {selectedBooks.slice(0, 5).map((book) => (
 <button type="button" key={book.id} onClick={() => setSelectedBookId(book.id)}>
 <strong>{book.title}</strong>
 <small>{book.author || "-"}</small>
 </button>
 ))}
 {selectedBooks.length > 5 && <small>+{selectedBooks.length - 5} sách khác</small>}
 </div>
 )}
 {canBorrow && wishlistBooks.length > 0 && (
 <div className="workspace-selected-list">
 <strong>Danh sách yêu thích</strong>
 {wishlistBooks.map((book) => (
 <button type="button" key={book.id} onClick={() => setSelectedBookId(book.id)}>
 <strong>{book.title}</strong>
 <small>{getBookStatusLabel(book)}</small>
 </button>
 ))}
 </div>
 )}
 </div>
 </aside>
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
 <p>Cập nhật {bulkTargetBooks.length} sách {selectedBookIds.length > 0 ? "đã chọn" : "đang hiển thị theo bộ lọc hiện tại"}?</p>
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

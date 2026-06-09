import { useEffect, useMemo, useState } from "react";

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

function BookInfo({ book }) {
 return (
 <div className="book-info">
 <BookCover book={book} />
 <div>
 <strong>{book.title}</strong>
 <span>{book.publisher || "Chưa có NXB"}</span>
 {book.isbn && <span>ISBN {book.isbn}</span>}
 </div>
 </div>
 );
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

function getAvailableQuantity(book) {
 return Number(book.availableQuantity ?? book.quantity ?? 0);
}

function sortBooks(books, sortMode) {
 const sortedBooks = [...books];

 sortedBooks.sort((firstBook, secondBook) => {
 if (sortMode === "title-desc") {
 return String(secondBook.title || "").localeCompare(String(firstBook.title || ""), "vi");
 }

 if (sortMode === "available-asc") {
 return getAvailableQuantity(firstBook) - getAvailableQuantity(secondBook);
 }

 if (sortMode === "available-desc") {
 return getAvailableQuantity(secondBook) - getAvailableQuantity(firstBook);
 }

 if (sortMode === "quantity-desc") {
 return Number(secondBook.quantity || 0) - Number(firstBook.quantity || 0);
 }

 return String(firstBook.title || "").localeCompare(String(secondBook.title || ""), "vi");
 });

 return sortedBooks;
}

function BookTable({ books, onEditBook, onDeleteBook, loading, error }) {
 const [searchQuery, setSearchQuery] = useState("");
 const [sortMode, setSortMode] = useState("title-asc");
 const [pageSize, setPageSize] = useState(8);
 const [currentPage, setCurrentPage] = useState(1);

 const filteredBooks = useMemo(() => {
 const normalizedQuery = searchQuery.trim().toLowerCase();
 const visibleBooks = normalizedQuery
 ? books.filter((book) =>
 [
 book.title,
 book.author,
 book.category,
 book.isbn,
 book.publisher,
 book.shelfLocation,
 ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery))
 )
 : books;

 return sortBooks(visibleBooks, sortMode);
 }, [books, searchQuery, sortMode]);

 const totalPages = Math.max(1, Math.ceil(filteredBooks.length / pageSize));
 const pageStartIndex = (currentPage - 1) * pageSize;
 const pageEndIndex = Math.min(pageStartIndex + pageSize, filteredBooks.length);
 const pagedBooks = useMemo(
 () => filteredBooks.slice(pageStartIndex, pageEndIndex),
 [filteredBooks, pageEndIndex, pageStartIndex]
 );

 useEffect(() => {
 setCurrentPage(1);
 }, [searchQuery, sortMode, pageSize]);

 useEffect(() => {
 setCurrentPage((page) => Math.min(page, totalPages));
 }, [totalPages]);

 return (
 <div className="table-card">
 <div className="table-card-header row-between">
 <h3>Danh sách sách</h3>
 <div className="table-card-actions">
 <span className="note">
 {books.length > 0
 ? `Hiển thị ${filteredBooks.length}/${books.length} sách`
 : "Chưa có dữ liệu sách"}
 </span>
 </div>
 </div>

 {error ? (
 <div className="error-message">{error}</div>
 ) : loading ? (
 <div className="empty-state">Đang tải danh sách sách...</div>
 ) : books.length === 0 ? (
 <div className="empty-state">Chưa có sách nào trong hệ thống.</div>
 ) : (
 <>
 <div className="book-table-toolbar">
 <div className="search-bar book-table-search">
 <label htmlFor="book-table-search">Tìm sách</label>
 <input
 id="book-table-search"
 type="search"
 value={searchQuery}
 onChange={(event) => setSearchQuery(event.target.value)}
 placeholder="Tìm theo tên, tác giả, ISBN, thể loại..."
 />
 </div>
 <div className="filter-group">
 <label htmlFor="book-table-sort">Sắp xếp</label>
 <select
 id="book-table-sort"
 value={sortMode}
 onChange={(event) => setSortMode(event.target.value)}
 >
 <option value="title-asc">Tên A-Z</option>
 <option value="title-desc">Tên Z-A</option>
 <option value="available-asc">Còn ít trước</option>
 <option value="available-desc">Còn nhiều trước</option>
 <option value="quantity-desc">Số lượng nhiều</option>
 </select>
 </div>
 <div className="filter-group">
 <label htmlFor="book-table-page-size">Mỗi trang</label>
 <select
 id="book-table-page-size"
 value={pageSize}
 onChange={(event) => setPageSize(Number(event.target.value))}
 >
 <option value="8">8 sách</option>
 <option value="12">12 sách</option>
 <option value="20">20 sách</option>
 <option value="50">50 sách</option>
 </select>
 </div>
 </div>

 {filteredBooks.length === 0 ? (
 <div className="empty-state">Không tìm thấy sách phù hợp.</div>
 ) : (
 <>
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
 {(onEditBook || onDeleteBook) && <th>Hành động</th>}
 </tr>
 </thead>
 <tbody>
 {pagedBooks.map((book) => (
 <tr key={book.id}>
 <td>#{book.id}</td>
 <td>
 <BookInfo book={book} />
 </td>
 <td>{book.author}</td>
 <td>{book.category}</td>
 <td>{getConditionLabel(book.condition)}</td>
 <td>{book.quantity}</td>
 <td>{getAvailableQuantity(book)}</td>
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

 <div className="pagination-row book-table-pagination-row">
 <span>
 Trang {currentPage}/{totalPages} - hiển thị {pageStartIndex + 1}-
 {pageEndIndex}/{filteredBooks.length} sách
 </span>
 <div className="action-buttons">
 <button
 className="small-button"
 type="button"
 disabled={currentPage <= 1}
 onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
 >
 Trước
 </button>
 <button
 className="small-button"
 type="button"
 disabled={currentPage >= totalPages}
 onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
 >
 Sau
 </button>
 </div>
 </div>
 </>
 )}
 </>
 )}
 </div>
 );
}

export default BookTable;

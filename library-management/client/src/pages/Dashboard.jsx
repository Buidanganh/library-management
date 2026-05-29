import { useEffect, useState } from "react";
import { read, utils } from "xlsx";
import { getStats, createBook, createReader, createBooksBulk } from "../services/api";

const formatCurrency = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);

function getStatusLabel(status) {
  if (status === "borrowed") return "Đang mượn";
  if (status === "overdue") return "Quá hạn";
  if (status === "returned") return "Đã trả";
  return status;
}

function getDueSoonLabel(dueDate) {
  const today = new Date(new Date().toISOString().split("T")[0]);
  const due = new Date(dueDate);
  const daysLeft = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return "Hôm nay";
  }

  return `Còn ${daysLeft} ngày`;
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsvToBooks(csvText) {
  const rows = csvText
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (rows.length < 2) {
    throw new Error("CSV phải có hàng header và ít nhất một dòng dữ liệu.");
  }

  const headers = splitCsvLine(rows[0])
    .map((header) => header.trim().toLowerCase());

  return rows.slice(1).map((line) => {
    const values = splitCsvLine(line).map((value) => value.trim());
    const book = {};
    headers.forEach((key, i) => {
      book[key] = values[i] ?? "";
    });
    return {
      title: book.title || book.name || "",
      imageUrl: book.imageurl || book.imageUrl || "",
      author: book.author || "",
      category: book.category || "",
      publisher: book.publisher || "",
      year: book.year || "",
      quantity: Number(book.quantity || 0),
      shelfLocation: book.shelflocation || book.shelfLocation || "",
      description: book.description || "",
    };
  });
}

function parseXlsxToBooks(arrayBuffer) {
  const workbook = read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = utils.sheet_to_json(sheet, { defval: "" });

  return jsonData.map((book) => ({
    title: book.title || book.name || "",
    imageUrl: book.imageurl || book.imageUrl || "",
    author: book.author || "",
    category: book.category || "",
    publisher: book.publisher || "",
    year: book.year || "",
    quantity: Number(book.quantity || 0),
    shelfLocation: book.shelflocation || book.shelfLocation || "",
    description: book.description || "",
  }));
}

function validateBookRow(book, index) {
  const errors = [];
  if (!String(book.title || "").trim()) {
    errors.push("Thiếu trường title.");
  }
  if (!String(book.author || "").trim()) {
    errors.push("Thiếu trường author.");
  }
  if (!String(book.category || "").trim()) {
    errors.push("Thiếu trường category.");
  }
  if (!Number.isFinite(Number(book.quantity)) || Number(book.quantity) < 0) {
    errors.push("Trường quantity phải là số >= 0.");
  }

  return {
    index,
    errors,
    book,
  };
}

function validateBulkRows(rows) {
  return rows.map((book, index) => validateBookRow(book, index));
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

function downloadCsvTemplate() {
  const headers = [
    "title",
    "author",
    "category",
    "publisher",
    "year",
    "quantity",
    "shelfLocation",
    "description",
    "imageUrl",
  ];
  const exampleRow = [
    "Clean Code",
    "Robert C. Martin",
    "Lập trình",
    "Prentice Hall",
    "2008",
    "10",
    "Kệ A1",
    "Sách về mã sạch và thiết kế phần mềm",
    "https://example.com/clean-code.jpg",
  ];
  downloadFile([headers.join(","), exampleRow.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")].join("\n"), "template-sach.csv", "text/csv;charset=utf-8;");
}

function Dashboard({ onAddBook, onAddReader, onNavigateToBorrow, isAdmin }) {
  const [summary, setSummary] = useState({
    totalBooks: 0,
    readers: 0,
    borrowed: 0,
    overdue: 0,
    dueSoon: 0,
    totalFines: 0,
    availableBooks: 0,
    lowStockBooks: [],
    popularBooks: [],
    recentLoans: [],
    dueSoonLoans: [],
  });
  const [error, setError] = useState("");
  const [showBookModal, setShowBookModal] = useState(false);
  const [showReaderModal, setShowReaderModal] = useState(false);

  const [bookForm, setBookForm] = useState({
    title: "",
    imageUrl: "",
    author: "",
    category: "",
    publisher: "",
    year: "",
    quantity: 1,
    shelfLocation: "",
    description: "",
  });

  const [readerForm, setReaderForm] = useState({ name: "", email: "", phone: "" });
  const [bulkImporting, setBulkImporting] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkPreviewRows, setBulkPreviewRows] = useState([]);
  const [bulkRowErrors, setBulkRowErrors] = useState([]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await getStats();
        setSummary({
          totalBooks: data.totalBooks ?? 0,
          readers: data.readers ?? 0,
          borrowed: data.borrowed ?? 0,
          overdue: data.overdue ?? 0,
          dueSoon: data.dueSoon ?? 0,
          totalFines: data.totalFines ?? 0,
          availableBooks: data.availableBooks ?? 0,
          lowStockBooks: data.lowStockBooks ?? [],
          popularBooks: data.popularBooks ?? [],
          recentLoans: data.recentLoans ?? [],
          dueSoonLoans: data.dueSoonLoans ?? [],
        });
      } catch (err) {
        setError(err.message || "Không thể tải thống kê.");
      }
    };

    loadStats();
  }, []);

  const openBookModal = () => setShowBookModal(true);
  const closeBookModal = () => setShowBookModal(false);
  const openReaderModal = () => setShowReaderModal(true);
  const closeReaderModal = () => setShowReaderModal(false);

  const handleBookChange = (e) => setBookForm({ ...bookForm, [e.target.name]: e.target.value });
  const handleReaderChange = (e) => setReaderForm({ ...readerForm, [e.target.name]: e.target.value });

  const submitBook = async (e) => {
    e.preventDefault();
    try {
      await createBook({
        title: bookForm.title,
        imageUrl: bookForm.imageUrl,
        author: bookForm.author,
        category: bookForm.category,
        publisher: bookForm.publisher,
        year: bookForm.year,
        quantity: Number(bookForm.quantity || 0),
        shelfLocation: bookForm.shelfLocation,
        description: bookForm.description,
      });
      closeBookModal();
      const data = await getStats();
      setSummary((s) => ({ ...s, totalBooks: data.totalBooks ?? s.totalBooks }));
    } catch (err) {
      alert(err.message || "Không thể tạo sách.");
    }
  };

  const submitReader = async (e) => {
    e.preventDefault();
    try {
      await createReader({ name: readerForm.name, email: readerForm.email, phone: readerForm.phone });
      closeReaderModal();
      const data = await getStats();
      setSummary((s) => ({ ...s, readers: data.readers ?? s.readers }));
    } catch (err) {
      alert(err.message || "Không thể tạo độc giả.");
    }
  };

  const openBulkModal = () => {
    setBulkInput("");
    setBulkFileName("");
    setBulkError("");
    setShowBulkModal(true);
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
  };

  const handleBulkFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setBulkFileName("");
      return;
    }

    setBulkFileName(file.name);
    const lowerFileName = file.name.toLowerCase();

    try {
      let books = [];

      if (lowerFileName.endsWith(".json")) {
        const content = await file.text();
        setBulkInput(content);
        books = JSON.parse(content);
      } else if (lowerFileName.endsWith(".csv")) {
        const content = await file.text();
        books = parseCsvToBooks(content);
        setBulkInput(JSON.stringify(books, null, 2));
      } else if (lowerFileName.endsWith(".xlsx")) {
        const arrayBuffer = await file.arrayBuffer();
        books = parseXlsxToBooks(arrayBuffer);
        setBulkInput(JSON.stringify(books, null, 2));
      } else {
        setBulkError("Chỉ chấp nhận file JSON, CSV hoặc XLSX.");
        return;
      }

      if (!Array.isArray(books)) {
        throw new Error("Dữ liệu phải là mảng các sách.");
      }

      const preview = books.map((book) => ({
        ...book,
        quantity: Number(book.quantity || 0),
      }));
      setBulkPreviewRows(preview);
      setBulkRowErrors(validateBulkRows(preview));
      setBulkError("");
    } catch (err) {
      setBulkError(err.message || "Lỗi khi phân tích file nhập.");
      setBulkInput("");
      setBulkPreviewRows([]);
      setBulkRowErrors([]);
    }
  };

  const handleBulkInputChange = (event) => {
    const value = event.target.value;
    setBulkInput(value);
    setBulkFileName("");
    setBulkError("");

    try {
      const books = JSON.parse(value);
      if (!Array.isArray(books)) {
        throw new Error("Dữ liệu phải là mảng các sách.");
      }
      const preview = books.map((book) => ({
        ...book,
        quantity: Number(book.quantity || 0),
      }));
      setBulkPreviewRows(preview);
      setBulkRowErrors(validateBulkRows(preview));
    } catch (err) {
      setBulkPreviewRows([]);
      setBulkRowErrors([]);
    }
  };

  const submitBulkBooks = async (event) => {
    event.preventDefault();
    if (!bulkInput.trim()) {
      setBulkError("Vui lòng nhập dữ liệu JSON hoặc tải file CSV/JSON.");
      return;
    }

    let books;
    try {
      books = JSON.parse(bulkInput);
      if (!Array.isArray(books)) {
        throw new Error("Dữ liệu phải là mảng các sách.");
      }
    } catch (err) {
      setBulkError(err.message || "Dữ liệu JSON không hợp lệ.");
      return;
    }

    const preview = books.map((book) => ({
      ...book,
      quantity: Number(book.quantity || 0),
    }));
    const rowErrors = validateBulkRows(preview);
    const invalidRows = rowErrors.filter((item) => item.errors.length > 0);

    if (invalidRows.length > 0) {
      setBulkRowErrors(rowErrors);
      setBulkError("Vui lòng sửa lỗi dữ liệu trước khi nhập.");
      return;
    }

    try {
      setBulkImporting(true);
      await createBooksBulk(preview);
      const data = await getStats();
      setSummary((s) => ({
        ...s,
        totalBooks: data.totalBooks ?? s.totalBooks,
        availableBooks: data.availableBooks ?? s.availableBooks,
        borrowed: data.borrowed ?? s.borrowed,
        overdue: data.overdue ?? s.overdue,
        dueSoon: data.dueSoon ?? s.dueSoon,
        totalFines: data.totalFines ?? s.totalFines,
      }));
      alert(`Đã thêm ${preview.length} sách vào thư viện.`);
      closeBulkModal();
    } catch (err) {
      setBulkError(err.message || "Không thể thêm sách bulk.");
    } finally {
      setBulkImporting(false);
    }
  };

  const sampleBooks = [
    {
      title: "Clean Code",
      author: "Robert C. Martin",
      category: "Lập trình",
      publisher: "Prentice Hall",
      year: "2008",
      quantity: 8,
      shelfLocation: "Kệ A1",
      description: "Hướng dẫn viết mã sạch và dễ bảo trì.",
    },
    {
      title: "Design Patterns",
      author: "Erich Gamma",
      category: "Lập trình",
      publisher: "Addison-Wesley",
      year: "1994",
      quantity: 5,
      shelfLocation: "Kệ A2",
      description: "Các mẫu thiết kế phần mềm phổ biến.",
    },
    {
      title: "JavaScript: The Good Parts",
      author: "Douglas Crockford",
      category: "Lập trình",
      publisher: "O'Reilly Media",
      year: "2008",
      quantity: 6,
      shelfLocation: "Kệ B3",
      description: "Tổng hợp những phần tốt nhất của JavaScript.",
    },
    {
      title: "Deep Learning",
      author: "Ian Goodfellow",
      category: "AI/ML",
      publisher: "MIT Press",
      year: "2016",
      quantity: 4,
      shelfLocation: "Kệ C1",
      description: "Giới thiệu các thuật toán học sâu.",
    },
    {
      title: "Clean Architecture",
      author: "Robert C. Martin",
      category: "Lập trình",
      publisher: "Prentice Hall",
      year: "2017",
      quantity: 7,
      shelfLocation: "Kệ A1",
      description: "Nguyên lý xây dựng kiến trúc phần mềm bền vững.",
    },
  ];

  const importSampleBooks = async () => {
    if (!isAdmin) return;

    setBulkImporting(true);
    try {
      await createBooksBulk(sampleBooks);
      const data = await getStats();
      setSummary((s) => ({
        ...s,
        totalBooks: data.totalBooks ?? s.totalBooks,
        availableBooks: data.availableBooks ?? s.availableBooks,
        borrowed: data.borrowed ?? s.borrowed,
        overdue: data.overdue ?? s.overdue,
        dueSoon: data.dueSoon ?? s.dueSoon,
        totalFines: data.totalFines ?? s.totalFines,
      }));
      alert("Đã thêm 5 sách mẫu vào thư viện.");
    } catch (err) {
      alert(err.message || "Không thể thêm sách mẫu.");
    } finally {
      setBulkImporting(false);
    }
  };

  const stats = [
    { label: "Tổng số sách", value: summary.totalBooks },
    { label: "Sách còn lại", value: summary.availableBooks },
    { label: "Độc giả", value: summary.readers },
    { label: "Đang mượn", value: summary.borrowed },
    { label: "Sắp đến hạn", value: summary.dueSoon },
    { label: "Quá hạn", value: summary.overdue },
    { label: "Phạt dự kiến", value: formatCurrency(summary.totalFines) },
  ];

  return (
    <div>
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div className="page-title">
        <h2 className="h4">Tổng quan</h2>
          <p className="text-muted">Theo dõi nhanh hoạt động, tồn kho và tình trạng mượn trả của thư viện.</p>
        </div>

        <div className="btn-group">
          {isAdmin && (
            <>
              <button className="btn btn-primary btn-sm" onClick={openBookModal}>
                Thêm sách
              </button>
              <button className="btn btn-outline-primary btn-sm" onClick={openReaderModal}>
                Thêm độc giả
              </button>
              <button className="btn btn-outline-info btn-sm" onClick={openBulkModal}>
                Thêm nhiều sách
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={importSampleBooks}
                disabled={bulkImporting}
              >
                {bulkImporting ? "Đang thêm..." : "Thêm sách mẫu"}
              </button>
            </>
          )}

          <button className="btn btn-outline-success btn-sm" onClick={onNavigateToBorrow}>
            Mượn sách
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-3 mb-4">
        {stats.map((item) => (
          <div className="col-6 col-md-4 col-lg-3" key={item.label}>
            <div className="card h-100 shadow-sm">
              <div className="card-body">
                <p className="mb-1 text-muted small">{item.label}</p>
                <h3 className="mb-0">{item.value}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="card-title">Phiếu mượn gần đây</h5>

              {summary.recentLoans.length === 0 ? (
                <div className="text-muted">Chưa có phiếu mượn nào.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Mã</th>
                        <th>Độc giả</th>
                        <th>Sách</th>
                        <th>Hạn trả</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recentLoans.map((loan) => (
                        <tr key={loan.id}>
                          <td>#{loan.id}</td>
                          <td>{loan.readerName}</td>
                          <td>{loan.bookTitle}</td>
                          <td>{loan.dueDate}</td>
                          <td>
                            <span className={
                              loan.status === "borrowed"
                                ? "badge bg-success"
                                : loan.status === "overdue"
                                ? "badge bg-danger"
                                : "badge bg-secondary"
                            }>
                              {getStatusLabel(loan.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card shadow-sm mb-3">
            <div className="card-body">
              <h5 className="card-title">Sắp đến hạn</h5>

              {summary.dueSoonLoans.length === 0 ? (
                <div className="text-muted">Không có phiếu mượn sắp đến hạn.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Độc giả</th>
                        <th>Sách</th>
                        <th>Hạn trả</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.dueSoonLoans.map((loan) => (
                        <tr key={loan.id}>
                          <td>{loan.readerName}</td>
                          <td>{loan.bookTitle}</td>
                          <td>
                            <div>{loan.dueDate}</div>
                            <span className="badge bg-warning text-dark">{getDueSoonLabel(loan.dueDate)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="card-title">Sách sắp hết</h5>

              {summary.lowStockBooks.length === 0 ? (
                <div className="text-muted">Không có sách sắp hết.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Sách</th>
                        <th>Còn</th>
                        <th>Tổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.lowStockBooks.map((book) => (
                        <tr key={book.id}>
                          <td>{book.title}</td>
                          <td>
                            <span className={book.availableQuantity === 0 ? "badge bg-danger" : "badge bg-secondary"}>
                              {book.availableQuantity}
                            </span>
                          </td>
                          <td>{book.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="card-title">Sách được mượn nhiều</h5>

              {summary.popularBooks.length === 0 ? (
                <div className="text-muted">Chưa có dữ liệu mượn sách.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Sách</th>
                        <th>Tác giả</th>
                        <th>Lượt mượn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.popularBooks.map((book) => (
                        <tr key={book.id}>
                          <td>{book.title}</td>
                          <td>{book.author}</td>
                          <td>{book.borrowedCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Book Modal */}
      {showBookModal && (
        <div className="modal fade show d-block" tabIndex={-1} role="dialog">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Thêm sách mới</h5>
                <button type="button" className="btn-close" onClick={closeBookModal}></button>
              </div>
              <form onSubmit={submitBook}>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <div className="mb-2">
                        <label className="form-label">Tên sách</label>
                        <input name="title" className="form-control" value={bookForm.title} onChange={handleBookChange} required />
                      </div>
                      <div className="mb-2">
                        <label className="form-label">Tác giả</label>
                        <input name="author" className="form-control" value={bookForm.author} onChange={handleBookChange} required />
                      </div>
                      <div className="mb-2">
                        <label className="form-label">Thể loại</label>
                        <input name="category" className="form-control" value={bookForm.category} onChange={handleBookChange} required />
                      </div>
                      <div className="mb-2">
                        <label className="form-label">Số lượng</label>
                        <input name="quantity" type="number" min="0" className="form-control" value={bookForm.quantity} onChange={handleBookChange} required />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="mb-2">
                        <label className="form-label">Ảnh URL</label>
                        <input name="imageUrl" type="url" className="form-control" value={bookForm.imageUrl} onChange={handleBookChange} />
                      </div>
                      <div className="mb-2">
                        <label className="form-label">Nhà xuất bản</label>
                        <input name="publisher" className="form-control" value={bookForm.publisher} onChange={handleBookChange} />
                      </div>
                      <div className="mb-2">
                        <label className="form-label">Vị trí kệ</label>
                        <input name="shelfLocation" className="form-control" value={bookForm.shelfLocation} onChange={handleBookChange} />
                      </div>
                      <div className="mb-2">
                        <label className="form-label">Năm</label>
                        <input name="year" type="number" className="form-control" value={bookForm.year} onChange={handleBookChange} />
                      </div>
                    </div>
                    <div className="col-12">
                      <label className="form-label">Mô tả</label>
                      <textarea name="description" className="form-control" rows={3} value={bookForm.description} onChange={handleBookChange} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeBookModal}>Hủy</button>
                  <button type="submit" className="btn btn-primary">Lưu sách</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reader Modal */}
      {showReaderModal && (
        <div className="modal fade show d-block" tabIndex={-1} role="dialog">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Thêm độc giả</h5>
                <button type="button" className="btn-close" onClick={closeReaderModal}></button>
              </div>
              <form onSubmit={submitReader}>
                <div className="modal-body">
                  <div className="mb-2">
                    <label className="form-label">Họ và tên</label>
                    <input name="name" className="form-control" value={readerForm.name} onChange={handleReaderChange} required />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Email</label>
                    <input name="email" type="email" className="form-control" value={readerForm.email} onChange={handleReaderChange} required />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Số điện thoại</label>
                    <input name="phone" className="form-control" value={readerForm.phone} onChange={handleReaderChange} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeReaderModal}>Hủy</button>
                  <button type="submit" className="btn btn-primary">Lưu độc giả</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="modal fade show d-block" tabIndex={-1} role="dialog">
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Nhập nhiều sách</h5>
                <button type="button" className="btn-close" onClick={closeBulkModal}></button>
              </div>
              <form onSubmit={submitBulkBooks}>
                <div className="modal-body">
                  <p>Nhập dữ liệu sách theo dạng JSON array hoặc tải lên file CSV/JSON.</p>
                  <div className="mb-3">
                    <label className="form-label">Tải file CSV/JSON</label>
                    <input type="file" accept=".json,.csv,.xlsx" className="form-control" onChange={handleBulkFileChange} />
                    {bulkFileName && <div className="form-text">Đã chọn: {bulkFileName}</div>}
                  </div>
                  <div className="mb-2 d-flex gap-2 align-items-center">
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={downloadCsvTemplate}>
                      Tải file mẫu CSV
                    </button>
                    <span className="text-muted">Hoặc dán JSON vào ô phía dưới.</span>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Dữ liệu JSON</label>
                    <textarea
                      className="form-control"
                      rows={10}
                      value={bulkInput}
                      onChange={handleBulkInputChange}
                      placeholder='[{
  "title": "Clean Code",
  "author": "Robert C. Martin",
  "category": "Lập trình",
  "quantity": 5
}]'
                    />
                  </div>
                  {bulkError && <div className="alert alert-danger">{bulkError}</div>}
                  {bulkRowErrors.length > 0 && (
                    <div className="alert alert-warning">
                      <strong>Kiểm tra dữ liệu:</strong>
                      <ul className="mb-0">
                        {bulkRowErrors
                          .filter((row) => row.errors.length > 0)
                          .map((row) => (
                            <li key={row.index}>
                              Dòng {row.index + 1}: {row.errors.join("; ")}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {bulkPreviewRows.length > 0 && (
                    <div className="table-responsive">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Tên sách</th>
                            <th>Tác giả</th>
                            <th>Thể loại</th>
                            <th>Số lượng</th>
                            <th>Nhà xuất bản</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkPreviewRows.slice(0, 10).map((book, index) => (
                            <tr key={index}>
                              <td>{index + 1}</td>
                              <td>{book.title || "-"}</td>
                              <td>{book.author || "-"}</td>
                              <td>{book.category || "-"}</td>
                              <td>{book.quantity ?? "-"}</td>
                              <td>{book.publisher || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {bulkPreviewRows.length > 10 && (
                        <div className="text-muted">Hiển thị 10 dòng đầu tiên trong tổng số {bulkPreviewRows.length} dòng.</div>
                      )}
                    </div>
                  )}

                  <div className="alert alert-light">
                    <strong>Hướng dẫn CSV:</strong> hàng đầu là header. Các trường hỗ trợ: <code>title,author,category,publisher,year,quantity,shelfLocation,description,imageUrl</code>.
                  </div>
                  {bulkError && <div className="alert alert-danger">{bulkError}</div>}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeBulkModal}>
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={bulkImporting}>
                    {bulkImporting ? "Đang nhập..." : "Nhập sách"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

import { useEffect, useMemo, useRef, useState } from "react";
import { utils, writeFile } from "xlsx";
import BookTable from "../components/BookTable";
import {
  createReadersBulk,
  createReader,
  deleteReader,
  getBooks,
  getLoans,
  getReaderLoans,
  getReaders,
  updateReaderAccountStatus,
  updateReader,
} from "../services/api";

function getStatusLabel(status) {
  if (status === "borrowed") return "Đang mượn";
  if (status === "overdue") return "Quá hạn";
  if (status === "returned") return "Đã trả";
  return status;
}

const formatCurrency = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);

function quoteCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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

function exportReadersAsJson(readers) {
  downloadFile(JSON.stringify(readers, null, 2), "readers.json", "application/json");
}

function exportReadersAsCsv(readers) {
  const headers = ["id", "name", "email", "phone", "booksBorrowed", "accountStatus"];
  const rows = readers.map((reader) => [
    reader.id,
    reader.name,
    reader.email,
    reader.phone,
    reader.booksBorrowed ?? 0,
    reader.accountStatus || "active",
  ]);
  const csv = [headers.join(","),
    ...rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  downloadFile(csv, "readers.csv", "text/csv;charset=utf-8;");
}

function exportReadersAsXlsx(readers) {
  const rows = readers.map((reader) => ({
    "Mã": reader.id,
    "Họ tên": reader.name,
    "Email": reader.email,
    "Điện thoại": reader.phone,
    "Sách đang mượn": reader.booksBorrowed ?? 0,
    "Tài khoản": reader.hasAccount ? (reader.accountStatus === "locked" ? "Đã khóa" : "Hoạt động") : "Chưa có",
  }));
  const workbook = utils.book_new();
  const worksheet = utils.json_to_sheet(rows);
  utils.book_append_sheet(workbook, worksheet, "Doc gia");
  writeFile(workbook, "readers.xlsx");
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
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

function parseCsvToReaders(csvText) {
  const rows = csvText
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (rows.length < 2) {
    throw new Error("CSV phải có header và ít nhất một dòng dữ liệu.");
  }

  const headers = splitCsvLine(rows[0]).map((header) => header.trim().toLowerCase());
  return rows.slice(1).map((line) => {
    const values = splitCsvLine(line).map((value) => value.trim());
    const reader = {};
    headers.forEach((key, index) => {
      reader[key] = values[index] ?? "";
    });
    return {
      name: reader.name || reader.fullname || reader["họ tên"] || "",
      email: reader.email || "",
      phone: reader.phone || reader["điện thoại"] || "",
    };
  });
}

function validateReaderRows(rows) {
  return rows.map((reader, index) => {
    const errors = [];
    if (!String(reader.name || "").trim()) errors.push("Thiếu tên.");
    if (!String(reader.email || "").includes("@")) errors.push("Email không hợp lệ.");
    return { index, reader, errors };
  });
}

function exportReaderLoansAsJson(reader, loans) {
  downloadFile(
    JSON.stringify(loans, null, 2),
    `reader-${reader.id}-loans.json`,
    "application/json"
  );
}

function exportReaderLoansAsCsv(reader, loans) {
  const headers = [
    "id",
    "bookTitle",
    "borrowedDate",
    "dueDate",
    "returnedDate",
    "status",
    "lateDays",
    "fineAmount",
  ];
  const rows = loans.map((loan) =>
    headers.map((key) => quoteCsvValue(loan[key] ?? "")).join(",")
  );
  downloadFile(
    [headers.join(","), ...rows].join("\n"),
    `reader-${reader.id}-loans.csv`,
    "text/csv;charset=utf-8;"
  );
}

function Readers({ onNavigateToCreate, onEditBook, onDeleteBook }) {
  const [readers, setReaders] = useState([]);
  const [books, setBooks] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loadingReaders, setLoadingReaders] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [errorReaders, setErrorReaders] = useState("");
  const [errorBooks, setErrorBooks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingReaderId, setEditingReaderId] = useState(null);
  const [selectedReader, setSelectedReader] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [readerLoans, setReaderLoans] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingHistoryReaderId, setLoadingHistoryReaderId] = useState(null);
  const [historyError, setHistoryError] = useState("");
  const historyPanelRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [borrowFilter, setBorrowFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("");
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkRowErrors, setBulkRowErrors] = useState([]);
  const [bulkError, setBulkError] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [readerNotes, setReaderNotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("readerNotes") || "{}");
    } catch {
      return {};
    }
  });
  const [readerForm, setReaderForm] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const loadData = async () => {
    setLoadingReaders(true);
    setErrorReaders("");
    setLoadingBooks(true);
    setErrorBooks("");

    try {
      const [readerData, bookData, loanData] = await Promise.all([getReaders(), getBooks(), getLoans()]);
      setReaders(readerData);
      setBooks(bookData);
      setLoans(loanData);
    } catch (err) {
      const message = err.message || "Không thể tải dữ liệu.";
      setErrorReaders(message);
      setErrorBooks(message);
    } finally {
      setLoadingReaders(false);
      setLoadingBooks(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredReaders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return readers.filter((reader) => {
      const borrowedCount = Number(reader.booksBorrowed || 0);
      const readerLoans = loans.filter((loan) => loan.readerId === reader.id);
      const hasOverdue = readerLoans.some((loan) => loan.status === "overdue");
      const hasFine = readerLoans.some((loan) => Number(loan.fineAmount || 0) > 0);
      const matchesAccountFilter =
        !accountFilter ||
        (accountFilter === "active" && reader.hasAccount && reader.accountStatus !== "locked") ||
        (accountFilter === "locked" && reader.accountStatus === "locked") ||
        (accountFilter === "no-account" && !reader.hasAccount);
      const matchesBorrowFilter =
        !borrowFilter ||
        (borrowFilter === "active" && borrowedCount > 0) ||
        (borrowFilter === "inactive" && borrowedCount === 0) ||
        (borrowFilter === "overdue" && hasOverdue) ||
        (borrowFilter === "has-fine" && hasFine);
      const matchesQuery =
        !query ||
        [reader.name, reader.email, reader.phone, String(reader.id)].some((value) =>
          String(value || "").toLowerCase().includes(query)
        );

      return matchesBorrowFilter && matchesAccountFilter && matchesQuery;
    });
  }, [readers, loans, searchQuery, borrowFilter, accountFilter]);

  const readerSummary = useMemo(
    () => ({
      total: readers.length,
      active: readers.filter((reader) => Number(reader.booksBorrowed || 0) > 0).length,
      inactive: readers.filter((reader) => Number(reader.booksBorrowed || 0) === 0).length,
      overdue: readers.filter((reader) =>
        loans.some((loan) => loan.readerId === reader.id && loan.status === "overdue")
      ).length,
      locked: readers.filter((reader) => reader.accountStatus === "locked").length,
      noAccount: readers.filter((reader) => !reader.hasAccount).length,
      totalFines: loans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
    }),
    [readers, loans]
  );

  const readerRiskById = useMemo(
    () =>
      loans.reduce((result, loan) => {
        const current = result[loan.readerId] || {
          overdue: 0,
          active: 0,
          totalFines: 0,
        };

        if (loan.status !== "returned") current.active += 1;
        if (loan.status === "overdue") current.overdue += 1;
        current.totalFines += Number(loan.fineAmount || 0);
        result[loan.readerId] = current;
        return result;
      }, {}),
    [loans]
  );

  const filteredReaderLoans = useMemo(
    () =>
      historyStatusFilter
        ? readerLoans.filter((loan) => loan.status === historyStatusFilter)
        : readerLoans,
    [readerLoans, historyStatusFilter]
  );

  const selectedReaderSummary = useMemo(
    () => ({
      total: readerLoans.length,
      borrowed: readerLoans.filter((loan) => loan.status === "borrowed").length,
      overdue: readerLoans.filter((loan) => loan.status === "overdue").length,
      returned: readerLoans.filter((loan) => loan.status === "returned").length,
      totalFines: readerLoans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
    }),
    [readerLoans]
  );

  const selectedReaderRisk = selectedReader ? readerRiskById[selectedReader.id] || {} : {};

  const updateReaderNote = (readerId, note) => {
    setReaderNotes((current) => {
      const next = { ...current, [readerId]: note };
      localStorage.setItem("readerNotes", JSON.stringify(next));
      return next;
    });
  };

  const resetReaderForm = () => {
    setEditingReaderId(null);
    setReaderForm({
      name: "",
      email: "",
      phone: "",
    });
  };

  const handleReaderChange = (event) => {
    const { name, value } = event.target;
    setReaderForm((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleEditReader = (reader) => {
    setEditingReaderId(reader.id);
    setReaderForm({
      name: reader.name || "",
      email: reader.email || "",
      phone: reader.phone || "",
    });
  };

  const handleSaveReader = async (event) => {
    event.preventDefault();
    setErrorReaders("");

    if (!readerForm.name || !readerForm.email) {
      setErrorReaders("Vui lòng nhập họ tên và email độc giả.");
      return;
    }

    setSubmitting(true);

    try {
      if (editingReaderId) {
        await updateReader(editingReaderId, readerForm);
      } else {
        await createReader(readerForm);
      }

      resetReaderForm();
      await loadData();
    } catch (err) {
      setErrorReaders(err.message || "Không thể lưu độc giả.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewHistory = async (reader) => {
    setSelectedReader(reader);
    setReaderLoans([]);
    setHistoryStatusFilter("");
    setHistoryError("");
    setLoadingHistory(true);
    setLoadingHistoryReaderId(reader.id);

    try {
      const loans = await getReaderLoans(reader.id);
      setReaderLoans(loans);
      window.setTimeout(() => {
        historyPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } catch (err) {
      setHistoryError(err.message || "Không thể tải lịch sử mượn.");
    } finally {
      setLoadingHistory(false);
      setLoadingHistoryReaderId(null);
    }
  };

  const handleDeleteReader = async (reader) => {
    if (!reader?.id) {
      setErrorReaders("Không xác định được mã độc giả cần xóa.");
      return;
    }

    setDeleteTarget(reader);
  };

  const confirmDeleteReader = async () => {
    if (!deleteTarget?.id) return;

    setSubmitting(true);
    setErrorReaders("");

    try {
      await deleteReader(deleteTarget.id);
      if (editingReaderId === deleteTarget.id) {
        resetReaderForm();
      }
      if (selectedReader?.id === deleteTarget.id) {
        setSelectedReader(null);
        setReaderLoans([]);
        setHistoryStatusFilter("");
      }
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setErrorReaders(err.message || "Không thể xóa độc giả.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkFileName(file.name);
    setBulkError("");

    try {
      const content = await file.text();
      let rows = [];

      if (file.name.toLowerCase().endsWith(".json")) {
        rows = JSON.parse(content);
      } else if (file.name.toLowerCase().endsWith(".csv")) {
        rows = parseCsvToReaders(content);
      } else {
        throw new Error("Chỉ hỗ trợ file CSV hoặc JSON.");
      }

      if (!Array.isArray(rows)) {
        throw new Error("Dữ liệu phải là mảng độc giả.");
      }

      setBulkRows(rows);
      setBulkInput(JSON.stringify(rows, null, 2));
      setBulkRowErrors(validateReaderRows(rows));
    } catch (err) {
      setBulkRows([]);
      setBulkRowErrors([]);
      setBulkError(err.message || "Không thể đọc file.");
    }
  };

  const handleBulkInputChange = (event) => {
    const value = event.target.value;
    setBulkInput(value);
    setBulkFileName("");
    setBulkError("");

    try {
      const rows = JSON.parse(value);
      if (!Array.isArray(rows)) throw new Error("Dữ liệu phải là mảng độc giả.");
      setBulkRows(rows);
      setBulkRowErrors(validateReaderRows(rows));
    } catch {
      setBulkRows([]);
      setBulkRowErrors([]);
    }
  };

  const submitBulkReaders = async (event) => {
    event.preventDefault();

    const invalidRows = bulkRowErrors.filter((row) => row.errors.length > 0);
    if (bulkRows.length === 0) {
      setBulkError("Vui lòng nhập JSON hoặc tải file CSV/JSON.");
      return;
    }
    if (invalidRows.length > 0) {
      setBulkError("Vui lòng sửa lỗi dữ liệu trước khi nhập.");
      return;
    }

    setSubmitting(true);
    setBulkError("");

    try {
      await createReadersBulk(bulkRows);
      setShowBulkModal(false);
      setBulkInput("");
      setBulkRows([]);
      setBulkRowErrors([]);
      await loadData();
      window.alert(`Đã nhập ${bulkRows.length} độc giả.`);
    } catch (err) {
      setBulkError(err.message || "Không thể nhập độc giả.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReaderAccount = async (reader) => {
    if (!reader.hasAccount) {
      setErrorReaders("Độc giả này chưa có tài khoản đăng nhập để khóa/mở.");
      return;
    }

    setSubmitting(true);
    setErrorReaders("");

    try {
      const nextStatus = reader.accountStatus === "locked" ? "active" : "locked";
      await updateReaderAccountStatus(reader.id, nextStatus);
      await loadData();
    } catch (err) {
      setErrorReaders(err.message || "Không thể cập nhật trạng thái tài khoản.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell readers-page">
      <div className="page-title row-between">
        <div>
          <h2>Độc giả</h2>
          <p>Quản lý hồ sơ độc giả, thông tin liên hệ và số sách đang mượn.</p>
        </div>

        <div className="button-group">
          <button className="secondary-button" type="button" onClick={() => exportReadersAsJson(readers)}>
            Xuất JSON
          </button>
          <button className="secondary-button" type="button" onClick={() => exportReadersAsXlsx(filteredReaders)}>
            Xuất Excel
          </button>
          <button className="secondary-button" type="button" onClick={() => exportReadersAsCsv(readers)}>
            Xuất CSV
          </button>
          <button className="secondary-button" type="button" onClick={() => setShowBulkModal(true)}>
            Nhập độc giả
          </button>
          <button className="primary-button" type="button" onClick={() => onNavigateToCreate?.("readers")}>
            Thêm độc giả
          </button>
        </div>
      </div>

      {errorReaders && <div className="error-message">{errorReaders}</div>}

      <form className="form-card" onSubmit={handleSaveReader}>
        <h3>{editingReaderId ? "Cập nhật độc giả" : "Thêm độc giả mới"}</h3>
        <div className="form-grid">
          <div className="form-group">
            <label>Họ tên</label>
            <input
              type="text"
              name="name"
              placeholder="Nguyễn Văn A"
              value={readerForm.name}
              onChange={handleReaderChange}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="reader@example.com"
              value={readerForm.email}
              onChange={handleReaderChange}
            />
          </div>

          <div className="form-group">
            <label>Điện thoại</label>
            <input
              type="tel"
              name="phone"
              placeholder="0901000000"
              value={readerForm.phone}
              onChange={handleReaderChange}
            />
          </div>
        </div>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting
              ? "Đang lưu..."
              : editingReaderId
              ? "Cập nhật độc giả"
              : "Lưu độc giả"}
          </button>

          {editingReaderId && (
            <button className="secondary-button" type="button" onClick={resetReaderForm}>
              Hủy chỉnh sửa
            </button>
          )}
        </div>
      </form>

      {loadingReaders ? (
        <div className="empty-state" style={{ marginTop: 24 }}>
          Đang tải danh sách độc giả...
        </div>
      ) : (
        <div className="table-card" style={{ marginTop: 24 }}>
          <div className="table-card-header row-between">
            <h3>Danh sách độc giả</h3>
            <div className="loan-summary">
              <span>Tổng: {readerSummary.total}</span>
              <span>Đang mượn: {readerSummary.active}</span>
              <span>Có quá hạn: {readerSummary.overdue}</span>
              <span>Phạt dự kiến: {formatCurrency(readerSummary.totalFines)}</span>
              <span>Chưa mượn: {readerSummary.inactive}</span>
              <span>Tài khoản khóa: {readerSummary.locked}</span>
              <span>Chưa có tài khoản: {readerSummary.noAccount}</span>
            </div>
          </div>

          <div className="filters-row">
            <div className="search-bar">
              <label>Tìm kiếm</label>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Tìm theo mã, họ tên, email hoặc điện thoại"
              />
            </div>

            <div className="filter-group">
              <label>Tình trạng mượn</label>
              <select value={borrowFilter} onChange={(event) => setBorrowFilter(event.target.value)}>
                <option value="">Tất cả</option>
                <option value="active">Đang mượn sách</option>
                <option value="overdue">Có sách quá hạn</option>
                <option value="has-fine">Có tiền phạt</option>
                <option value="inactive">Chưa mượn sách</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Tài khoản</label>
              <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                <option value="">Tất cả</option>
                <option value="active">Đang hoạt động</option>
                <option value="locked">Đã khóa</option>
                <option value="no-account">Chưa có tài khoản</option>
              </select>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-sm">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Điện thoại</th>
                <th>Tài khoản</th>
                <th>Sách đang mượn</th>
                <th>Rủi ro</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredReaders.map((reader) => {
                const risk = readerRiskById[reader.id] || {};

                return (
                  <tr key={reader.id}>
                      <td>#{reader.id}</td>
                      <td>
                        <div className="reader-name-cell">
                          <strong>{reader.name}</strong>
                          {risk.overdue > 0 ? (
                            <span className="badge danger">Có quá hạn</span>
                          ) : Number(reader.booksBorrowed || 0) > 0 ? (
                            <span className="badge success">Đang mượn</span>
                          ) : (
                            <span className="badge">Chưa mượn</span>
                          )}
                        </div>
                      </td>
                      <td>{reader.email}</td>
                      <td>{reader.phone}</td>
                      <td>
                        {!reader.hasAccount ? (
                          <span className="badge">Chưa có</span>
                        ) : reader.accountStatus === "locked" ? (
                          <span className="badge danger">Đã khóa</span>
                        ) : (
                          <span className="badge success">Hoạt động</span>
                        )}
                      </td>
                      <td>
                        <div>{reader.booksBorrowed ?? 0}</div>
                        {risk.totalFines > 0 && (
                          <span className="reader-fine">{formatCurrency(risk.totalFines)}</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            risk.overdue > 0
                              ? "badge danger"
                              : risk.active >= 4
                              ? "badge warning"
                              : risk.active > 0
                              ? "badge success"
                              : "badge"
                          }
                        >
                          {risk.overdue > 0
                            ? "Cao"
                            : risk.active >= 4
                            ? "Cần theo dõi"
                            : risk.active > 0
                            ? "Ổn định"
                            : "Thấp"}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="small-button"
                            type="button"
                            onClick={() => handleViewHistory(reader)}
                            disabled={submitting || loadingHistoryReaderId === reader.id}
                          >
                            {loadingHistoryReaderId === reader.id ? "Đang tải..." : "Lịch sử"}
                          </button>
                          <button
                            className="small-button"
                            type="button"
                            onClick={() => handleEditReader(reader)}
                            disabled={submitting}
                          >
                            Sửa
                          </button>
                          {reader.hasAccount && (
                            <button
                              className="small-button"
                              type="button"
                              onClick={() => toggleReaderAccount(reader)}
                              disabled={submitting}
                            >
                              {reader.accountStatus === "locked" ? "Mở khóa" : "Khóa"}
                            </button>
                          )}
                          <button
                            className="small-button danger-button"
                            type="button"
                            onClick={() => handleDeleteReader(reader)}
                            disabled={submitting}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                  </tr>
                );
              })}

              {filteredReaders.length === 0 && (
                <tr>
                  <td colSpan="8" className="empty-table">
                    Không tìm thấy độc giả phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedReader && (
        <div className="table-card" style={{ marginTop: 24 }} ref={historyPanelRef}>
          <div className="table-card-header row-between">
            <h3>Lịch sử mượn của {selectedReader.name}</h3>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSelectedReader(null);
                setReaderLoans([]);
                setHistoryStatusFilter("");
                setHistoryError("");
              }}
            >
              Đóng
            </button>
          </div>

          <div className="reader-detail-panel">
            <div>
              <span>Hồ sơ</span>
              <strong>{selectedReader.email}</strong>
              <small>{selectedReader.phone || "Chưa có số điện thoại"}</small>
            </div>
            <div>
              <span>Trạng thái tài khoản</span>
              <strong>{selectedReaderRisk.overdue > 0 ? "Tạm khóa mượn" : "Bình thường"}</strong>
              <small>
                {selectedReaderRisk.overdue > 0
                  ? "Cần xử lý phiếu quá hạn trước khi mượn tiếp."
                  : "Có thể tiếp tục mượn theo giới hạn hệ thống."}
              </small>
            </div>
            <div className="reader-note-box">
              <label>Ghi chú nội bộ</label>
              <textarea
                value={readerNotes[selectedReader.id] || ""}
                onChange={(event) => updateReaderNote(selectedReader.id, event.target.value)}
                placeholder="Nhập ghi chú chăm sóc độc giả, lịch hẹn hoặc nhắc nhở..."
              />
            </div>
          </div>

          {historyError && <div className="error-message">{historyError}</div>}

          {loadingHistory ? (
            <div className="empty-state">Đang tải lịch sử mượn...</div>
          ) : readerLoans.length === 0 ? (
            <div className="empty-state">Độc giả này chưa có phiếu mượn nào.</div>
          ) : (
            <>
              <div className="loan-summary" style={{ marginBottom: 16 }}>
                <span>Tổng phiếu: {selectedReaderSummary.total}</span>
                <span>Đang mượn: {selectedReaderSummary.borrowed}</span>
                <span>Quá hạn: {selectedReaderSummary.overdue}</span>
                <span>Đã trả: {selectedReaderSummary.returned}</span>
                <span>Phạt dự kiến: {formatCurrency(selectedReaderSummary.totalFines)}</span>
              </div>

              <div className="filters-row">
                <div className="filter-group">
                  <label>Lọc lịch sử</label>
                  <select
                    value={historyStatusFilter}
                    onChange={(event) => setHistoryStatusFilter(event.target.value)}
                  >
                    <option value="">Tất cả trạng thái</option>
                    <option value="borrowed">Đang mượn</option>
                    <option value="overdue">Quá hạn</option>
                    <option value="returned">Đã trả</option>
                  </select>
                </div>

                <div className="button-group">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => exportReaderLoansAsJson(selectedReader, filteredReaderLoans)}
                  >
                    Xuất lịch sử JSON
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => exportReaderLoansAsCsv(selectedReader, filteredReaderLoans)}
                  >
                    Xuất lịch sử CSV
                  </button>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th>Sách</th>
                      <th>Ngày mượn</th>
                      <th>Hạn trả</th>
                      <th>Ngày trả</th>
                      <th>Trễ</th>
                      <th>Phạt</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReaderLoans.map((loan) => (
                      <tr key={loan.id}>
                        <td>#{loan.id}</td>
                        <td>{loan.bookTitle}</td>
                        <td>{loan.borrowedDate}</td>
                        <td>{loan.dueDate}</td>
                        <td>{loan.returnedDate || "-"}</td>
                        <td>{loan.lateDays ? `${loan.lateDays} ngày` : "-"}</td>
                        <td>{loan.fineAmount ? formatCurrency(loan.fineAmount) : "-"}</td>
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
                            {getStatusLabel(loan.status)}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {filteredReaderLoans.length === 0 && (
                      <tr>
                        <td colSpan="8" className="empty-table">
                          Không có phiếu mượn phù hợp với bộ lọc.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <BookTable
        books={books}
        loading={loadingBooks}
        error={errorBooks}
        onEditBook={onEditBook}
        onDeleteBook={onDeleteBook}
      />

      {deleteTarget && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true">
          <div className="app-modal">
            <h3>Xóa độc giả</h3>
            <p>Bạn có chắc muốn xóa độc giả "{deleteTarget.name}"?</p>
            <div className="modal-summary">
              <span>Email: <strong>{deleteTarget.email}</strong></span>
              <span>Sách đang mượn: <strong>{deleteTarget.booksBorrowed || 0}</strong></span>
            </div>
            <div className="form-actions">
              <button className="primary-button" type="button" onClick={confirmDeleteReader} disabled={submitting}>
                {submitting ? "Đang xóa..." : "Xác nhận xóa"}
              </button>
              <button className="secondary-button" type="button" onClick={() => setDeleteTarget(null)} disabled={submitting}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true">
          <form className="app-modal activity-modal" onSubmit={submitBulkReaders}>
            <h3>Nhập nhiều độc giả</h3>
            <p>Hỗ trợ CSV hoặc JSON với các trường: name, email, phone.</p>
            <div className="form-group">
              <label>File CSV/JSON</label>
              <input type="file" accept=".csv,.json" onChange={handleBulkFileChange} />
              {bulkFileName && <small>Đã chọn: {bulkFileName}</small>}
            </div>
            <div className="form-group">
              <label>Dữ liệu JSON</label>
              <textarea
                rows="7"
                value={bulkInput}
                onChange={handleBulkInputChange}
                placeholder='[{"name":"Nguyễn Văn A","email":"a@example.com","phone":"0901000000"}]'
              />
            </div>
            {bulkError && <div className="error-message">{bulkError}</div>}
            {bulkRowErrors.some((row) => row.errors.length > 0) && (
              <div className="error-message">
                {bulkRowErrors
                  .filter((row) => row.errors.length > 0)
                  .slice(0, 5)
                  .map((row) => `Dòng ${row.index + 1}: ${row.errors.join(", ")}`)
                  .join(" | ")}
              </div>
            )}
            {bulkRows.length > 0 && (
              <div className="modal-summary">
                <span>Số dòng hợp lệ: <strong>{bulkRows.length - bulkRowErrors.filter((row) => row.errors.length > 0).length}</strong></span>
                <span>Tổng dòng: <strong>{bulkRows.length}</strong></span>
              </div>
            )}
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={submitting || bulkRows.length === 0}>
                {submitting ? "Đang nhập..." : "Nhập độc giả"}
              </button>
              <button className="secondary-button" type="button" onClick={() => setShowBulkModal(false)} disabled={submitting}>
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Readers;

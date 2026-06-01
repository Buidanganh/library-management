import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { utils, writeFile } from "xlsx";
import { deleteActivities, getActivities } from "../services/api";

const typeLabels = {
  "book.created": "Thêm sách",
  "book.updated": "Cập nhật sách",
  "book.deleted": "Xóa sách",
  "book.bulk_created": "Nhập sách",
  "reader.created": "Thêm độc giả",
  "reader.updated": "Cập nhật độc giả",
  "reader.deleted": "Xóa độc giả",
  "reader.bulk_created": "Nhập độc giả",
  "reader.locked": "Khóa tài khoản",
  "reader.unlocked": "Mở tài khoản",
  "loan.created": "Mượn sách",
  "loan.extended": "Gia hạn",
  "loan.returned": "Trả sách",
  "loan.fine_updated": "Cập nhật phạt",
  "reservation.created": "Đặt trước",
  "reservation.updated": "Xử lý đặt trước",
  "review.created": "Đánh giá sách",
  "catalog.updated": "Danh mục",
  system: "Hệ thống",
};

const groupLabels = {
  all: "Tất cả",
  book: "Sách",
  reader: "Độc giả",
  loan: "Mượn / trả",
  system: "Hệ thống",
};

function getActivityGroup(type = "") {
  if (type.startsWith("book.")) return "book";
  if (type.startsWith("reader.")) return "reader";
  if (type.startsWith("loan.")) return "loan";
  if (type.startsWith("reservation.")) return "loan";
  if (type.startsWith("review.")) return "book";
  if (type.startsWith("catalog.")) return "book";
  return "system";
}

function getTypeTone(type = "") {
  if (type.includes("deleted")) return "danger";
  if (type.includes("loan")) return "warning";
  if (type.includes("created") || type.includes("bulk")) return "success";
  return "";
}

function formatDateTime(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getDateInputValue(value) {
  if (!value) return "";
  return new Date(value).toISOString().split("T")[0];
}

function getActivityMessage(activity) {
  const metadata = activity.metadata || {};

  switch (activity.type) {
    case "book.created":
      return `Thêm sách mới: ${metadata.title || activity.message}`;
    case "book.updated":
      return `Cập nhật sách: ${metadata.title || activity.message}`;
    case "book.deleted":
      return `Xóa sách: ${metadata.title || activity.message}`;
    case "book.bulk_created":
      return `Nhập nhanh ${metadata.count || 0} sách vào thư viện.`;
    case "reader.created":
      return metadata.email
        ? `Thêm độc giả mới: ${metadata.email}`
        : activity.message;
    case "reader.updated":
      return metadata.email
        ? `Cập nhật hồ sơ độc giả: ${metadata.email}`
        : activity.message;
    case "reader.deleted":
      return metadata.email
        ? `Xóa hồ sơ độc giả: ${metadata.email}`
        : activity.message;
    case "reader.bulk_created":
      return `Nhập nhanh ${metadata.count || 0} độc giả vào thư viện.`;
    case "reader.locked":
      return `Khóa tài khoản độc giả: ${metadata.readerName || metadata.email || activity.message}.`;
    case "reader.unlocked":
      return `Mở tài khoản độc giả: ${metadata.readerName || metadata.email || activity.message}.`;
    case "loan.created":
      return `Tạo phiếu mượn #${metadata.loanId || activity.id}.`;
    case "loan.extended":
      return `Gia hạn phiếu #${metadata.loanId || activity.id} đến ${metadata.dueDate || "-"}.`;
    case "loan.returned":
      return `Trả sách cho phiếu #${metadata.loanId || activity.id}.`;
    case "loan.fine_updated":
      return `Cập nhật tiền phạt phiếu #${metadata.loanId || activity.id}: ${metadata.fineStatus || "-"}.`;
    case "reservation.created":
      return `Đặt trước sách: ${metadata.bookTitle || activity.message}.`;
    case "reservation.updated":
      return `Cập nhật đặt trước #${metadata.reservationId || activity.id}: ${metadata.status || "-"}.`;
    case "review.created":
      return `Đánh giá sách ${metadata.bookTitle || ""}: ${metadata.rating || "-"} sao.`;
    case "catalog.updated":
      return `Cập nhật danh mục: ${metadata.name || activity.message}.`;
    default:
      return activity.message || "Hoạt động hệ thống";
  }
}

function getActivityTarget(activity) {
  const metadata = activity.metadata || {};

  return (
    metadata.bookTitle ||
    metadata.title ||
    metadata.readerName ||
    metadata.email ||
    (metadata.loanId ? `Phiếu #${metadata.loanId}` : "")
  );
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

function quoteCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function exportActivitiesCsv(activities) {
  const headers = ["id", "type", "message", "target", "actor", "createdAt"];
  const rows = activities.map((activity) =>
    [
      activity.id,
      typeLabels[activity.type] || activity.type,
      getActivityMessage(activity),
      getActivityTarget(activity),
      activity.actor,
      activity.createdAt,
    ]
      .map(quoteCsvValue)
      .join(",")
  );
  downloadFile([headers.join(","), ...rows].join("\n"), "activity-log.csv", "text/csv;charset=utf-8;");
}

function exportActivitiesJson(activities) {
  downloadFile(JSON.stringify(activities, null, 2), "activity-log.json", "application/json");
}

function exportActivitiesXlsx(activities) {
  const rows = activities.map((activity) => ({
    "Mã": activity.id,
    "Loại": typeLabels[activity.type] || activity.type,
    "Nội dung": getActivityMessage(activity),
    "Đối tượng": getActivityTarget(activity),
    "Người thực hiện": activity.actor,
    "Thời gian": activity.createdAt,
  }));
  const workbook = utils.book_new();
  const worksheet = utils.json_to_sheet(rows);
  utils.book_append_sheet(workbook, worksheet, "Nhat ky");
  writeFile(workbook, "activity-log.xlsx");
}

function ActivityLog() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [cleanupModal, setCleanupModal] = useState(false);
  const [cleanupOlderThan, setCleanupOlderThan] = useState("");
  const [cleaning, setCleaning] = useState(false);

  const loadActivities = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getActivities();
      setActivities(data);
    } catch (err) {
      setError(err.message || "Không thể tải nhật ký hoạt động.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, []);

  const types = useMemo(
    () =>
      Array.from(new Set(activities.map((activity) => activity.type).filter(Boolean))).sort(
        (first, second) => (typeLabels[first] || first).localeCompare(typeLabels[second] || second, "vi")
      ),
    [activities]
  );

  const actors = useMemo(
    () => Array.from(new Set(activities.map((activity) => activity.actor).filter(Boolean))).sort(),
    [activities]
  );

  const groupCounts = useMemo(
    () =>
      activities.reduce(
        (counts, activity) => {
          const group = getActivityGroup(activity.type);
          counts.all += 1;
          counts[group] = (counts[group] || 0) + 1;
          return counts;
        },
        { all: 0, book: 0, reader: 0, loan: 0, system: 0 }
      ),
    [activities]
  );

  const filteredActivities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    return activities.filter((activity) => {
      const createdAt = new Date(activity.createdAt);
      const message = getActivityMessage(activity);
      const target = getActivityTarget(activity);
      const group = getActivityGroup(activity.type);
      const matchesGroup = groupFilter === "all" || group === groupFilter;
      const matchesType = !typeFilter || activity.type === typeFilter;
      const matchesActor = !actorFilter || activity.actor === actorFilter;
      const matchesDate =
        (!from || createdAt >= from) &&
        (!to || createdAt <= to);
      const matchesQuery =
        !query ||
        [message, target, activity.actor, activity.type, String(activity.id)].some((value) =>
          String(value || "").toLowerCase().includes(query)
        );

      return matchesGroup && matchesType && matchesActor && matchesDate && matchesQuery;
    });
  }, [activities, searchQuery, groupFilter, typeFilter, actorFilter, fromDate, toDate]);

  const latestActivities = useMemo(() => filteredActivities.slice(0, 5), [filteredActivities]);
  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / pageSize));
  const pagedActivities = useMemo(
    () => filteredActivities.slice((page - 1) * pageSize, page * pageSize),
    [filteredActivities, page, pageSize]
  );
  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    groupFilter !== "all" ||
    Boolean(typeFilter) ||
    Boolean(actorFilter) ||
    Boolean(fromDate) ||
    Boolean(toDate);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, groupFilter, typeFilter, actorFilter, fromDate, toDate, pageSize]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const summary = useMemo(
    () => ({
      total: activities.length,
      displayed: filteredActivities.length,
      latest: activities[0],
      latestTime: activities[0] ? formatDateTime(activities[0].createdAt) : "-",
      actorCount: new Set(activities.map((activity) => activity.actor).filter(Boolean)).size,
    }),
    [activities, filteredActivities]
  );

  const resetFilters = () => {
    setSearchQuery("");
    setGroupFilter("all");
    setTypeFilter("");
    setActorFilter("");
    setFromDate("");
    setToDate("");
  };

  const handleCleanupActivities = async () => {
    setCleaning(true);
    setError("");

    try {
      const result = await deleteActivities(cleanupOlderThan || undefined);
      await loadActivities();
      setCleanupModal(false);
      setCleanupOlderThan("");
      window.alert(`Đã xóa ${result.deleted || 0} dòng nhật ký.`);
    } catch (err) {
      setError(err.message || "Không thể dọn nhật ký.");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="page-shell activity-page">
      <div className="page-title row-between page-hero activity-hero">
        <div>
          <span className="page-eyebrow">
            <Sparkles size={16} />
            Theo dõi vận hành
          </span>
          <h2>Nhật ký hoạt động</h2>
          <p>Theo dõi thao tác quản trị, mượn/trả sách và các thay đổi dữ liệu gần đây.</p>
          <div className="page-hero-meta">
            <span>{summary.total} hoạt động</span>
            <span>{summary.actorCount} người thực hiện</span>
            <span>Mới nhất: {summary.latestTime}</span>
          </div>
        </div>

        <div className="button-group page-hero-actions">
          <button className="secondary-button" type="button" onClick={loadActivities} disabled={loading}>
            <RefreshCw size={16} />
            <span>Làm mới</span>
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => exportActivitiesJson(filteredActivities)}
            disabled={filteredActivities.length === 0}
          >
            <FileJson size={16} />
            <span>Xuất JSON</span>
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => exportActivitiesXlsx(filteredActivities)}
            disabled={filteredActivities.length === 0}
          >
            <FileSpreadsheet size={16} />
            <span>Xuất Excel</span>
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => exportActivitiesCsv(filteredActivities)}
            disabled={filteredActivities.length === 0}
          >
            <Download size={16} />
            <span>Xuất CSV</span>
          </button>
          <button className="secondary-button danger-button" type="button" onClick={() => setCleanupModal(true)}>
            <Trash2 size={16} />
            <span>Dọn nhật ký</span>
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="activity-insights-grid">
        <div className="table-card">
          <div className="table-card-header row-between">
            <h3>Tổng hợp nhật ký</h3>
            <span className="badge">{summary.displayed}/{summary.total}</span>
          </div>
          <div className="activity-metric-grid">
            <span>
              <History size={18} />
              <strong>{summary.total}</strong>
              Tổng hoạt động
            </span>
            <span>
              <Users size={18} />
              <strong>{summary.actorCount}</strong>
              Người thực hiện
            </span>
            <span>
              <ShieldCheck size={18} />
              <strong>{summary.latestTime}</strong>
              Mới nhất
            </span>
          </div>
        </div>

        <div className="table-card">
          <div className="table-card-header row-between">
            <h3>Hoạt động mới nhất</h3>
          </div>
          {latestActivities.length === 0 ? (
            <div className="empty-state compact">Chưa có hoạt động phù hợp.</div>
          ) : (
            <div className="activity-timeline">
              {latestActivities.map((activity) => (
                <button
                  className="activity-timeline-item"
                  type="button"
                  key={activity.id}
                  onClick={() => setSelectedActivity(activity)}
                >
                  <span className={`activity-dot ${getTypeTone(activity.type)}`} />
                  <strong>{getActivityMessage(activity)}</strong>
                  <small>{activity.actor} - {formatDateTime(activity.createdAt)}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="table-card" style={{ marginTop: 24, marginBottom: 24 }}>
        <div className="quick-filter-strip">
          {Object.keys(groupLabels).map((group) => (
            <button
              className={`quick-filter-chip ${groupFilter === group ? "active" : ""}`}
              type="button"
              key={group}
              onClick={() => {
                setGroupFilter(group);
                setTypeFilter("");
              }}
            >
              {groupLabels[group]} ({groupCounts[group] || 0})
            </button>
          ))}
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
              placeholder="Tìm theo nội dung, đối tượng, người thực hiện hoặc mã nhật ký"
            />
          </div>

          <div className="filter-group">
            <label>Loại hoạt động</label>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">Tất cả</option>
              {types
                .filter((type) => groupFilter === "all" || getActivityGroup(type) === groupFilter)
                .map((type) => (
                  <option key={type} value={type}>
                    {typeLabels[type] || type}
                  </option>
                ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Người thực hiện</label>
            <select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
              <option value="">Tất cả</option>
              {actors.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Từ ngày</label>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              max={toDate || undefined}
            />
          </div>

          <div className="filter-group">
            <label>Đến ngày</label>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              min={fromDate || undefined}
            />
          </div>

          <div className="filter-group">
            <label>Bộ lọc</label>
            <button className="secondary-button" type="button" onClick={resetFilters} disabled={!hasActiveFilters}>
              Xóa bộ lọc
            </button>
          </div>

          <div className="filter-group">
            <label>Số dòng</label>
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="skeleton-panel">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <div className="table-card">
          <div className="table-responsive">
            <table className="table table-sm activity-table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Loại</th>
                  <th>Nội dung</th>
                  <th>Đối tượng</th>
                  <th>Người thực hiện</th>
                  <th>Thời gian</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {pagedActivities.map((activity) => (
                  <tr key={activity.id}>
                    <td>#{activity.id}</td>
                    <td>
                      <span className={`badge ${getTypeTone(activity.type)}`}>
                        {typeLabels[activity.type] || activity.type}
                      </span>
                    </td>
                    <td>
                      <strong className="activity-message">{getActivityMessage(activity)}</strong>
                    </td>
                    <td>{getActivityTarget(activity) || "-"}</td>
                    <td>{activity.actor}</td>
                    <td>{formatDateTime(activity.createdAt)}</td>
                    <td>
                      <button className="small-button" type="button" onClick={() => setSelectedActivity(activity)}>
                        Xem
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredActivities.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-table">
                      Chưa có hoạt động phù hợp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredActivities.length > 0 && (
            <div className="pagination-row">
              <span>
                Trang {page}/{totalPages} - {filteredActivities.length} dòng
              </span>
              <div className="action-buttons">
                <button
                  className="small-button"
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  Trước
                </button>
                <button
                  className="small-button"
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedActivity && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true">
          <div className="app-modal activity-modal">
            <h3>Chi tiết nhật ký #{selectedActivity.id}</h3>
            <p>{getActivityMessage(selectedActivity)}</p>
            <div className="modal-summary">
              <span>Loại: <strong>{typeLabels[selectedActivity.type] || selectedActivity.type}</strong></span>
              <span>Nhóm: <strong>{groupLabels[getActivityGroup(selectedActivity.type)]}</strong></span>
              <span>Người thực hiện: <strong>{selectedActivity.actor}</strong></span>
              <span>Thời gian: <strong>{formatDateTime(selectedActivity.createdAt)}</strong></span>
              <span>Ngày hệ thống: <strong>{getDateInputValue(selectedActivity.createdAt)}</strong></span>
            </div>

            <div className="activity-metadata-box">
              <strong>Metadata</strong>
              <pre>{JSON.stringify(selectedActivity.metadata || {}, null, 2)}</pre>
            </div>

            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={() => setSelectedActivity(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {cleanupModal && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true">
          <div className="app-modal">
            <h3>Dọn nhật ký</h3>
            <p>
              Chọn ngày để chỉ xóa các dòng cũ hơn ngày đó, hoặc để trống để xóa toàn bộ nhật ký hiện có.
            </p>
            <div className="form-group">
              <label>Xóa nhật ký cũ hơn ngày</label>
              <input
                type="date"
                value={cleanupOlderThan}
                onChange={(event) => setCleanupOlderThan(event.target.value)}
              />
            </div>
            <div className="form-actions">
              <button className="primary-button" type="button" onClick={handleCleanupActivities} disabled={cleaning}>
                {cleaning ? "Đang xóa..." : "Xác nhận dọn"}
              </button>
              <button className="secondary-button" type="button" onClick={() => setCleanupModal(false)} disabled={cleaning}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ActivityLog;

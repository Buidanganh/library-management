import { useEffect, useState } from "react";
import { BookOpen, Building2, LibraryBig, Plus, Sparkles, Tags } from "lucide-react";
import { createCatalogItem, deleteCatalogItem, getCatalog } from "../services/api";

const typeLabels = {
  categories: "Thể loại",
  publishers: "Nhà xuất bản",
};

function Catalog() {
  const [catalog, setCatalog] = useState({ categories: [], publishers: [] });
  const [formData, setFormData] = useState({ type: "categories", name: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadCatalog = async () => {
    setLoading(true);
    setError("");

    try {
      setCatalog(await getCatalog());
    } catch (err) {
      setError(err.message || "Không thể tải danh mục.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      await createCatalogItem({ type: formData.type, name: formData.name.trim() });
      setFormData((state) => ({ ...state, name: "" }));
      await loadCatalog();
    } catch (err) {
      setError(err.message || "Không thể thêm danh mục.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (type, name) => {
    const confirmed = window.confirm(`Xóa "${name}" khỏi danh mục ${typeLabels[type]}?`);
    if (!confirmed) return;

    setSubmitting(true);
    setError("");

    try {
      await deleteCatalogItem(type, name);
      await loadCatalog();
    } catch (err) {
      setError(err.message || "Không thể xóa danh mục.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell catalog-page">
      <div className="page-title row-between page-hero catalog-hero">
        <div>
          <span className="page-eyebrow">
            <Sparkles size={16} />
            Chuẩn hóa dữ liệu sách
          </span>
          <h2>Danh mục sách</h2>
          <p>Quản lý thể loại và nhà xuất bản để nhập sách thống nhất hơn.</p>
          <div className="page-hero-meta">
            <span>{catalog.categories.length} thể loại</span>
            <span>{catalog.publishers.length} nhà xuất bản</span>
            <span>{catalog.categories.length + catalog.publishers.length} mục danh mục</span>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="inventory-metric-grid catalog-metric-grid">
        <div className="inventory-metric-card primary">
          <span className="inventory-metric-icon"><LibraryBig size={20} /></span>
          <div>
            <span>Tổng danh mục</span>
            <strong>{catalog.categories.length + catalog.publishers.length}</strong>
            <small>Đang quản lý</small>
          </div>
        </div>
        <div className="inventory-metric-card success">
          <span className="inventory-metric-icon"><Tags size={20} /></span>
          <div>
            <span>Thể loại</span>
            <strong>{catalog.categories.length}</strong>
            <small>Phân nhóm nội dung</small>
          </div>
        </div>
        <div className="inventory-metric-card primary">
          <span className="inventory-metric-icon"><Building2 size={20} /></span>
          <div>
            <span>Nhà xuất bản</span>
            <strong>{catalog.publishers.length}</strong>
            <small>Nguồn phát hành</small>
          </div>
        </div>
        <div className="inventory-metric-card success">
          <span className="inventory-metric-icon"><BookOpen size={20} /></span>
          <div>
            <span>Trạng thái</span>
            <strong>{loading ? "..." : "Ổn định"}</strong>
            <small>Dữ liệu sẵn sàng</small>
          </div>
        </div>
      </div>

      <div className="form-card catalog-form-card" style={{ marginBottom: 24 }}>
        <h3>Thêm danh mục</h3>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Loại danh mục</label>
            <select value={formData.type} onChange={(event) => setFormData((state) => ({ ...state, type: event.target.value }))}>
              <option value="categories">Thể loại</option>
              <option value="publishers">Nhà xuất bản</option>
            </select>
          </div>
          <div className="form-group">
            <label>Tên</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData((state) => ({ ...state, name: event.target.value }))}
              placeholder="Nhập tên danh mục"
            />
          </div>
          <div className="form-group">
            <label>&nbsp;</label>
            <button className="primary-button" type="submit" disabled={submitting || !formData.name.trim()}>
              <Plus size={18} />
              <span>Thêm</span>
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="skeleton-panel">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <div className="catalog-grid">
          {["categories", "publishers"].map((type) => (
            <div className="table-card" key={type}>
              <div className="table-card-header row-between">
                <h3>{typeLabels[type]}</h3>
                <span className="badge">{catalog[type]?.length || 0} mục</span>
              </div>
              <div className="chip-list">
                {(catalog[type] || []).map((name) => (
                  <span className="managed-chip" key={name}>
                    {name}
                    <button type="button" onClick={() => handleDelete(type, name)} disabled={submitting}>
                      Xóa
                    </button>
                  </span>
                ))}
                {(catalog[type] || []).length === 0 && (
                  <div className="empty-state compact">Chưa có danh mục.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Catalog;

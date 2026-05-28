import { useEffect, useState } from "react";
import { getLoans, returnLoan } from "../services/api";

const formatCurrency = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);

function Overdue() {
  const [overdueItems, setOverdueItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadOverdue = async () => {
    setLoading(true);
    setError("");

    try {
      const allLoans = await getLoans();
      setOverdueItems(allLoans.filter((loan) => loan.status === "overdue"));
    } catch (err) {
      setError(err.message || "Không thể tải dữ liệu quá hạn.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverdue();
  }, []);

  const handleReturn = async (item) => {
    const confirmed = window.confirm(`Xác nhận trả sách "${item.bookTitle}"?`);
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await returnLoan(item.id);
      await loadOverdue();
    } catch (err) {
      setError(err.message || "Không thể trả sách.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-title">
        <h2>Sách quá hạn</h2>
        <p>Theo dõi phiếu mượn quá hạn, thông tin liên hệ và tiền phạt dự kiến.</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="empty-state">Đang tải dữ liệu quá hạn...</div>
      ) : overdueItems.length > 0 ? (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Độc giả</th>
                <th>Liên hệ</th>
                <th>Sách</th>
                <th>Hạn trả</th>
                <th>Trễ</th>
                <th>Phạt dự kiến</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {overdueItems.map((item) => (
                <tr key={item.id}>
                  <td>#{item.id}</td>
                  <td>{item.readerName}</td>
                  <td>
                    <div>{item.readerEmail || "-"}</div>
                    <div>{item.readerPhone || "-"}</div>
                  </td>
                  <td>{item.bookTitle}</td>
                  <td>{item.dueDate}</td>
                  <td>
                    <span className="badge danger">{item.lateDays ?? 0} ngày</span>
                  </td>
                  <td>{formatCurrency(item.fineAmount)}</td>
                  <td>
                    <button
                      className="small-button"
                      type="button"
                      onClick={() => handleReturn(item)}
                      disabled={submitting}
                    >
                      Trả sách
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">Chưa có dữ liệu sách quá hạn.</div>
      )}
    </div>
  );
}

export default Overdue;

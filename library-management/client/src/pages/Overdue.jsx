import { useEffect, useState } from "react";
import { getLoans } from "../services/api";

function Overdue() {
  const [overdueItems, setOverdueItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
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

    loadOverdue();
  }, []);

  return (
    <div>
      <div className="page-title">
        <h2>Sách quá hạn</h2>
        <p>Theo dõi các phiếu mượn chưa trả đúng hạn.</p>
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
                <th>Sách</th>
                <th>Hạn trả</th>
                <th>Trễ</th>
              </tr>
            </thead>
            <tbody>
              {overdueItems.map((item) => {
                const lateDays = Math.max(
                  0,
                  Math.ceil((new Date() - new Date(item.dueDate)) / (1000 * 60 * 60 * 24))
                );

                return (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td>{item.readerName}</td>
                    <td>{item.bookTitle}</td>
                    <td>{item.dueDate}</td>
                    <td>
                      <span className="badge danger">{lateDays} ngày</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          Chưa có dữ liệu sách quá hạn.
        </div>
      )}
    </div>
  );
}

export default Overdue;

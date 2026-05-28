import { useEffect, useState } from "react";
import { getStats } from "../services/api";

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

function Dashboard() {
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
      <div className="page-title">
        <h2>Tổng quan</h2>
        <p>Theo dõi nhanh hoạt động, tồn kho và tình trạng mượn trả của thư viện.</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="stats-grid dashboard-stats-grid">
        {stats.map((item) => (
          <div className="stat-card" key={item.label}>
            <p>{item.label}</p>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="table-card">
          <h3>Phiếu mượn gần đây</h3>
          {summary.recentLoans.length === 0 ? (
            <div className="empty-state">Chưa có phiếu mượn nào.</div>
          ) : (
            <table>
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
              </tbody>
            </table>
          )}
        </div>

        <div className="table-card">
          <h3>Sắp đến hạn</h3>
          {summary.dueSoonLoans.length === 0 ? (
            <div className="empty-state">Không có phiếu mượn sắp đến hạn.</div>
          ) : (
            <table>
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
                      <span className="badge warning">{getDueSoonLabel(loan.dueDate)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="table-card">
          <h3>Sách sắp hết</h3>
          {summary.lowStockBooks.length === 0 ? (
            <div className="empty-state">Không có sách sắp hết.</div>
          ) : (
            <table>
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
                      <span className={book.availableQuantity === 0 ? "badge danger" : "badge"}>
                        {book.availableQuantity}
                      </span>
                    </td>
                    <td>{book.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="table-card">
          <h3>Sách được mượn nhiều</h3>
          {summary.popularBooks.length === 0 ? (
            <div className="empty-state">Chưa có dữ liệu mượn sách.</div>
          ) : (
            <table>
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
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

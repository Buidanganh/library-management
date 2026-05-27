import { useEffect, useState } from "react";
import { getStats } from "../services/api";

function Dashboard() {
  const [stats, setStats] = useState([
    { label: "Tổng số sách", value: 0 },
    { label: "Độc giả", value: 0 },
    { label: "Đang mượn", value: 0 },
    { label: "Quá hạn", value: 0 },
  ]);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await getStats();
        setStats([
          { label: "Tổng số sách", value: data.totalBooks ?? 0 },
          { label: "Độc giả", value: data.readers ?? 0 },
          { label: "Đang mượn", value: data.borrowed ?? 0 },
          { label: "Quá hạn", value: data.overdue ?? 0 },
        ]);
      } catch (err) {
        setError(err.message || "Không thể tải thống kê.");
      }
    };

    loadStats();
  }, []);

  return (
    <div>
      <div className="page-title">
        <h2>Tổng quan</h2>
        <p>Theo dõi nhanh hoạt động của thư viện.</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="stats-grid">
        {stats.map((item) => (
          <div className="stat-card" key={item.label}>
            <p>{item.label}</p>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;

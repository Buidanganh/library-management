import { useState } from "react";
import { login } from "../services/api";

function Login({ onLogin, onNavigateRegister }) {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const fillDemoAccount = (account) => {
    setError("");
    setFormData(account);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!formData.email || !formData.password) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await login(formData);
      onLogin(user);
    } catch (err) {
      setError(err.message || "Email hoặc mật khẩu không đúng.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Đăng nhập</h1>
        <p>Đăng nhập vào hệ thống quản lý thư viện.</p>

        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            name="email"
            placeholder="admin@gmail.com"
            value={formData.email}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Mật khẩu</label>
          <input
            type="password"
            name="password"
            placeholder="123456"
            value={formData.password}
            onChange={handleChange}
          />
        </div>

        <button className="primary-button full-button" type="submit" disabled={submitting}>
          {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>

        <div className="demo-login-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => fillDemoAccount({ email: "admin@gmail.com", password: "123456" })}
          >
            Dùng tài khoản admin
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => fillDemoAccount({ email: "buidanganh@gmail.com", password: "123456" })}
          >
            Dùng tài khoản user
          </button>
        </div>

        <button className="link-button" type="button" onClick={onNavigateRegister}>
          Chưa có tài khoản? Đăng ký user
        </button>

        <div className="demo-account">
          Admin quản lý toàn bộ hệ thống. User tra cứu sách, mượn sách và xem phiếu mượn của mình.
        </div>
      </form>
    </div>
  );
}

export default Login;

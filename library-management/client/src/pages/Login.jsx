import { useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
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
      <section className="auth-shell">
        <aside className="auth-visual" aria-label="Giới thiệu hệ thống">
          <div className="auth-brand">
            <span className="auth-brand-mark">
              <BookOpen size={26} />
            </span>
            <div>
              <strong>LibManage</strong>
              <span>Library Control Center</span>
            </div>
          </div>

          <div className="auth-hero">
            <span className="auth-kicker">
              <Sparkles size={16} />
              Quản lý thư viện thông minh
            </span>
            <h1>Chào mừng trở lại</h1>
            <p>
              Theo dõi sách, độc giả, phiếu mượn và hoạt động thư viện trong một không gian
              quản trị gọn gàng.
            </p>
          </div>

          <div className="auth-feature-list">
            <span>
              <CheckCircle2 size={18} />
              Quản lý kho sách theo thời gian thực
            </span>
            <span>
              <CheckCircle2 size={18} />
              Theo dõi mượn trả và quá hạn dễ dàng
            </span>
            <span>
              <CheckCircle2 size={18} />
              Phân quyền admin và độc giả rõ ràng
            </span>
          </div>
        </aside>

        <form className="login-card auth-card" onSubmit={handleSubmit}>
          <div className="auth-card-header">
            <span className="auth-card-icon">
              <ShieldCheck size={24} />
            </span>
            <div>
              <h1>Đăng nhập</h1>
              <p>Truy cập hệ thống quản lý thư viện của bạn.</p>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-group auth-field">
            <label>Email</label>
            <div className="auth-input">
              <Mail size={18} />
              <input
                type="email"
                name="email"
                placeholder="admin@gmail.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group auth-field">
            <label>Mật khẩu</label>
            <div className="auth-input">
              <Lock size={18} />
              <input
                type="password"
                name="password"
                placeholder="123456"
                value={formData.password}
                onChange={handleChange}
              />
            </div>
          </div>

          <button className="primary-button full-button auth-submit" type="submit" disabled={submitting}>
            <span>{submitting ? "Đang đăng nhập..." : "Đăng nhập"}</span>
            <ArrowRight size={18} />
          </button>

          <div className="demo-login-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => fillDemoAccount({ email: "admin@gmail.com", password: "123456" })}
            >
              Tài khoản admin
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => fillDemoAccount({ email: "buidanganh@gmail.com", password: "123456" })}
            >
              Tài khoản user
            </button>
          </div>

          <button className="link-button auth-link" type="button" onClick={onNavigateRegister}>
            Chưa có tài khoản? Đăng ký user
          </button>

          <div className="demo-account">
            Admin quản lý toàn bộ hệ thống. User tra cứu sách, mượn sách và xem phiếu mượn của mình.
          </div>
        </form>
      </section>
    </div>
  );
}

export default Login;

import { useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, Lock, Mail, Phone, ShieldCheck, Sparkles, User } from "lucide-react";
import { register } from "../services/api";

function Register({ onRegister, onNavigateLogin }) {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!formData.fullName || !formData.email || !formData.password) {
      setError("Vui lòng nhập họ tên, email và mật khẩu.");
      return;
    }

    if (formData.password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await register({
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      });
      onRegister(user);
    } catch (err) {
      setError(err.message || "Không thể đăng ký tài khoản.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page register-page">
      <section className="auth-shell">
        <aside className="auth-visual" aria-label="Giới thiệu quyền độc giả">
          <div className="auth-brand">
            <span className="auth-brand-mark">
              <BookOpen size={26} />
            </span>
            <div>
              <strong>LibManage</strong>
              <span>Reader Access</span>
            </div>
          </div>

          <div className="auth-hero">
            <span className="auth-kicker">
              <Sparkles size={16} />
              Tạo tài khoản độc giả
            </span>
            <h1>Bắt đầu mượn sách nhanh hơn</h1>
            <p>
              Tài khoản user giúp bạn tra cứu danh mục, gửi yêu cầu mượn sách và theo dõi lịch sử
              mượn trả cá nhân.
            </p>
          </div>

          <div className="auth-feature-list">
            <span>
              <CheckCircle2 size={18} />
              Tìm sách theo tên, tác giả và thể loại
            </span>
            <span>
              <CheckCircle2 size={18} />
              Theo dõi phiếu mượn đang xử lý
            </span>
            <span>
              <CheckCircle2 size={18} />
              Nhận quyền độc giả ngay sau khi đăng ký
            </span>
          </div>
        </aside>

        <form className="login-card auth-card" onSubmit={handleSubmit}>
          <div className="auth-card-header">
            <span className="auth-card-icon">
              <ShieldCheck size={24} />
            </span>
            <div>
              <h1>Đăng ký</h1>
              <p>Tạo tài khoản user để sử dụng thư viện.</p>
            </div>
          </div>

          <div className="permission-note auth-note">
            Tài khoản mới được cấp quyền độc giả. Quyền admin chỉ dùng cho quản trị viên thư viện.
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-group auth-field">
            <label>Họ tên</label>
            <div className="auth-input">
              <User size={18} />
              <input
                type="text"
                name="fullName"
                placeholder="Nguyễn Văn A"
                value={formData.fullName}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group auth-field">
            <label>Email</label>
            <div className="auth-input">
              <Mail size={18} />
              <input
                type="email"
                name="email"
                placeholder="user@gmail.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group auth-field">
            <label>Điện thoại</label>
            <div className="auth-input">
              <Phone size={18} />
              <input
                type="tel"
                name="phone"
                placeholder="0901000000"
                value={formData.phone}
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
                placeholder="Tối thiểu 6 ký tự"
                value={formData.password}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group auth-field">
            <label>Xác nhận mật khẩu</label>
            <div className="auth-input">
              <Lock size={18} />
              <input
                type="password"
                name="confirmPassword"
                placeholder="Nhập lại mật khẩu"
                value={formData.confirmPassword}
                onChange={handleChange}
              />
            </div>
          </div>

          <button className="primary-button full-button auth-submit" type="submit" disabled={submitting}>
            <span>{submitting ? "Đang đăng ký..." : "Tạo tài khoản"}</span>
            <ArrowRight size={18} />
          </button>

          <button className="link-button auth-link" type="button" onClick={onNavigateLogin}>
            Đã có tài khoản? Đăng nhập
          </button>
        </form>
      </section>
    </div>
  );
}

export default Register;

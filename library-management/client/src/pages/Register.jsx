import { useState } from "react";
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
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Đăng ký</h1>
        <p>Tạo tài khoản user để tra cứu và mượn sách trong thư viện.</p>
        <div className="permission-note">
          Tài khoản mới được cấp quyền độc giả. Quyền admin chỉ dùng cho quản trị viên thư viện.
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label>Họ tên</label>
          <input
            type="text"
            name="fullName"
            placeholder="Nguyễn Văn A"
            value={formData.fullName}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            name="email"
            placeholder="user@gmail.com"
            value={formData.email}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Điện thoại</label>
          <input
            type="tel"
            name="phone"
            placeholder="0901000000"
            value={formData.phone}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Mật khẩu</label>
          <input
            type="password"
            name="password"
            placeholder="Tối thiểu 6 ký tự"
            value={formData.password}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Xác nhận mật khẩu</label>
          <input
            type="password"
            name="confirmPassword"
            placeholder="Nhập lại mật khẩu"
            value={formData.confirmPassword}
            onChange={handleChange}
          />
        </div>

        <button className="primary-button full-button" type="submit" disabled={submitting}>
          {submitting ? "Đang đăng ký..." : "Đăng ký"}
        </button>

        <button className="link-button" type="button" onClick={onNavigateLogin}>
          Đã có tài khoản? Đăng nhập
        </button>
      </form>
    </div>
  );
}

export default Register;

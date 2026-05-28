function Header({ title, subtitle, user, onLogout }) {
  return (
    <header className="header">
      <div className="header-left">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="user-panel">
        <div>
          <span>Xin chào, {user.fullName}</span>
          <p>
            {user.email} · {user.role === "admin" ? "Admin" : "User"}
          </p>
        </div>
        <div className="avatar">{user.fullName?.charAt(0) ?? "A"}</div>
        <button className="logout-button" type="button" onClick={onLogout}>
          Đăng xuất
        </button>
      </div>
    </header>
  );
}

export default Header;

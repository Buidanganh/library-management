function Header({ title, subtitle, user, roleLabel, currentPageLabel, onLogout }) {
  return (
    <header className="header bg-white shadow-sm py-3">
      <div className="container d-flex align-items-center justify-content-between">
        <div>
          <div className="breadcrumb-line">Trang chủ / {currentPageLabel}</div>
          <h1 className="h4 mb-0">{title}</h1>
          <p className="text-muted mb-0 small">{subtitle}</p>
        </div>

        <div className="d-flex align-items-center gap-3">
          <div className="text-end">
            <div className="fw-semibold">Xin chào, {user.fullName}</div>
            <div className="text-muted small">
              {user.email} · <span className={user.role === "admin" ? "role-pill admin" : "role-pill user"}>{roleLabel}</span>
            </div>
          </div>

          <div className="avatar rounded-circle bg-primary text-white d-flex align-items-center justify-content-center" style={{width:40,height:40}}>
            {user.fullName?.charAt(0) ?? "A"}
          </div>

          <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onLogout}>
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;

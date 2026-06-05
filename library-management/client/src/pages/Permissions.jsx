import { CheckCircle2, LockKeyhole, ShieldCheck, UserCog, UsersRound, XCircle } from "lucide-react";

const roles = [
  {
    id: "admin",
    label: "Admin",
    icon: ShieldCheck,
    tone: "danger",
    description: "Toàn quyền cấu hình hệ thống, phân quyền và kiểm tra nhật ký.",
  },
  {
    id: "librarian",
    label: "Thủ thư",
    icon: UserCog,
    tone: "warning",
    description: "Vận hành kho sách, độc giả, mượn trả và xử lý quá hạn.",
  },
  {
    id: "user",
    label: "Độc giả",
    icon: UsersRound,
    tone: "success",
    description: "Tra cứu, mượn sách, đặt trước và theo dõi hồ sơ cá nhân.",
  },
];

const permissions = [
  { label: "Xem dashboard và phân tích", admin: true, librarian: true, user: true },
  { label: "Tra cứu kho sách", admin: true, librarian: true, user: true },
  { label: "Thêm, sửa, xóa sách", admin: true, librarian: true, user: false },
  { label: "Nhập sách hàng loạt", admin: true, librarian: true, user: false },
  { label: "Tạo và cập nhật độc giả", admin: true, librarian: true, user: false },
  { label: "Khóa hoặc mở tài khoản độc giả", admin: true, librarian: true, user: false },
  { label: "Đổi vai trò tài khoản", admin: true, librarian: false, user: false },
  { label: "Tạo phiếu mượn cho độc giả", admin: true, librarian: true, user: false },
  { label: "Tự mượn sách từ trang tra cứu", admin: false, librarian: false, user: true },
  { label: "Gia hạn, trả sách và xử lý phạt", admin: true, librarian: true, user: true },
  { label: "Xử lý hàng chờ đặt trước", admin: true, librarian: true, user: false },
  { label: "Xem nhật ký hoạt động", admin: true, librarian: false, user: false },
  { label: "Xuất backup dữ liệu", admin: true, librarian: false, user: false },
];

function PermissionMark({ allowed }) {
  return allowed ? (
    <span className="permission-mark allowed">
      <CheckCircle2 size={16} />
      Có
    </span>
  ) : (
    <span className="permission-mark denied">
      <XCircle size={16} />
      Không
    </span>
  );
}

function Permissions() {
  return (
    <div className="page-shell permissions-page">
      <div className="page-title">
        <span className="page-eyebrow">RBAC</span>
        <h2>Ma trận phân quyền</h2>
        <p>Quản lý phạm vi thao tác của admin, thủ thư và độc giả trong toàn hệ thống.</p>
      </div>

      <div className="permission-role-grid">
        {roles.map((role) => {
          const Icon = role.icon;

          return (
            <article className={`permission-role-card ${role.tone}`} key={role.id}>
              <Icon size={24} />
              <div>
                <strong>{role.label}</strong>
                <span>{role.description}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="table-card">
        <div className="table-card-header row-between">
          <div>
            <h3>Quyền theo vai trò</h3>
            <p>Admin có thể chỉnh vai trò ở trang Độc giả. Các quyền dưới đây đang khớp với điều kiện hiển thị menu và API hiện tại.</p>
          </div>
          <span className="badge success">
            <LockKeyhole size={14} />
            Bảo vệ theo vai trò
          </span>
        </div>

        <div className="table-responsive">
          <table className="table table-sm permission-table">
            <thead>
              <tr>
                <th>Chức năng</th>
                <th>Admin</th>
                <th>Thủ thư</th>
                <th>Độc giả</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission) => (
                <tr key={permission.label}>
                  <td>{permission.label}</td>
                  <td><PermissionMark allowed={permission.admin} /></td>
                  <td><PermissionMark allowed={permission.librarian} /></td>
                  <td><PermissionMark allowed={permission.user} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Permissions;

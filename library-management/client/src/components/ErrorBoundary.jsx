import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-fallback">
          <h1>Ứng dụng gặp lỗi khi hiển thị</h1>
          <p>{this.state.error.message || "Vui lòng tải lại trang hoặc đăng nhập lại."}</p>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem("libraryUser");
              window.location.href = "/login";
            }}
          >
            Đăng nhập lại
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

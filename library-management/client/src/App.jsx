import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";

const MOJIBAKE_PATTERN = /Ã|Æ|Â|â€/;

function readSavedUser() {
  const savedUser = localStorage.getItem("libraryUser");
  if (!savedUser) return null;

  try {
    const user = JSON.parse(savedUser);

    if (MOJIBAKE_PATTERN.test(JSON.stringify(user))) {
      localStorage.removeItem("libraryUser");
      return null;
    }

    if (!user.token) {
      localStorage.removeItem("libraryUser");
      return null;
    }

    return user;
  } catch {
    localStorage.removeItem("libraryUser");
    return null;
  }
}

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(readSavedUser);
  const [toasts, setToasts] = useState([]);

  const pushToast = (message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 3200);
  };

  useEffect(() => {
    const nativeAlert = window.alert;
    window.alert = (message) => pushToast(String(message || ""), "info");
    return () => {
      window.alert = nativeAlert;
    };
  }, []);

  const handleLogin = (userInfo) => {
    localStorage.setItem("libraryUser", JSON.stringify(userInfo));
    setUser(userInfo);
    navigate("/");
  };

  const handleLogout = () => {
    localStorage.removeItem("libraryUser");
    setUser(null);
    navigate("/login");
  };

  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <Login
                onLogin={handleLogin}
                onNavigateRegister={() => navigate("/register")}
              />
            )
          }
        />
        <Route
          path="/register"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <Register
                onRegister={handleLogin}
                onNavigateLogin={() => navigate("/login")}
              />
            )
          }
        />
        <Route
          path="/*"
          element={
            user ? <Layout user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />
          }
        />
      </Routes>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`app-toast ${toast.type}`} key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
    </ErrorBoundary>
  );
}

export default App;

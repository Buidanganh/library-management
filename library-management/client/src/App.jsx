import { useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Layout from "./components/Layout";

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("libraryUser");
    return savedUser ? JSON.parse(savedUser) : null;
  });

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
  );
}

export default App;

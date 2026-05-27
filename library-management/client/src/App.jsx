import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Layout from "./components/Layout";

function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("libraryUser");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (nextPath) => {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  };

  const handleLogin = (userInfo) => {
    localStorage.setItem("libraryUser", JSON.stringify(userInfo));
    setUser(userInfo);
    navigate("/");
  };

  const handleLogout = () => {
    localStorage.removeItem("libraryUser");
    setUser(null);
    navigate("/");
  };

  if (!user) {
    if (path === "/register") {
      return (
        <Register
          onRegister={handleLogin}
          onNavigateLogin={() => navigate("/login")}
        />
      );
    }

    return (
      <Login
        onLogin={handleLogin}
        onNavigateRegister={() => navigate("/register")}
      />
    );
  }

  return <Layout user={user} onLogout={handleLogout} />;
}

export default App;

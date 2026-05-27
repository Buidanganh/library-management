import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import Dashboard from "../pages/Dashboard";
import Login from "../pages/Login";
import Books from "../pages/Books";
import BookCreate from "../pages/BookCreate";
import Readers from "../pages/Readers";
import Borrow from "../pages/Borrow";
import Overdue from "../pages/Overdue";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="books" element={<Books />} />
        <Route path="books/create" element={<BookCreate />} />
        <Route path="readers" element={<Readers />} />
        <Route path="borrow" element={<Borrow />} />
        <Route path="overdue" element={<Overdue />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
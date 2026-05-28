import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Dashboard from "../pages/Dashboard";
import Books from "../pages/Books";
import BookCreate from "../pages/BookCreate";
import Readers from "../pages/Readers";
import Borrow from "../pages/Borrow";
import Overdue from "../pages/Overdue";
import { createBook, deleteBook, updateBook } from "../services/api";

function Layout({ user, onLogout }) {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [editingBook, setEditingBook] = useState(null);
  const [returnPage, setReturnPage] = useState("books");
  const isAdmin = user.role === "admin";

  const handleSaveBook = async (bookData) => {
    if (!isAdmin) return;

    if (bookData.id) {
      await updateBook(bookData.id, bookData);
    } else {
      await createBook(bookData);
    }
    setEditingBook(null);
  };

  const handleDeleteBook = async (bookId) => {
    if (!isAdmin) return;
    await deleteBook(bookId);
  };

  const handleNavigateToCreate = (page = "books") => {
    if (!isAdmin) return;

    setEditingBook(null);
    setReturnPage(page);
    setCurrentPage("add-book");
  };

  const handleEditBook = (book, page = "books") => {
    if (!isAdmin) return;

    setEditingBook(book);
    setReturnPage(page);
    setCurrentPage("add-book");
  };

  const handleCancelCreate = () => {
    setEditingBook(null);
    setCurrentPage(returnPage);
  };

  const handleChangePage = (page) => {
    const adminPages = ["add-book", "readers"];
    if (!isAdmin && adminPages.includes(page)) {
      setCurrentPage("dashboard");
      return;
    }

    setCurrentPage(page);
  };

  const pageInfo = {
    dashboard: {
      title: "Tổng quan",
      subtitle: "Nhìn tổng quan hoạt động thư viện.",
    },
    books: {
      title: "Quản lý sách",
      subtitle: isAdmin
        ? "Thêm, sửa, xóa và theo dõi sách hiện có."
        : "Tra cứu danh sách sách hiện có trong thư viện.",
    },
    "add-book": {
      title: "Thêm sách mới",
      subtitle: "Nhập thông tin chi tiết để thêm sách vào thư viện.",
    },
    readers: {
      title: "Độc giả",
      subtitle: "Quản lý danh sách độc giả và thông tin liên hệ.",
    },
    borrow: {
      title: "Mượn / Trả sách",
      subtitle: "Quản lý phiếu mượn, gia hạn và trả sách.",
    },
    overdue: {
      title: "Sách quá hạn",
      subtitle: "Theo dõi các phiếu mượn quá hạn.",
    },
  };

  const pages = {
    dashboard: <Dashboard />,
    books: (
      <Books
        onSaveBook={isAdmin ? handleSaveBook : undefined}
        onDeleteBook={isAdmin ? handleDeleteBook : undefined}
        onNavigateToCreate={isAdmin ? () => handleNavigateToCreate("books") : undefined}
        canManage={isAdmin}
      />
    ),
    "add-book": isAdmin ? (
      <BookCreate
        onSaveBook={handleSaveBook}
        onCancel={handleCancelCreate}
        onDeleteBook={handleDeleteBook}
        editingBook={editingBook}
      />
    ) : (
      <Dashboard />
    ),
    readers: isAdmin ? (
      <Readers
        onNavigateToCreate={() => handleNavigateToCreate("readers")}
        onEditBook={(book) => handleEditBook(book, "readers")}
        onDeleteBook={handleDeleteBook}
      />
    ) : (
      <Dashboard />
    ),
    borrow: <Borrow />,
    overdue: <Overdue />,
  };

  return (
    <div className="app-layout">
      <Sidebar currentPage={currentPage} onChangePage={handleChangePage} user={user} />

      <main className="main-content">
        <Header
          title={pageInfo[currentPage].title}
          subtitle={pageInfo[currentPage].subtitle}
          user={user}
          onLogout={onLogout}
        />

        <section className="page-content">{pages[currentPage]}</section>
      </main>
    </div>
  );
}

export default Layout;

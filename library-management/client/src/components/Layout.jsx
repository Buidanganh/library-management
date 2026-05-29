import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Dashboard from "../pages/Dashboard";
import Books from "../pages/Books";
import BookCreate from "../pages/BookCreate";
import Readers from "../pages/Readers";
import Borrow from "../pages/Borrow";
import Overdue from "../pages/Overdue";
import { borrowBook, createBook, deleteBook, updateBook } from "../services/api";

function Layout({ user, onLogout }) {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [editingBook, setEditingBook] = useState(null);
  const [returnPage, setReturnPage] = useState("books");
  const isAdmin = user.role === "admin";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem("sidebarCollapsed");
      const manualRaw = localStorage.getItem("sidebarCollapsedManual");

      if (raw !== null) return JSON.parse(raw);

      // If user didn't set a preference manually, default to collapsed on narrow screens
      const manual = manualRaw ? JSON.parse(manualRaw) : false;
      if (!manual && typeof window !== "undefined") {
        return window.innerWidth < 1100;
      }

      return false;
    } catch {
      return false;
    }
  });

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

  const handleBorrowBook = async (book) => {
    if (isAdmin) return;

    const confirmed = window.confirm(`Bạn muốn mượn sách "${book.title}" trong 14 ngày?`);
    if (!confirmed) return;

    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    await borrowBook({
      bookId: book.id,
      dueDate,
    });

    window.alert("Mượn sách thành công. Bạn có thể xem phiếu mượn trong mục Mượn / Trả sách.");
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
    dashboard: (
      <Dashboard
        onAddBook={() => handleNavigateToCreate("books")}
        onAddReader={() => handleChangePage("readers")}
        onNavigateToBorrow={() => handleChangePage("borrow")}
        isAdmin={isAdmin}
      />
    ),
    books: (
      <Books
        onSaveBook={isAdmin ? handleSaveBook : undefined}
        onDeleteBook={isAdmin ? handleDeleteBook : undefined}
        onNavigateToCreate={isAdmin ? () => handleNavigateToCreate("books") : undefined}
        onBorrowBook={!isAdmin ? handleBorrowBook : undefined}
        canManage={isAdmin}
        canBorrow={!isAdmin}
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

  const toggleSidebar = () => {
    setSidebarCollapsed((s) => {
      const next = !s;
      try {
        localStorage.setItem("sidebarCollapsed", JSON.stringify(next));
        // Mark that the user manually toggled the sidebar so auto-resize won't override
        localStorage.setItem("sidebarCollapsedManual", JSON.stringify(true));
      } catch {}
      return next;
    });
  };

  // Auto-update collapse state on window resize when the user hasn't manually toggled
  useEffect(() => {
    let manual = false;
    try {
      manual = JSON.parse(localStorage.getItem("sidebarCollapsedManual") || "false");
    } catch {}

    if (manual) return;

    const onResize = () => {
      const should = window.innerWidth < 1100;
      setSidebarCollapsed((current) => (current === should ? current : should));
    };

    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className={"app-layout" + (sidebarCollapsed ? " sidebar-collapsed" : "") }>
      <Sidebar
        currentPage={currentPage}
        onChangePage={handleChangePage}
        user={user}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

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

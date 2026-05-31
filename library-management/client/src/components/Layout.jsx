import { useCallback, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Dashboard from "../pages/Dashboard";
import Books from "../pages/Books";
import BookCreate from "../pages/BookCreate";
import Readers from "../pages/Readers";
import Borrow from "../pages/Borrow";
import Overdue from "../pages/Overdue";
import ActivityLog from "../pages/ActivityLog";
import ReaderProfile from "../pages/ReaderProfile";
import Catalog from "../pages/Catalog";
import { sidebarMenuItems } from "../constants/sidebarMenu";
import { borrowBook, createBook, deleteBook, getStats, updateBook } from "../services/api";

const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";
const SIDEBAR_COLLAPSED_MANUAL_KEY = "sidebarCollapsedManual";
const SIDEBAR_PINNED_KEY = "sidebarPinned";
const RECENT_PAGES_KEY = "recentPages";
const FAVORITE_PAGES_KEY = "favoritePages";

function Layout({ user, onLogout }) {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [editingBook, setEditingBook] = useState(null);
  const [returnPage, setReturnPage] = useState("books");
  const [borrowRequest, setBorrowRequest] = useState(null);
  const [confirmingBorrow, setConfirmingBorrow] = useState(false);
  const [sidebarBadges, setSidebarBadges] = useState({ borrow: 0, overdue: 0 });
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SIDEBAR_PINNED_KEY) || "false");
    } catch {
      return false;
    }
  });
  const [recentPages, setRecentPages] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_PAGES_KEY) || "[]");
      return Array.isArray(raw) ? raw.slice(0, 3) : [];
    } catch {
      return [];
    }
  });
  const [favoritePages, setFavoritePages] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(FAVORITE_PAGES_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  });
  const isAdmin = user?.role === "admin";
  const userRoleLabel = isAdmin ? "Quản trị viên" : "Độc giả";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const pinned = JSON.parse(localStorage.getItem(SIDEBAR_PINNED_KEY) || "false");
      if (pinned) return false;

      const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      const manualRaw = localStorage.getItem(SIDEBAR_COLLAPSED_MANUAL_KEY);

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

    return new Promise((resolve, reject) => {
      setBorrowRequest({ book, resolve, reject });
    });
  };

  const cancelBorrowBook = () => {
    borrowRequest?.resolve?.(false);
    setBorrowRequest(null);
  };

  const confirmBorrowBook = async () => {
    if (!borrowRequest?.book) return;

    const { book, resolve, reject } = borrowRequest;
    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    setConfirmingBorrow(true);

    try {
      await borrowBook({
        bookId: book.id,
        dueDate,
      });
      getStats().then(applySidebarStats).catch(() => {});

      window.alert("Mượn sách thành công. Bạn có thể xem phiếu mượn trong mục Mượn / Trả sách.");
      resolve?.(true);
      setBorrowRequest(null);
    } catch (err) {
      reject?.(err);
    } finally {
      setConfirmingBorrow(false);
    }
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

  const handleChangePage = useCallback((page) => {
    const adminPages = ["add-book", "readers", "catalog", "activity"];
    if (!isAdmin && adminPages.includes(page)) {
      setCurrentPage("dashboard");
      return;
    }

    if (isAdmin && page === "profile") {
      setCurrentPage("dashboard");
      return;
    }

    setCurrentPage(page);
  }, [isAdmin]);

  const handleSidebarChangePage = useCallback((page) => {
    handleChangePage(page);

    if (!sidebarPinned && typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, [handleChangePage, sidebarPinned]);

  const applySidebarStats = useCallback((stats) => {
    setSidebarBadges({
      borrow: Number(stats?.borrowed || 0),
      overdue: Number(stats?.overdue || 0),
    });
  }, []);

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
    profile: {
      title: "Hồ sơ cá nhân",
      subtitle: "Theo dõi thông tin độc giả, sách đang mượn và lịch sử mượn trả.",
    },
    "add-book": {
      title: editingBook ? "Chỉnh sửa sách" : "Thêm sách mới",
      subtitle: editingBook
        ? "Cập nhật thông tin chi tiết của sách trong thư viện."
        : "Nhập thông tin chi tiết để thêm sách vào thư viện.",
    },
    readers: {
      title: "Độc giả",
      subtitle: "Quản lý danh sách độc giả và thông tin liên hệ.",
    },
    catalog: {
      title: "Danh mục sách",
      subtitle: "Chuẩn hóa thể loại và nhà xuất bản dùng khi nhập sách.",
    },
    borrow: {
      title: "Mượn / Trả sách",
      subtitle: "Quản lý phiếu mượn, gia hạn và trả sách.",
    },
    overdue: {
      title: "Sách quá hạn",
      subtitle: "Theo dõi các phiếu mượn quá hạn.",
    },
    activity: {
      title: "Nhật ký hoạt động",
      subtitle: "Theo dõi các thay đổi và thao tác quan trọng trong thư viện.",
    },
  };

  const pages = {
    dashboard: (
      <Dashboard
        onAddBook={() => handleNavigateToCreate("books")}
        onAddReader={() => handleChangePage("readers")}
        onNavigateToBooks={() => handleChangePage("books")}
        onNavigateToReaders={() => handleChangePage("readers")}
        onNavigateToBorrow={() => handleChangePage("borrow")}
        onNavigateToOverdue={() => handleChangePage("overdue")}
        isAdmin={isAdmin}
      />
    ),
    books: (
      <Books
        onSaveBook={isAdmin ? handleSaveBook : undefined}
        onDeleteBook={isAdmin ? handleDeleteBook : undefined}
        onEditBook={isAdmin ? (book) => handleEditBook(book, "books") : undefined}
        onNavigateToCreate={isAdmin ? () => handleNavigateToCreate("books") : undefined}
        onBorrowBook={!isAdmin ? handleBorrowBook : undefined}
        canManage={isAdmin}
        canBorrow={!isAdmin}
      />
    ),
    profile: !isAdmin ? <ReaderProfile user={user} /> : <Dashboard />,
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
    catalog: isAdmin ? <Catalog /> : <Dashboard />,
    borrow: <Borrow isAdmin={isAdmin} />,
    overdue: <Overdue isAdmin={isAdmin} />,
    activity: isAdmin ? <ActivityLog /> : <Dashboard />,
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((s) => {
      const next = !s;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(next));
        // Mark that the user manually toggled the sidebar so auto-resize won't override
        localStorage.setItem(SIDEBAR_COLLAPSED_MANUAL_KEY, JSON.stringify(true));
      } catch {}
      return next;
    });
  };

  const toggleSidebarPin = () => {
    setSidebarPinned((pinned) => {
      const next = !pinned;

      try {
        localStorage.setItem(SIDEBAR_PINNED_KEY, JSON.stringify(next));
        localStorage.setItem(SIDEBAR_COLLAPSED_MANUAL_KEY, JSON.stringify(true));
      } catch {}

      if (next) {
        setSidebarCollapsed(false);
        try {
          localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(false));
        } catch {}
      }

      return next;
    });
  };

  const toggleFavoritePage = (page) => {
    setFavoritePages((pages) => {
      const next = pages.includes(page)
        ? pages.filter((item) => item !== page)
        : [...pages, page];

      try {
        localStorage.setItem(FAVORITE_PAGES_KEY, JSON.stringify(next));
      } catch {}

      return next;
    });
  };

  // Auto-update collapse state on window resize when the user hasn't manually toggled
  useEffect(() => {
    if (sidebarPinned) return undefined;

    let manual = false;
    try {
      manual = JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSED_MANUAL_KEY) || "false");
    } catch {}

    if (manual) return;

    const onResize = () => {
      const should = window.innerWidth < 1100;
      setSidebarCollapsed((current) => (current === should ? current : should));
    };

    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [sidebarPinned]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    setRecentPages((pages) => {
      const next = [currentPage, ...pages.filter((page) => page !== currentPage)].slice(0, 3);

      try {
        localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(next));
      } catch {}

      return next;
    });
  }, [currentPage]);

  useEffect(() => {
    let active = true;

    getStats()
      .then((stats) => {
        if (active) applySidebarStats(stats);
      })
      .catch(() => {
        if (active) setSidebarBadges({ borrow: 0, overdue: 0 });
      });

    return () => {
      active = false;
    };
  }, [applySidebarStats, user?.id, user?.role]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") return;

      const item = sidebarMenuItems.find(
        (menuItem) =>
          menuItem.shortcut === event.key &&
          (!menuItem.adminOnly || isAdmin) &&
          (!menuItem.userOnly || !isAdmin)
      );

      if (!item) return;

      event.preventDefault();
      handleChangePage(item.id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleChangePage, isAdmin]);

  return (
    <div className={"app-layout" + (sidebarCollapsed ? " sidebar-collapsed" : "") }>
      <Sidebar
        currentPage={currentPage}
        onChangePage={handleSidebarChangePage}
        user={user}
        roleLabel={userRoleLabel}
        badgeCounts={sidebarBadges}
        isOnline={isOnline}
        pinned={sidebarPinned}
        recentPages={recentPages}
        favoritePages={favoritePages}
        collapsed={sidebarCollapsed}
        onTogglePin={toggleSidebarPin}
        onToggleFavorite={toggleFavoritePage}
        onToggleCollapse={toggleSidebar}
      />

      <main className="main-content">
        <Header
          title={pageInfo[currentPage].title}
          subtitle={pageInfo[currentPage].subtitle}
          user={user}
          roleLabel={userRoleLabel}
          currentPageLabel={pageInfo[currentPage].title}
          onLogout={onLogout}
        />

        <section className="page-content">
          {!isAdmin && (
            <div className="permission-banner">
              <strong>Quyền độc giả</strong>
              <span>Bạn có thể tra cứu sách, mượn sách và theo dõi phiếu mượn của mình. Các chức năng quản trị sách và độc giả được ẩn.</span>
            </div>
          )}
          {pages[currentPage]}
        </section>
      </main>

      {borrowRequest?.book && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true">
          <div className="app-modal">
            <h3>Xác nhận mượn sách</h3>
            <p>
              Bạn muốn mượn sách "{borrowRequest.book.title}" trong 14 ngày?
            </p>
            <div className="modal-summary">
              <span>Tác giả: <strong>{borrowRequest.book.author || "-"}</strong></span>
              <span>Hạn trả: <strong>14 ngày</strong></span>
            </div>
            <div className="form-actions">
              <button className="primary-button" type="button" onClick={confirmBorrowBook} disabled={confirmingBorrow}>
                {confirmingBorrow ? "Đang mượn..." : "Xác nhận mượn"}
              </button>
              <button className="secondary-button" type="button" onClick={cancelBorrowBook} disabled={confirmingBorrow}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Layout;

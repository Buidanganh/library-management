import { useCallback, useMemo, useState } from "react";
import { Bot, BrainCircuit, CheckCircle2, RefreshCw, Send, Sparkles, Trash2, X } from "lucide-react";
import {
  getActivities,
  getBooks,
  getCatalog,
  getLoans,
  getNotifications,
  getReaders,
  getReservations,
  getStats,
  sanitizeVietnameseText,
} from "../services/api";

const CHAT_HISTORY_KEY = "libraryAssistantMessages";

const STARTER_PROMPTS = [
  "Báo cáo nhanh thư viện",
  "Tạo việc cần làm hôm nay",
  "Soạn tin nhắn nhắc trả",
  "Tìm sách còn hàng",
  "Độc giả nào cần chú ý?",
  "Kiểm kho sách sắp cạn",
];

const PAGE_COMMANDS = [
  { keywords: ["tong quan", "dashboard"], target: "dashboard", label: "Mở Tổng quan" },
  { keywords: ["van hanh", "operations", "ke hoach"], target: "operations", label: "Mở Vận hành" },
  { keywords: ["sach", "kho sach", "ton kho", "kiem kho", "tac gia"], target: "books", label: "Mở Kho sách" },
  { keywords: ["muon", "tra", "dat truoc", "phieu"], target: "borrow", label: "Mở Mượn / Trả" },
  { keywords: ["qua han", "tre han", "phat"], target: "overdue", label: "Mở Quá hạn" },
  { keywords: ["doc gia", "ban doc", "reader"], target: "readers", label: "Mở Độc giả" },
  { keywords: ["phan tich", "bao cao", "analytics", "thong ke"], target: "analytics", label: "Mở Phân tích" },
  { keywords: ["phan quyen", "vai tro", "admin", "thu thu"], target: "permissions", label: "Mở Phân quyền" },
  { keywords: ["danh muc", "the loai", "nha xuat ban"], target: "catalog", label: "Mở Danh mục" },
  { keywords: ["nhat ky", "log", "hoat dong"], target: "activity", label: "Mở Nhật ký" },
  { keywords: ["ho so", "ca nhan", "profile"], target: "profile", label: "Mở Hồ sơ" },
];

const HOW_TO_GUIDES = [
  {
    keywords: ["nhap sach", "them sach", "tao sach", "book moi"],
    text: "Để nhập sách: mở Kho sách hoặc Thêm sách mới, điền tên sách, tác giả, thể loại, số lượng, vị trí kệ và ảnh bìa nếu có. Nếu nhập nhiều sách, dùng chức năng nhập CSV/mẫu để tiết kiệm thời gian.",
    target: "books",
    actionLabel: "Mở Kho sách",
  },
  {
    keywords: ["muon sach", "tao phieu", "cho muon"],
    text: "Để tạo phiếu mượn: mở Mượn / Trả, chọn độc giả, chọn sách còn bản sẵn, đặt hạn trả rồi xác nhận. Nếu sách chưa có bản sẵn, nên tạo đặt trước thay vì mượn ngay.",
    target: "borrow",
    actionLabel: "Mở Mượn / Trả",
  },
  {
    keywords: ["tra sach", "gia han", "thu phat", "mien phat"],
    text: "Để xử lý trả/gia hạn: mở Mượn / Trả hoặc Quá hạn, chọn phiếu, kiểm tra hạn trả và tiền phạt. Phiếu quá hạn nên được xử lý trước để giảm rủi ro vận hành.",
    target: "borrow",
    actionLabel: "Mở Mượn / Trả",
  },
  {
    keywords: ["khoa tai khoan", "mo khoa", "doi vai tro"],
    text: "Để khóa/mở tài khoản hoặc đổi vai trò: mở Độc giả hoặc Phân quyền, chọn tài khoản cần xử lý. Các thao tác này chỉ dành cho tài khoản có quyền quản trị phù hợp.",
    target: "permissions",
    actionLabel: "Mở Phân quyền",
  },
  {
    keywords: ["danh muc", "the loai", "nha xuat ban"],
    text: "Để chuẩn hóa danh mục: mở Danh mục sách, thêm hoặc xóa thể loại và nhà xuất bản. Việc này giúp form nhập sách thống nhất hơn.",
    target: "catalog",
    actionLabel: "Mở Danh mục",
  },
];

function createWelcomeMessage() {
  return {
    id: "hello",
    role: "assistant",
    text: "Xin chào, mình là trợ lý AI thư viện. Mình có thể trả lời nhiều mảng hơn: kho sách, độc giả, mượn trả, đặt trước, quá hạn, danh mục, phân tích, phân quyền và hướng dẫn thao tác.",
    target: "operations",
    actionLabel: "Mở Vận hành",
    actions: [
      { type: "ask", label: "Báo cáo nhanh", prompt: "Báo cáo nhanh thư viện" },
      { type: "ask", label: "Việc hôm nay", prompt: "Tạo việc cần làm hôm nay" },
      { type: "navigate", label: "Mở Vận hành", target: "operations" },
    ],
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function normalizeText(value) {
  return String(sanitizeVietnameseText(value) || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function toList(items, formatter, emptyText = "Chưa có dữ liệu phù hợp.") {
  if (!items.length) return emptyText;
  return items.map((item, index) => `${index + 1}. ${formatter(item)}`).join("\n");
}

function pageAction(label, target) {
  return { type: "navigate", label, target };
}

function askAction(label, prompt) {
  return { type: "ask", label, prompt };
}

function copyAction(label, text) {
  return { type: "copy", label, text };
}

function loadSavedMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || "[]");
    return Array.isArray(saved) && saved.length > 0 ? saved.slice(-18) : [createWelcomeMessage()];
  } catch {
    return [createWelcomeMessage()];
  }
}

async function settleContext(canManageLibrary) {
  const requests = {
    stats: getStats(),
    notifications: getNotifications(),
    books: getBooks(),
    loans: getLoans(),
    reservations: getReservations(),
    catalog: getCatalog(),
    readers: getReaders(),
    activities: canManageLibrary ? getActivities() : Promise.resolve([]),
  };

  const entries = await Promise.allSettled(Object.entries(requests).map(async ([key, request]) => [key, await request]));
  return entries.reduce((context, entry) => {
    if (entry.status === "fulfilled") {
      const [key, value] = entry.value;
      context[key] = sanitizeVietnameseText(value);
    }
    return context;
  }, {});
}

function getUrgency(context) {
  const stats = context.stats || {};
  const notifications = context.notifications || [];
  const overdue = Number(stats.overdue || 0);
  const dueSoon = Number(stats.dueSoon || 0);
  const lowStock = stats.lowStockBooks?.length || 0;
  const waitingReservations = Number(stats.reservationQueue?.totalWaiting ?? stats.waitingReservations ?? 0);
  const urgentNotifications = notifications.filter((item) => item.tone === "danger" || item.tone === "warning").length;
  const score = overdue * 4 + dueSoon * 2 + lowStock * 2 + waitingReservations + urgentNotifications;

  if (score >= 16) return { label: "Căng", tone: "danger" };
  if (score >= 7) return { label: "Cần theo dõi", tone: "warning" };
  return { label: "Ổn định", tone: "success" };
}

function summarizeBooks(context) {
  const books = context.books || [];
  const totalTitles = books.length;
  const totalCopies = books.reduce((total, book) => total + Number(book.quantity || 0), 0);
  const available = books.reduce((total, book) => total + Number(book.availableQuantity || 0), 0);
  const lowStock = books.filter((book) => Number(book.availableQuantity || 0) <= 2);
  const missingImages = books.filter((book) => !book.imageUrl);

  return { totalTitles, totalCopies, available, lowStock, missingImages };
}

function searchBooks(context, query) {
  const words = query.split(/\s+/).filter((word) => word.length >= 3 && !["sach", "tim", "kiem", "con", "hang", "the", "loai", "tac", "gia"].includes(word));
  const books = context.books || [];
  if (!words.length) {
    return books
      .slice()
      .sort((first, second) => Number(second.availableQuantity || 0) - Number(first.availableQuantity || 0))
      .slice(0, 5);
  }

  return books
    .filter((book) => {
      const haystack = normalizeText([book.title, book.author, book.category, book.publisher].filter(Boolean).join(" "));
      return words.every((word) => haystack.includes(word));
    })
    .slice(0, 5);
}

function getCategoryStats(context) {
  const books = context.books || [];
  const loans = context.loans || [];
  const byId = new Map(books.map((book) => [book.id, book]));
  const counts = new Map();

  books.forEach((book) => {
    const category = book.category || "Chưa phân loại";
    const current = counts.get(category) || { category, titles: 0, copies: 0, available: 0, loans: 0 };
    current.titles += 1;
    current.copies += Number(book.quantity || 0);
    current.available += Number(book.availableQuantity || 0);
    counts.set(category, current);
  });

  loans.forEach((loan) => {
    const book = byId.get(loan.bookId);
    const category = book?.category || "Chưa phân loại";
    const current = counts.get(category) || { category, titles: 0, copies: 0, available: 0, loans: 0 };
    current.loans += 1;
    counts.set(category, current);
  });

  return Array.from(counts.values()).sort((first, second) => second.loans - first.loans || second.titles - first.titles);
}

function getReaderRisks(context) {
  const readers = context.readers || [];
  const loans = context.loans || [];
  return readers
    .map((reader) => {
      const readerLoans = loans.filter((loan) => loan.readerId === reader.id);
      const overdue = readerLoans.filter((loan) => loan.status === "overdue").length;
      const active = readerLoans.filter((loan) => loan.status === "borrowed").length;
      const fines = readerLoans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0);
      return { ...reader, overdue, active, fines, score: overdue * 5 + active + (fines > 0 ? 2 : 0) };
    })
    .filter((reader) => reader.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, 5);
}

function buildPriorityPlan(context) {
  const stats = context.stats || {};
  const overdue = Number(stats.overdue || 0);
  const dueSoon = Number(stats.dueSoon || 0);
  const readyReservations = Number(stats.reservationQueue?.readyToFulfill || 0);
  const lowStock = stats.lowStockBooks?.length || 0;
  const missingImages = Number(stats.missingImageBooks || 0);
  const plan = [];

  if (overdue > 0) plan.push(`1. Xử lý ${overdue} phiếu quá hạn trước, tổng phạt dự kiến ${formatCurrency(stats.totalFines || 0)}.`);
  if (dueSoon > 0) plan.push(`${plan.length + 1}. Nhắc ${dueSoon} phiếu sắp đến hạn trong 3 ngày.`);
  if (readyReservations > 0) plan.push(`${plan.length + 1}. Chuyển ${readyReservations} yêu cầu đặt trước sang phiếu mượn.`);
  if (lowStock > 0) plan.push(`${plan.length + 1}. Kiểm ${lowStock} đầu sách sắp cạn hoặc hết bản sẵn.`);
  if (missingImages > 0) plan.push(`${plan.length + 1}. Bổ sung ảnh bìa cho ${missingImages} đầu sách để tra cứu sạch hơn.`);

  return plan.length > 0 ? plan : ["Không có việc khẩn cấp. Có thể rà danh mục, ảnh bìa và dữ liệu độc giả."];
}

function buildReminderDraft(context) {
  const loans = context.loans || [];
  const overdueLoan = loans.find((loan) => loan.status === "overdue");
  const dueSoonLoan = loans.find((loan) => loan.status === "borrowed");
  const loan = overdueLoan || dueSoonLoan;

  if (!loan) {
    return "Xin chào, thư viện nhắc bạn kiểm tra lịch trả sách trong hồ sơ cá nhân. Nếu cần hỗ trợ gia hạn hoặc đặt trước sách mới, vui lòng phản hồi thư viện.";
  }

  const readerName = loan.readerName || "bạn";
  const bookTitle = loan.bookTitle || "sách đang mượn";
  const dueDate = loan.dueDate || "hạn trả hiện tại";
  const fineText = Number(loan.fineAmount || 0) > 0 ? ` Tiền phạt dự kiến hiện là ${formatCurrency(loan.fineAmount)}.` : "";

  return `Xin chào ${readerName}, thư viện nhắc bạn về sách "${bookTitle}" có hạn trả ${dueDate}.${fineText} Vui lòng trả sách hoặc liên hệ thủ thư nếu cần gia hạn. Cảm ơn bạn.`;
}

function withActions(answer, actions = []) {
  const fallback = answer.target ? [pageAction(answer.actionLabel || "Mở trang", answer.target)] : [];
  return {
    ...answer,
    actions: [...actions, ...fallback].slice(0, 4),
  };
}

function buildAnswer(question, context, canManageLibrary, isAdmin) {
  const query = normalizeText(question);
  const stats = context.stats || {};
  const books = context.books || [];
  const loans = context.loans || [];
  const readers = context.readers || [];
  const reservations = context.reservations || [];
  const catalog = context.catalog || {};
  const activities = context.activities || [];
  const overdue = Number(stats.overdue || 0);
  const dueSoon = Number(stats.dueSoon || 0);
  const waitingReservations = Number(stats.reservationQueue?.totalWaiting ?? stats.waitingReservations ?? 0);
  const readyReservations = Number(stats.reservationQueue?.readyToFulfill || 0);
  const recommendedBooks = stats.recommendedBooks || [];
  const urgency = getUrgency(context);

  const guide = HOW_TO_GUIDES.find((item) => item.keywords.some((keyword) => query.includes(keyword)));
  if (guide && (query.includes("huong dan") || query.includes("cach") || query.includes("lam sao") || query.includes("them") || query.includes("tao"))) {
    const safeGuide =
      guide.target === "permissions" && !isAdmin
        ? {
            ...guide,
            text: `${guide.text}\nLưu ý: đổi vai trò và phân quyền chỉ dành cho admin. Thủ thư có thể quản lý độc giả trong phạm vi vận hành.`,
            target: canManageLibrary ? "readers" : "profile",
            actionLabel: canManageLibrary ? "Mở Độc giả" : "Mở Hồ sơ",
          }
        : guide;

    return withActions(safeGuide, [askAction("Báo cáo nhanh", "Báo cáo nhanh thư viện")]);
  }

  if (query.includes("soan") || query.includes("tin nhan") || query.includes("email") || query.includes("nhac tra")) {
    const draft = buildReminderDraft(context);
    return withActions(
      {
        text: `Mình đã soạn nội dung nhắc trả sách:\n${draft}`,
        target: "borrow",
        actionLabel: "Mở Mượn / Trả",
      },
      [
        copyAction("Copy tin nhắn", draft),
        askAction("Xem quá hạn", "Có phiếu mượn quá hạn không?"),
      ]
    );
  }

  if (query.includes("bao cao") || query.includes("tong ket") || query.includes("thong ke") || query.includes("report")) {
    const bookSummary = summarizeBooks(context);
    return withActions({
      text: `Báo cáo nhanh:\n- Vận hành: ${urgency.label}\n- Kho sách: ${bookSummary.totalTitles} đầu sách, ${bookSummary.available}/${bookSummary.totalCopies} bản còn sẵn\n- Mượn trả: ${loans.length} phiếu, ${overdue} quá hạn, ${dueSoon} sắp hạn\n- Đặt trước: ${waitingReservations} đang chờ, ${readyReservations} xử lý được ngay\n- Độc giả: ${readers.length} hồ sơ\n- Danh mục: ${(catalog.categories || []).length} thể loại, ${(catalog.publishers || []).length} nhà xuất bản`,
      target: "analytics",
      actionLabel: "Mở Phân tích",
    }, [
      askAction("Tạo việc hôm nay", "Tạo việc cần làm hôm nay"),
      askAction("Soạn nhắc trả", "Soạn tin nhắn nhắc trả"),
    ]);
  }

  if (query.includes("lap ke hoach") || query.includes("uu tien") || query.includes("can xu ly") || query.includes("hom nay")) {
    return withActions({
      text: `Mức vận hành hiện tại: ${urgency.label}. Kế hoạch đề xuất:\n${buildPriorityPlan(context).join("\n")}`,
      target: "operations",
      actionLabel: "Mở Vận hành",
    }, [
      askAction("Soạn nhắc trả", "Soạn tin nhắn nhắc trả"),
      askAction("Kiểm kho", "Kiểm kho sách sắp cạn"),
    ]);
  }

  if (query.includes("tim sach") || query.includes("kiem sach") || query.includes("tac gia") || query.includes("con hang")) {
    const matches = searchBooks(context, query);
    return withActions({
      text: `Kết quả sách phù hợp:\n${toList(matches, (book) => `${book.title} - ${book.author || "chưa rõ tác giả"}; ${book.category || "chưa phân loại"}; còn ${book.availableQuantity ?? 0} bản`)}`,
      target: "books",
      actionLabel: "Mở Kho sách",
    }, [askAction("Gợi ý sách", "Gợi ý sách nên giới thiệu")]);
  }

  if (query.includes("the loai") || query.includes("danh muc") || query.includes("nha xuat ban")) {
    const categoryStats = getCategoryStats(context).slice(0, 5);
    return withActions({
      text: `Danh mục nổi bật:\n${toList(categoryStats, (item) => `${item.category}: ${item.titles} đầu sách, ${item.available}/${item.copies} bản còn sẵn, ${item.loans} lượt mượn`)}\nNhà xuất bản đang có: ${(catalog.publishers || []).slice(0, 6).join(", ") || "chưa có dữ liệu"}.`,
      target: "catalog",
      actionLabel: "Mở Danh mục",
    }, [askAction("Kiểm kho", "Kiểm kho sách sắp cạn")]);
  }

  if (query.includes("doc gia") || query.includes("ban doc") || query.includes("tai khoan")) {
    const risks = getReaderRisks(context);
    return withActions({
      text: risks.length
        ? `Độc giả cần chú ý:\n${toList(risks, (reader) => `${reader.name || reader.email}: ${reader.overdue} quá hạn, ${reader.active} đang mượn, phạt ${formatCurrency(reader.fines)}`)}`
        : `Hiện có ${readers.length} hồ sơ độc giả. Chưa thấy độc giả rủi ro cao trong dữ liệu đang đọc được.`,
      target: "readers",
      actionLabel: "Mở Độc giả",
    }, [
      askAction("Soạn nhắc trả", "Soạn tin nhắn nhắc trả"),
      pageAction("Mở Quá hạn", "overdue"),
    ]);
  }

  if (query.includes("qua han") || query.includes("tre han") || query.includes("phat")) {
    const overdueLoans = loans.filter((loan) => loan.status === "overdue").slice(0, 5);
    return withActions({
      text:
        overdue > 0
          ? `Hiện có ${overdue} phiếu quá hạn, phạt dự kiến ${formatCurrency(stats.totalFines || 0)}.\n${toList(overdueLoans, (loan) => `${loan.readerName || "Độc giả"} - ${loan.bookTitle || "Sách"}; hạn trả ${loan.dueDate}; phạt ${formatCurrency(loan.fineAmount || 0)}`)}`
          : `Chưa có phiếu quá hạn. Có ${dueSoon} phiếu sắp đến hạn nên chỉ cần nhắc sớm.`,
      target: "overdue",
      actionLabel: "Mở Quá hạn",
    }, [
      askAction("Soạn nhắc trả", "Soạn tin nhắn nhắc trả"),
      pageAction("Mở Mượn / Trả", "borrow"),
    ]);
  }

  if (query.includes("muon") || query.includes("tra") || query.includes("phieu")) {
    const activeLoans = loans.filter((loan) => loan.status === "borrowed").slice(0, 5);
    return withActions({
      text: `Mượn trả hiện có ${loans.length} phiếu, ${activeLoans.length} phiếu đang hiển thị trong mẫu trả lời.\n${toList(activeLoans, (loan) => `${loan.readerName || "Độc giả"} đang mượn ${loan.bookTitle || "sách"}, hạn ${loan.dueDate}`)}`,
      target: "borrow",
      actionLabel: "Mở Mượn / Trả",
    }, [askAction("Soạn nhắc trả", "Soạn tin nhắn nhắc trả")]);
  }

  if (query.includes("dat truoc") || query.includes("reservation") || query.includes("hang cho")) {
    const waiting = reservations.filter((item) => item.status === "waiting").slice(0, 5);
    return withActions({
      text:
        waitingReservations > 0
          ? `Có ${waitingReservations} yêu cầu đặt trước đang chờ, ${readyReservations} yêu cầu có thể xử lý ngay.\n${toList(waiting, (item) => `${item.readerName || "Độc giả"} đặt ${item.bookTitle || "sách"}; còn ${item.availableQuantity || 0} bản`)}`
          : "Chưa có yêu cầu đặt trước đang chờ. Luồng đặt trước đang sạch.",
      target: "borrow",
      actionLabel: "Mở Mượn / Trả",
    }, [askAction("Tìm sách còn hàng", "Tìm sách còn hàng")]);
  }

  if (query.includes("goi y") || query.includes("gioi thieu") || query.includes("sach nen")) {
    const topBooks = recommendedBooks.slice(0, 4);
    return withActions({
      text: topBooks.length
        ? `Nên giới thiệu:\n${toList(topBooks, (book) => `${book.title} - ${book.recommendationReason || "phù hợp"}, còn ${book.availableQuantity || 0} bản`)}`
        : "Chưa đủ dữ liệu để gợi ý sách tốt. Khi có thêm lịch sử mượn hoặc đặt trước, hệ thống sẽ đề xuất chính xác hơn.",
      target: "books",
      actionLabel: "Mở Kho sách",
    }, [askAction("Thể loại nổi bật", "Thể loại nào nổi bật?")]);
  }

  if (query.includes("ton kho") || query.includes("sap can") || query.includes("het sach") || query.includes("kiem kho") || query.includes("anh bia")) {
    const bookSummary = summarizeBooks(context);
    return withActions({
      text: `Tình trạng kho:\n- ${bookSummary.available}/${bookSummary.totalCopies} bản còn sẵn\n- ${bookSummary.lowStock.length} đầu sách sắp cạn hoặc hết\n- ${bookSummary.missingImages.length} đầu sách thiếu ảnh bìa\n${toList(bookSummary.lowStock.slice(0, 5), (book) => `${book.title}: còn ${book.availableQuantity || 0}/${book.quantity || 0} bản`)}`,
      target: "books",
      actionLabel: "Mở Kho sách",
    }, [askAction("Gợi ý sách", "Gợi ý sách nên giới thiệu")]);
  }

  if (query.includes("nhat ky") || query.includes("hoat dong") || query.includes("log")) {
    return withActions({
      text: canManageLibrary
        ? `Nhật ký gần đây:\n${toList(activities.slice(0, 5), (activity) => `${activity.actor || "Hệ thống"} - ${activity.message || activity.type}`)}`
        : "Nhật ký hoạt động chỉ dành cho tài khoản quản trị/thủ thư.",
      target: canManageLibrary ? "activity" : "profile",
      actionLabel: canManageLibrary ? "Mở Nhật ký" : "Mở Hồ sơ",
    });
  }

  if (query.includes("phan quyen") || query.includes("vai tro") || query.includes("admin") || query.includes("thu thu")) {
    return withActions({
      text: isAdmin
        ? "Bạn có thể kiểm ma trận quyền, vai trò admin/thủ thư/độc giả và trạng thái tài khoản bị khóa trong trang Phân quyền."
        : canManageLibrary
          ? "Phân quyền và đổi vai trò chỉ dành cho admin. Tài khoản thủ thư có thể quản lý sách, độc giả và mượn trả trong phạm vi vận hành."
        : "Tài khoản độc giả chỉ dùng các chức năng tra cứu, mượn sách, đặt trước và hồ sơ cá nhân.",
      target: isAdmin ? "permissions" : canManageLibrary ? "readers" : "profile",
      actionLabel: isAdmin ? "Mở Phân quyền" : canManageLibrary ? "Mở Độc giả" : "Mở Hồ sơ",
    }, isAdmin ? [pageAction("Mở Độc giả", "readers")] : []);
  }

  const pageCommand = PAGE_COMMANDS.find((command) => command.keywords.some((keyword) => query.includes(keyword)));
  if (pageCommand) {
    return withActions({
      text: `Mình có thể mở nhanh trang phù hợp cho yêu cầu này: ${pageCommand.label.replace("Mở ", "")}.`,
      target: pageCommand.target,
      actionLabel: pageCommand.label,
    });
  }

  return withActions({
    text: "Mình có thể trả lời các mảng: kho sách, tìm sách, tác giả/thể loại, độc giả, phiếu mượn, quá hạn, đặt trước, tồn kho, báo cáo nhanh, danh mục, phân quyền, nhật ký và hướng dẫn thao tác.",
    target: "operations",
    actionLabel: "Mở Vận hành",
  }, [
    askAction("Báo cáo nhanh", "Báo cáo nhanh thư viện"),
    askAction("Việc hôm nay", "Tạo việc cần làm hôm nay"),
  ]);
}

function LibraryAssistant({ canManageLibrary = false, isAdmin = false, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState({ stats: null, notifications: [], refreshedAt: null });
  const [messages, setMessages] = useState(loadSavedMessages);

  const saveMessages = useCallback((updater) => {
    setMessages((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(next.slice(-18)));
      return next;
    });
  }, []);

  const refreshContext = useCallback(async () => {
    setLoading(true);
    try {
      const nextContext = {
        ...(await settleContext(canManageLibrary)),
        refreshedAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      };
      setContext(nextContext);
      return nextContext;
    } catch {
      return context;
    } finally {
      setLoading(false);
    }
  }, [canManageLibrary, context]);

  const ask = useCallback(
    async (question) => {
      const cleanQuestion = String(sanitizeVietnameseText(question) || "").trim();
      if (!cleanQuestion) return;

      setInput("");
      saveMessages((items) => [...items, { id: `user-${Date.now()}`, role: "user", text: cleanQuestion }]);

      const currentContext = context.stats ? context : await refreshContext();
      const answer = buildAnswer(cleanQuestion, currentContext, canManageLibrary, isAdmin);
      saveMessages((items) => [
        ...items,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          ...answer,
        },
      ]);
    },
    [canManageLibrary, context, isAdmin, refreshContext, saveMessages]
  );

  const assistantStatus = useMemo(() => getUrgency(context), [context]);

  const contextCards = useMemo(
    () => [
      { label: "Sách", value: context.books?.length || 0, tone: "info" },
      { label: "Độc giả", value: context.readers?.length || 0, tone: "info" },
      { label: "Quá hạn", value: context.stats?.overdue || 0, tone: Number(context.stats?.overdue || 0) > 0 ? "danger" : "success" },
    ],
    [context]
  );

  const handleAssistantAction = useCallback(
    async (action) => {
      if (!action) return;

      if (action.type === "navigate" && action.target) {
        onNavigate?.(action.target);
        return;
      }

      if (action.type === "ask" && action.prompt) {
        await ask(action.prompt);
        return;
      }

      if (action.type === "copy" && action.text) {
        try {
          if (!navigator.clipboard?.writeText) {
            throw new Error("Clipboard API is not available.");
          }

          await navigator.clipboard.writeText(action.text);
          saveMessages((items) => [
            ...items,
            {
              id: `assistant-copy-${Date.now()}`,
              role: "assistant",
              text: "Đã copy nội dung vào clipboard.",
              actions: [pageAction("Mở Mượn / Trả", "borrow")],
            },
          ]);
        } catch {
          saveMessages((items) => [
            ...items,
            {
              id: `assistant-copy-${Date.now()}`,
              role: "assistant",
              text: `Không copy tự động được. Bạn có thể dùng nội dung này:\n${action.text}`,
            },
          ]);
        }
      }
    },
    [ask, onNavigate, saveMessages]
  );

  const clearChat = () => {
    const fresh = [createWelcomeMessage()];
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(fresh));
    setMessages(fresh);
  };

  return (
    <div className={`library-assistant ${open ? "open" : ""}`}>
      {open && (
        <section className={"assistant-panel" + (context.stats ? " compact-ready" : "")} aria-label="Chatbot AI thư viện">
          <div className="assistant-header">
            <div className="assistant-orb" aria-hidden="true">
              <Sparkles size={18} />
            </div>
            <div>
              <span><Sparkles size={14} /> AI Library</span>
              <strong>Trợ lý đa mảng</strong>
              <small className={`assistant-status ${assistantStatus.tone}`}>{assistantStatus.label}</small>
            </div>
            <div className="assistant-header-actions">
              <button type="button" onClick={refreshContext} aria-label="Làm mới dữ liệu">
                <RefreshCw size={15} />
              </button>
              <button type="button" onClick={clearChat} aria-label="Xóa lịch sử chat">
                <Trash2 size={15} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng chatbot">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="assistant-context">
            {context.stats ? (
              <>
                {contextCards.map((card) => (
                  <button className={card.tone} type="button" key={card.label} onClick={() => ask(card.label)}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                  </button>
                ))}
              </>
            ) : (
              <button className="info wide" type="button" onClick={refreshContext}>
                <BrainCircuit size={16} />
                <span>Nạp dữ liệu đa mảng</span>
              </button>
            )}
          </div>

          <div className="assistant-messages">
            {messages.map((message) => (
              <article className={`assistant-message ${message.role}`} key={message.id}>
                <i>{message.role === "assistant" ? "AI" : "Bạn"}</i>
                <span>{message.text}</span>
                {message.role === "assistant" && (message.actions?.length > 0 || message.target) && (
                  <div className="assistant-actions">
                    {(message.actions?.length > 0
                      ? message.actions
                      : [pageAction(message.actionLabel || "Mở trang", message.target)]
                    ).map((action, index) => (
                      <button type="button" key={`${message.id}-action-${index}`} onClick={() => handleAssistantAction(action)}>
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {loading && <div className="assistant-thinking"><CheckCircle2 size={15} /> Đang đọc dữ liệu thư viện...</div>}
          </div>

          <div className="assistant-starters">
            {STARTER_PROMPTS.slice(0, 4).map((prompt) => (
              <button type="button" key={prompt} onClick={() => ask(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <form
            className="assistant-input"
            onSubmit={(event) => {
              event.preventDefault();
              ask(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Hỏi AI về sách, độc giả, mượn trả..."
            />
            <button type="submit" disabled={!input.trim()}>
              <Send size={16} />
            </button>
          </form>

          <div className="assistant-footer">
            {context.refreshedAt ? `Dữ liệu cập nhật lúc ${context.refreshedAt}` : "AI chạy nội bộ theo dữ liệu thư viện hiện có"}
          </div>
        </section>
      )}

      <button className="assistant-fab" type="button" onClick={() => setOpen((value) => !value)} aria-label="Mở chatbot AI">
        {open ? <X size={20} /> : <Bot size={21} />}
        {!open && <span>AI</span>}
      </button>
    </div>
  );
}

export default LibraryAssistant;

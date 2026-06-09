const http = require("http");
const crypto = require("crypto");
const { readData, writeData } = require("./database");

const PORT = Number(process.env.PORT || 4000);
const MAX_ACTIVE_LOANS_PER_READER = 5;
const DAILY_OVERDUE_FINE = 20000;
const SESSION_SECRET = process.env.SESSION_SECRET || "library-management-local-session-secret";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const ALLOW_INSECURE_DEV_HEADERS = process.env.ALLOW_INSECURE_DEV_HEADERS === "true";
const ALLOWED_HEADERS = "Content-Type, Authorization, x-auth-token, x-user-role, x-user-id, x-user-email";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  });
  res.end();
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Payload qua lon."));
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON khong hop le."));
      }
    });

    req.on("error", reject);
  });
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status || "active",
  };
}

function publicUserWithReader(data, user) {
  const reader = getReaderForUser(data, user);

  return {
    ...publicUser(user),
    readerId: reader?.id || null,
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signTokenPayload(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function createSessionToken(user) {
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      exp: Date.now() + SESSION_MAX_AGE_MS,
    })
  );
  return `${payload}.${signTokenPayload(payload)}`;
}

function readRequestToken(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return String(req.headers["x-auth-token"] || "").trim();
}

function verifySessionToken(data, req) {
  const token = readRequestToken(req);
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || signature !== signTokenPayload(payload)) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.sub || Date.now() > Number(session.exp || 0)) return null;

    const user = data.users.find((item) => item.id === Number(session.sub));
    if (!user || user.email !== session.email || user.role !== session.role) return null;
    if ((user.status || "active") === "locked") return null;

    return user;
  } catch {
    return null;
  }
}

function authResponse(data, user) {
  return {
    ...publicUserWithReader(data, user),
    token: createSessionToken(user),
  };
}

function getRequestUser(data, req) {
  const sessionUser = verifySessionToken(data, req);
  if (sessionUser) return sessionUser;

  if (!ALLOW_INSECURE_DEV_HEADERS) return null;

  const userId = Number(req.headers["x-user-id"]);
  const email = String(req.headers["x-user-email"] || "").trim().toLowerCase();

  if (Number.isInteger(userId) && userId > 0) {
    const userById = data.users.find((user) => user.id === userId);
    if (userById) return userById;
  }

  if (email) {
    return data.users.find((user) => user.email.toLowerCase() === email) || null;
  }

  return null;
}

function isAdminRequest(data, req) {
  return getRequestUser(data, req)?.role === "admin";
}

function isStaffRequest(data, req) {
  return ["admin", "librarian"].includes(getRequestUser(data, req)?.role);
}

function requireAdmin(data, req, res) {
  if (isStaffRequest(data, req)) {
    return true;
  }

  sendJson(res, 403, { error: "Chi quan tri vien hoac thu thu moi co quyen thuc hien thao tac nay." });
  return false;
}

function requireAdminOnly(data, req, res) {
  if (isAdminRequest(data, req)) {
    return true;
  }

  sendJson(res, 403, { error: "Chi admin moi co quyen thuc hien thao tac nay." });
  return false;
}

function getReaderForUser(data, user) {
  if (!user) return null;

  return (
    data.readers.find((reader) => reader.userId === user.id) ||
    data.readers.find((reader) => reader.email.toLowerCase() === user.email.toLowerCase()) ||
    null
  );
}

function getDefaultReaderProfileImageUrl(reader) {
  const seed = encodeURIComponent(reader?.name || reader?.fullName || reader?.email || `reader-${reader?.id || "new"}`);
  return `https://api.dicebear.com/9.x/initials/svg?seed=${seed}`;
}

function getActorLabel(data, req) {
  const user = getRequestUser(data, req);
  if (!user) return "He thong";
  return user.fullName || user.email || `User #${user.id}`;
}

function addActivity(data, req, type, message, metadata = {}) {
  const activities = Array.isArray(data.activities) ? data.activities : [];
  const activity = {
    id: nextId(activities),
    type,
    message,
    actor: getActorLabel(data, req),
    createdAt: new Date().toISOString(),
    metadata,
  };

  data.activities = [activity, ...activities].slice(0, 300);
  return activity;
}

function requireReaderForUser(data, req, res) {
  const user = getRequestUser(data, req);
  const reader = getReaderForUser(data, user);

  if (!user || !reader) {
    sendJson(res, 403, { error: "Khong tim thay ho so doc gia cua tai khoan dang nhap." });
    return null;
  }

  return reader;
}

function normalizeDate(date = new Date()) {
  return new Date(date).toISOString().split("T")[0];
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && normalizeDate(date) === value;
}

function isBeforeToday(value) {
  return new Date(value) < new Date(normalizeDate());
}

function activeLoanCount(loans, bookId) {
  return loans.filter((loan) => loan.bookId === bookId && loan.status !== "returned").length;
}

function getBookAverageRating(data, bookId) {
  const reviews = (data.reviews || []).filter((review) => review.bookId === bookId);
  if (reviews.length === 0) return { averageRating: 0, reviewCount: 0 };

  const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
  return {
    averageRating: Math.round((total / reviews.length) * 10) / 10,
    reviewCount: reviews.length,
  };
}

function decorateReservations(data) {
  return (data.reservations || []).map((reservation) => {
    const reader = data.readers.find((item) => item.id === reservation.readerId);
    const book = data.books.find((item) => item.id === reservation.bookId);

    return {
      ...reservation,
      readerName: reader?.name || "Khong ro doc gia",
      readerEmail: reader?.email || "",
      bookTitle: book?.title || "Khong ro sach",
      availableQuantity: book ? Math.max(0, Number(book.quantity || 0) - activeLoanCount(data.loans, book.id)) : 0,
    };
  });
}

function decorateReviews(data) {
  return (data.reviews || []).map((review) => {
    const reader = data.readers.find((item) => item.id === review.readerId);
    const book = data.books.find((item) => item.id === review.bookId);

    return {
      ...review,
      readerName: reader?.name || "Khong ro doc gia",
      bookTitle: book?.title || "Khong ro sach",
    };
  });
}

function decorateBooks(data) {
  return data.books.map((book) => ({
    ...book,
    isbn: book.isbn || "",
    condition: book.condition || "good",
    ...getBookAverageRating(data, book.id),
    availableQuantity: Math.max(0, Number(book.quantity) - activeLoanCount(data.loans, book.id)),
  }));
}

function decorateReaders(data) {
  return data.readers.map((reader) => {
    const user =
      (reader.userId && data.users.find((item) => item.id === reader.userId)) ||
      data.users.find((item) => item.email.toLowerCase() === reader.email.toLowerCase());

    return {
      ...reader,
      profileImageUrl: reader.profileImageUrl || getDefaultReaderProfileImageUrl(reader),
      userId: user?.id || reader.userId || null,
      accountRole: user?.role || "member",
      accountStatus: user?.status || "active",
      hasAccount: Boolean(user),
      booksBorrowed: data.loans.filter(
        (loan) => loan.readerId === reader.id && loan.status !== "returned"
      ).length,
    };
  });
}

function getLoanStatus(loan) {
  if (loan.status === "returned") {
    return "returned";
  }

  return new Date(loan.dueDate) < new Date(normalizeDate()) ? "overdue" : "borrowed";
}

function getLateDays(loan) {
  const status = getLoanStatus(loan);
  if (status !== "overdue") {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((new Date(normalizeDate()) - new Date(loan.dueDate)) / (1000 * 60 * 60 * 24))
  );
}

function decorateLoans(data) {
  return data.loans.map((loan) => {
    const reader = data.readers.find((item) => item.id === loan.readerId);
    const book = data.books.find((item) => item.id === loan.bookId);
    const lateDays = getLateDays(loan);

    return {
      ...loan,
      status: getLoanStatus(loan),
      readerName: reader?.name || "Khong ro doc gia",
      readerEmail: reader?.email || "",
      readerPhone: reader?.phone || "",
      bookTitle: book?.title || "Khong ro sach",
      lateDays,
      fineAmount: lateDays * DAILY_OVERDUE_FINE,
      fineStatus: loan.fineStatus || (lateDays > 0 ? "unpaid" : "none"),
      finePaidDate: loan.finePaidDate || null,
      fineHandledBy: loan.fineHandledBy || "",
      finePaymentMethod: loan.finePaymentMethod || "",
      finePaymentBank: loan.finePaymentBank || "",
      fineTransactionCode: loan.fineTransactionCode || "",
      finePaymentNote: loan.finePaymentNote || "",
      finePaymentSubmittedBy: loan.finePaymentSubmittedBy || "",
      finePaymentConfirmedAt: loan.finePaymentConfirmedAt || null,
    };
  });
}

function buildNotifications(data, req) {
  const loans = decorateLoans(data);
  const reservations = decorateReservations(data);
  const isStaff = isStaffRequest(data, req);
  const reader = isStaff ? null : getReaderForUser(data, getRequestUser(data, req));
  const visibleLoans = isStaff ? loans : loans.filter((loan) => loan.readerId === reader?.id);
  const visibleReservations = isStaff
    ? reservations
    : reservations.filter((reservation) => reservation.readerId === reader?.id);
  const today = new Date(normalizeDate());
  const dueSoonLimit = new Date(today);
  dueSoonLimit.setDate(dueSoonLimit.getDate() + 3);

  const overdueItems = visibleLoans
    .filter((loan) => loan.status === "overdue")
    .map((loan) => ({
      id: `loan-overdue-${loan.id}`,
      type: "overdue",
      tone: "danger",
      title: isStaff ? `${loan.readerName} quá hạn ${loan.lateDays} ngày` : `Sách quá hạn ${loan.lateDays} ngày`,
      message: `${loan.bookTitle} - hạn trả ${loan.dueDate}.`,
      target: "borrow",
      createdAt: loan.dueDate,
    }));

  const dueSoonItems = visibleLoans
    .filter((loan) => {
      if (loan.status !== "borrowed") return false;
      const dueDate = new Date(loan.dueDate);
      return dueDate >= today && dueDate <= dueSoonLimit;
    })
    .map((loan) => ({
      id: `loan-due-${loan.id}`,
      type: "due_soon",
      tone: "warning",
      title: isStaff ? `${loan.readerName} sắp đến hạn` : "Sách sắp đến hạn",
      message: `${loan.bookTitle} - hạn trả ${loan.dueDate}.`,
      target: "borrow",
      createdAt: loan.dueDate,
    }));

  const reservationItems = visibleReservations
    .filter((reservation) => reservation.status === "waiting" && Number(reservation.availableQuantity || 0) > 0)
    .map((reservation) => ({
      id: `reservation-ready-${reservation.id}`,
      type: "reservation_ready",
      tone: "success",
      title: isStaff ? `Có thể xử lý đặt trước #${reservation.id}` : "Sách đặt trước đã sẵn sàng",
      message: `${reservation.bookTitle} hiện còn ${reservation.availableQuantity} bản.`,
      target: "borrow",
      createdAt: reservation.createdAt,
    }));

  return [...overdueItems, ...dueSoonItems, ...reservationItems].slice(0, 20);
}

function validateBook(input) {
  const title = String(input.title || "").trim();
  const author = String(input.author || "").trim();
  const category = String(input.category || "").trim();
  const quantity = Number(input.quantity);
  const imageUrl = String(input.imageUrl || input.coverImage || "").trim();

  if (!title || !author || !category || !Number.isFinite(quantity) || quantity < 0) {
    return { error: "Vui long nhap ten sach, tac gia, the loai va so luong hop le." };
  }

  if (imageUrl && !/^https?:\/\/.+/i.test(imageUrl)) {
    return { error: "Anh sach phai la duong dan http hoac https hop le." };
  }

  return {
    book: {
      title,
      imageUrl,
      author,
      category,
      publisher: String(input.publisher || "").trim(),
      year: input.year === undefined || input.year === null ? "" : String(input.year).trim(),
      quantity,
      isbn: String(input.isbn || "").trim(),
      condition: ["good", "damaged", "lost", "repair"].includes(String(input.condition || "good"))
        ? String(input.condition || "good")
        : "good",
      shelfLocation: String(input.shelfLocation || "").trim(),
      description: String(input.description || "").trim(),
    },
  };
}

function validateReader(input) {
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const phone = String(input.phone || "").trim();
  const profileImageUrl = String(
    input.profileImageUrl || input.avatarUrl || input.imageUrl || input.photoUrl || ""
  ).trim();

  if (!name || !email || !email.includes("@")) {
    return { error: "Vui long nhap ho ten va email doc gia hop le." };
  }

  if (!profileImageUrl) {
    return { error: "Vui long nhap URL anh profile cho doc gia." };
  }

  if (!/^https?:\/\/.+/i.test(profileImageUrl)) {
    return { error: "URL anh profile phai bat dau bang http:// hoac https://." };
  }

  return {
    reader: {
      name,
      email,
      phone,
      profileImageUrl,
    },
  };
}

function validateAuthInput(input, mode) {
  const fullName = String(input.fullName || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");

  if (mode === "register" && !fullName) {
    return { error: "Vui long nhap ho ten." };
  }

  if (!email || !email.includes("@") || password.length < 6) {
    return { error: "Email hoac mat khau khong hop le. Mat khau toi thieu 6 ky tu." };
  }

  return { fullName, email, password };
}

async function handleAuth(req, res, pathname) {
  const data = await readData();
  const isLoginPath = pathname === "/api/auth/login" || pathname === "/auth/login" || pathname === "/login";
  const isRegisterPath =
    pathname === "/api/auth/register" || pathname === "/auth/register" || pathname === "/register";

  if (req.method === "POST" && isLoginPath) {
    const body = await parseBody(req);
    const validation = validateAuthInput(body, "login");

    if (validation.error) {
      sendJson(res, 400, { error: validation.error });
      return;
    }

    const user = data.users.find((item) => item.email.toLowerCase() === validation.email);
    if (!user || user.passwordHash !== hashPassword(validation.password)) {
      sendJson(res, 401, { error: "Email hoac mat khau khong dung." });
      return;
    }

    if ((user.status || "active") === "locked") {
      sendJson(res, 403, { error: "Tai khoan dang bi khoa. Vui long lien he quan tri vien." });
      return;
    }

    sendJson(res, 200, authResponse(data, user));
    return;
  }

  if (req.method === "POST" && isRegisterPath) {
    const body = await parseBody(req);
    const validation = validateAuthInput(body, "register");

    if (validation.error) {
      sendJson(res, 400, { error: validation.error });
      return;
    }

    const exists = data.users.some((item) => item.email.toLowerCase() === validation.email);
    if (exists) {
      sendJson(res, 409, { error: "Email da duoc dang ky." });
      return;
    }

    const user = {
      id: nextId(data.users),
      fullName: validation.fullName,
      email: validation.email,
      passwordHash: hashPassword(validation.password),
      role: "user",
    };

    data.users.push(user);
    data.readers.push({
      id: nextId(data.readers),
      name: user.fullName,
      email: user.email,
      phone: String(body.phone || "").trim(),
      profileImageUrl: getDefaultReaderProfileImageUrl(user),
      userId: user.id,
    });
    addActivity(data, req, "reader.created", `Dang ky doc gia moi: ${user.fullName}.`, {
      userId: user.id,
      email: user.email,
    });
    await writeData(data);
    sendJson(res, 201, authResponse(data, user));
    return;
  }

  sendJson(res, 404, { error: "Khong tim thay API xac thuc." });
}

async function handleBooks(req, res, pathname) {
  const data = await readData();
  const idMatch = pathname.match(/^\/api\/books\/(\d+)$/);

  if (req.method === "GET" && pathname === "/api/books") {
    sendJson(res, 200, decorateBooks(data));
    return;
  }

  if (req.method === "POST" && pathname === "/api/books") {
    if (!requireAdmin(data, req, res)) return;

    const body = await parseBody(req);
    const { book, error } = validateBook(body);

    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    const createdBook = { id: nextId(data.books), ...book };
    data.books.push(createdBook);
    addActivity(data, req, "book.created", `Them sach moi: ${createdBook.title}.`, {
      bookId: createdBook.id,
      title: createdBook.title,
      after: createdBook,
    });
    await writeData(data);
    sendJson(res, 201, { ...createdBook, availableQuantity: createdBook.quantity });
    return;
  }

  if (req.method === "POST" && pathname === "/api/books/bulk") {
    if (!requireAdmin(data, req, res)) return;

    const body = await parseBody(req);
    if (!Array.isArray(body) || body.length === 0) {
      sendJson(res, 400, { error: "Vui long gui mot mang cac sach hop le." });
      return;
    }

    const createdBooks = [];
    for (const item of body) {
      const { book, error } = validateBook(item);
      if (error) {
        sendJson(res, 400, { error: `Loi du lieu sach: ${error}` });
        return;
      }
      const createdBook = { id: nextId(data.books), ...book };
      data.books.push(createdBook);
      createdBooks.push({ ...createdBook, availableQuantity: createdBook.quantity });
    }

    addActivity(data, req, "book.bulk_created", `Nhap nhanh ${createdBooks.length} sach.`, {
      count: createdBooks.length,
    });
    await writeData(data);
    sendJson(res, 201, createdBooks);
    return;
  }

  if (req.method === "PUT" && idMatch) {
    if (!requireAdmin(data, req, res)) return;

    const bookId = Number(idMatch[1]);
    const existingIndex = data.books.findIndex((book) => book.id === bookId);

    if (existingIndex === -1) {
      sendJson(res, 404, { error: "Khong tim thay sach." });
      return;
    }

    const body = await parseBody(req);
    const { book, error } = validateBook(body);

    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    const borrowedCount = activeLoanCount(data.loans, bookId);
    if (book.quantity < borrowedCount) {
      sendJson(res, 400, {
        error: `So luong khong duoc nho hon so sach dang muon (${borrowedCount}).`,
      });
      return;
    }

    const beforeBook = data.books[existingIndex];
    data.books[existingIndex] = { id: bookId, ...book };
    addActivity(data, req, "book.updated", `Cap nhat sach: ${book.title}.`, {
      bookId,
      title: book.title,
      before: beforeBook,
      after: data.books[existingIndex],
    });
    await writeData(data);
    sendJson(res, 200, decorateBooks(data).find((item) => item.id === bookId));
    return;
  }

  if (req.method === "DELETE" && idMatch) {
    if (!requireAdmin(data, req, res)) return;

    const bookId = Number(idMatch[1]);
    const hasActiveLoan = data.loans.some(
      (loan) => loan.bookId === bookId && loan.status !== "returned"
    );

    if (hasActiveLoan) {
      sendJson(res, 400, { error: "Khong the xoa sach dang duoc muon." });
      return;
    }

    const beforeCount = data.books.length;
    const deletedBook = data.books.find((book) => book.id === bookId);
    data.books = data.books.filter((book) => book.id !== bookId);

    if (data.books.length === beforeCount) {
      sendJson(res, 404, { error: "Khong tim thay sach." });
      return;
    }

    addActivity(data, req, "book.deleted", `Xoa sach: ${deletedBook?.title || `#${bookId}`}.`, {
      bookId,
      title: deletedBook?.title || "",
      before: deletedBook || null,
    });
    await writeData(data);
    sendNoContent(res);
    return;
  }

  sendJson(res, 404, { error: "Khong tim thay API sach." });
}

async function handleReaders(req, res, pathname) {
  const data = await readData();
  const accountMatch = pathname.match(/^\/api\/readers\/([^/]+)\/account$/);
  const loansMatch = pathname.match(/^\/(?:api\/)?readers\/([^/]+)\/loans$/);
  const idMatch = pathname.match(/^\/(?:api\/)?readers\/([^/]+)$/);

  if (req.method === "GET" && pathname === "/api/readers") {
    if (isStaffRequest(data, req)) {
      sendJson(res, 200, decorateReaders(data));
      return;
    }

    const reader = requireReaderForUser(data, req, res);
    if (!reader) return;

    sendJson(
      res,
      200,
      decorateReaders({
        ...data,
        readers: [reader],
      })
    );
    return;
  }

  if (req.method === "PATCH" && accountMatch) {
    if (!requireAdmin(data, req, res)) return;

    const readerId = Number(accountMatch[1]);
    const reader = data.readers.find((item) => item.id === readerId);
    if (!reader) {
      sendJson(res, 404, { error: "Khong tim thay doc gia." });
      return;
    }

    const user =
      (reader.userId && data.users.find((item) => item.id === reader.userId)) ||
      data.users.find((item) => item.email.toLowerCase() === reader.email.toLowerCase());

    if (!user) {
      sendJson(res, 400, { error: "Doc gia nay chua co tai khoan dang nhap de khoa/mo." });
      return;
    }

    const body = await parseBody(req);
    const status = body.status === undefined ? undefined : String(body.status || "").trim().toLowerCase();
    const role = body.role === undefined ? undefined : String(body.role || "").trim().toLowerCase();

    if (status !== undefined && !["active", "locked"].includes(status)) {
      sendJson(res, 400, { error: "Trang thai tai khoan khong hop le." });
      return;
    }

    if (user.role === "admin" && status === "locked") {
      sendJson(res, 400, { error: "Khong the khoa tai khoan admin." });
      return;
    }

    if (role !== undefined) {
      if (!requireAdminOnly(data, req, res)) return;

      if (!["admin", "librarian", "user", "member"].includes(role)) {
        sendJson(res, 400, { error: "Vai tro tai khoan khong hop le." });
        return;
      }
    }

    if (status === undefined && role === undefined) {
      sendJson(res, 400, { error: "Vui long gui trang thai hoac vai tro can cap nhat." });
      return;
    }

    const before = { id: user.id, status: user.status || "active", role: user.role || "user" };

    if (status !== undefined) {
      user.status = status;
    }

    if (role !== undefined) {
      user.role = role === "member" ? "user" : role;
    }

    const changedStatus = status !== undefined && before.status !== user.status;
    const changedRole = role !== undefined && before.role !== user.role;
    const activityType = changedRole
      ? "reader.role_updated"
      : status === "locked"
      ? "reader.locked"
      : "reader.unlocked";
    const activityMessage = changedRole
      ? `Cap nhat vai tro tai khoan doc gia: ${reader.name} thanh ${user.role}.`
      : `${status === "locked" ? "Khoa" : "Mo khoa"} tai khoan doc gia: ${reader.name}.`;

    addActivity(data, req, activityType, activityMessage, {
      readerId: reader.id,
      readerName: reader.name,
      userId: user.id,
      email: user.email,
      before,
      after: { id: user.id, status: user.status || "active", role: user.role || "user" },
      changedStatus,
      changedRole,
    });
    await writeData(data);
    sendJson(res, 200, decorateReaders(data).find((item) => item.id === readerId));
    return;
  }

  if (req.method === "GET" && loansMatch) {
    const readerId = Number(loansMatch[1]);
    if (!Number.isInteger(readerId) || readerId <= 0) {
      sendJson(res, 400, { error: "Ma doc gia khong hop le." });
      return;
    }

    const reader = data.readers.find((item) => item.id === readerId);
    if (!reader) {
      sendJson(res, 404, { error: "Khong tim thay doc gia." });
      return;
    }

    if (!isStaffRequest(data, req)) {
      const currentReader = requireReaderForUser(data, req, res);
      if (!currentReader) return;

      if (currentReader.id !== readerId) {
        sendJson(res, 403, { error: "Ban chi duoc xem lich su muon cua chinh minh." });
        return;
      }
    }

    sendJson(
      res,
      200,
      decorateLoans(data)
        .filter((loan) => loan.readerId === readerId)
        .sort((first, second) => second.id - first.id)
    );
    return;
  }

  if (req.method === "POST" && pathname === "/api/readers") {
    if (!requireAdmin(data, req, res)) return;

    const body = await parseBody(req);
    const { reader, error } = validateReader(body);

    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    const emailExists = data.readers.some((item) => item.email.toLowerCase() === reader.email);
    if (emailExists) {
      sendJson(res, 409, { error: "Email doc gia da ton tai." });
      return;
    }

    const createdReader = { id: nextId(data.readers), ...reader };
    data.readers.push(createdReader);
    addActivity(data, req, "reader.created", `Them doc gia moi: ${createdReader.name}.`, {
      readerId: createdReader.id,
      email: createdReader.email,
      readerName: createdReader.name,
      after: createdReader,
    });
    await writeData(data);
    sendJson(res, 201, { ...createdReader, booksBorrowed: 0 });
    return;
  }

  if (req.method === "POST" && pathname === "/api/readers/bulk") {
    if (!requireAdmin(data, req, res)) return;

    const body = await parseBody(req);
    if (!Array.isArray(body) || body.length === 0) {
      sendJson(res, 400, { error: "Vui long gui mot mang doc gia hop le." });
      return;
    }

    const createdReaders = [];
    const seenEmails = new Set(data.readers.map((reader) => reader.email.toLowerCase()));

    for (const item of body) {
      const { reader, error } = validateReader(item);
      if (error) {
        sendJson(res, 400, { error: `Loi du lieu doc gia: ${error}` });
        return;
      }

      if (seenEmails.has(reader.email)) {
        sendJson(res, 409, { error: `Email doc gia da ton tai: ${reader.email}` });
        return;
      }

      const createdReader = { id: nextId(data.readers), ...reader };
      data.readers.push(createdReader);
      seenEmails.add(reader.email);
      createdReaders.push({ ...createdReader, booksBorrowed: 0, accountStatus: "active", hasAccount: false });
    }

    addActivity(data, req, "reader.bulk_created", `Nhap nhanh ${createdReaders.length} doc gia.`, {
      count: createdReaders.length,
      after: createdReaders,
    });
    await writeData(data);
    sendJson(res, 201, createdReaders);
    return;
  }

  if (req.method === "PUT" && idMatch) {
    if (!requireAdmin(data, req, res)) return;

    const readerId = Number(idMatch[1]);
    if (!Number.isInteger(readerId) || readerId <= 0) {
      sendJson(res, 400, { error: "Ma doc gia khong hop le." });
      return;
    }

    const existingIndex = data.readers.findIndex((reader) => reader.id === readerId);

    if (existingIndex === -1) {
      sendJson(res, 404, { error: "Khong tim thay doc gia." });
      return;
    }

    const body = await parseBody(req);
    const { reader, error } = validateReader(body);

    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    const emailExists = data.readers.some(
      (item) => item.id !== readerId && item.email.toLowerCase() === reader.email
    );
    if (emailExists) {
      sendJson(res, 409, { error: "Email doc gia da ton tai." });
      return;
    }

    const currentReader = data.readers[existingIndex];
    data.readers[existingIndex] = { ...currentReader, ...reader, id: readerId };

    if (currentReader.userId) {
      const user = data.users.find((item) => item.id === currentReader.userId);
      if (user) {
        user.fullName = reader.name;
        user.email = reader.email;
      }
    }

    addActivity(data, req, "reader.updated", `Cap nhat doc gia: ${reader.name}.`, {
      readerId,
      email: reader.email,
      readerName: reader.name,
      before: currentReader,
      after: data.readers[existingIndex],
    });
    await writeData(data);
    sendJson(res, 200, decorateReaders(data).find((item) => item.id === readerId));
    return;
  }

  if (req.method === "DELETE" && idMatch) {
    if (!requireAdmin(data, req, res)) return;

    const readerId = Number(idMatch[1]);
    if (!Number.isInteger(readerId) || readerId <= 0) {
      sendJson(res, 400, { error: "Ma doc gia khong hop le." });
      return;
    }

    const hasActiveLoan = data.loans.some(
      (loan) => loan.readerId === readerId && loan.status !== "returned"
    );

    if (hasActiveLoan) {
      sendJson(res, 400, { error: "Khong the xoa doc gia dang muon sach." });
      return;
    }

    const hasUnpaidFine = decorateLoans(data).some(
      (loan) => loan.readerId === readerId && Number(loan.fineAmount || 0) > 0 && loan.fineStatus === "unpaid"
    );
    if (hasUnpaidFine) {
      sendJson(res, 400, { error: "Khong the xoa doc gia con tien phat chua thu." });
      return;
    }

    const hasWaitingReservation = (data.reservations || []).some(
      (reservation) => reservation.readerId === readerId && reservation.status === "waiting"
    );
    if (hasWaitingReservation) {
      sendJson(res, 400, { error: "Khong the xoa doc gia con yeu cau dat truoc dang cho." });
      return;
    }

    const beforeCount = data.readers.length;
    const deletedReader = data.readers.find((reader) => reader.id === readerId);
    data.readers = data.readers.filter((reader) => reader.id !== readerId);

    if (data.readers.length === beforeCount) {
      sendJson(res, 404, { error: "Khong tim thay doc gia." });
      return;
    }

    data.loans = data.loans.filter((loan) => loan.readerId !== readerId);
    addActivity(data, req, "reader.deleted", `Xoa doc gia: ${deletedReader?.name || `#${readerId}`}.`, {
      readerId,
      email: deletedReader?.email || "",
      readerName: deletedReader?.name || "",
      before: deletedReader || null,
    });
    await writeData(data);
    sendNoContent(res);
    return;
  }

  sendJson(res, 404, { error: `Khong tim thay API doc gia: ${req.method} ${pathname}` });
}

async function handleLoans(req, res, pathname) {
  const data = await readData();
  const returnMatch = pathname.match(/^\/api\/loans\/(\d+)\/return$/);
  const extendMatch = pathname.match(/^\/api\/loans\/(\d+)\/extend$/);
  const fineMatch = pathname.match(/^\/api\/loans\/(\d+)\/fine$/);

  if (req.method === "GET" && pathname === "/api/loans") {
    const loans = decorateLoans(data);

    if (isStaffRequest(data, req)) {
      sendJson(res, 200, loans);
      return;
    }

    const reader = requireReaderForUser(data, req, res);
    if (!reader) return;

    sendJson(res, 200, loans.filter((loan) => loan.readerId === reader.id));
    return;
  }

  if (req.method === "POST" && pathname === "/api/loans") {
    const body = await parseBody(req);
    const reader = isStaffRequest(data, req)
      ? data.readers.find((item) => item.id === Number(body.readerId))
      : requireReaderForUser(data, req, res);

    if (!reader) return;

    const readerId = reader.id;
    const bookId = Number(body.bookId);
    const dueDate = String(body.dueDate || "").trim();
    const book = data.books.find((item) => item.id === bookId);

    if (!reader || !book || !dueDate) {
      sendJson(res, 400, { error: "Doc gia, sach hoac han tra khong hop le." });
      return;
    }

    if (!isValidDateString(dueDate) || isBeforeToday(dueDate)) {
      sendJson(res, 400, { error: "Han tra phai la ngay hop le va khong duoc trong qua khu." });
      return;
    }

    const activeReaderLoans = data.loans.filter(
      (loan) => loan.readerId === readerId && loan.status !== "returned"
    ).length;
    if (activeReaderLoans >= MAX_ACTIVE_LOANS_PER_READER) {
      sendJson(res, 400, {
        error: `Doc gia da muon toi da ${MAX_ACTIVE_LOANS_PER_READER} sach.`,
      });
      return;
    }

    const duplicateActiveLoan = data.loans.some(
      (loan) => loan.readerId === readerId && loan.bookId === bookId && loan.status !== "returned"
    );
    if (duplicateActiveLoan) {
      sendJson(res, 400, { error: "Doc gia dang muon sach nay, khong the tao phieu trung." });
      return;
    }

    const availableQuantity = Number(book.quantity) - activeLoanCount(data.loans, bookId);
    if (availableQuantity <= 0) {
      sendJson(res, 400, { error: "Sach da het, khong the tao phieu muon." });
      return;
    }

    if (["lost", "repair"].includes(book.condition || "good")) {
      sendJson(res, 400, { error: "Sach dang o trang thai khong the cho muon." });
      return;
    }

    const loan = {
      id: nextId(data.loans),
      readerId,
      bookId,
      borrowedDate: normalizeDate(),
      dueDate,
      returnedDate: null,
      status: "borrowed",
      fineStatus: "none",
      finePaidDate: null,
      fineHandledBy: "",
      finePaymentMethod: "",
      finePaymentBank: "",
      fineTransactionCode: "",
      finePaymentNote: "",
      finePaymentSubmittedBy: "",
      finePaymentConfirmedAt: null,
    };

    data.loans.push(loan);
    addActivity(data, req, "loan.created", `Tao phieu muon #${loan.id}: ${reader.name} muon ${book.title}.`, {
      loanId: loan.id,
      readerId,
      bookId,
      dueDate,
    });
    await writeData(data);
    sendJson(res, 201, decorateLoans(data).find((item) => item.id === loan.id));
    return;
  }

  if (req.method === "PATCH" && fineMatch) {
    const loanId = Number(fineMatch[1]);
    const loan = data.loans.find((item) => item.id === loanId);
    if (!loan) {
      sendJson(res, 404, { error: "Khong tim thay phieu muon." });
      return;
    }

    const body = await parseBody(req);
    const fineStatus = String(body.fineStatus || "").trim().toLowerCase();
    if (!["unpaid", "paid", "waived", "none"].includes(fineStatus)) {
      sendJson(res, 400, { error: "Trang thai tien phat khong hop le." });
      return;
    }

    const isStaff = isStaffRequest(data, req);
    if (!isStaff) {
      const reader = requireReaderForUser(data, req, res);
      if (!reader) return;

      if (loan.readerId !== reader.id) {
        sendJson(res, 403, { error: "Ban chi co the thanh toan tien phat cua chinh minh." });
        return;
      }

      if (fineStatus !== "paid") {
        sendJson(res, 403, { error: "Doc gia chi co the nop phat online, khong the mien hoac doi trang thai phat." });
        return;
      }
    }

    const paymentMethod = String(body.paymentMethod || "").trim().toLowerCase();
    const bankName = String(body.bankName || "").trim();
    const transactionCode = String(body.transactionCode || "").trim();
    const paymentNote = String(body.paymentNote || "").trim();

    if (fineStatus === "paid") {
      if (paymentMethod !== "bank_transfer") {
        sendJson(res, 400, { error: "Vui long chon hinh thuc thanh toan chuyen khoan ngan hang." });
        return;
      }

      if (!bankName || !transactionCode) {
        sendJson(res, 400, { error: "Vui long nhap ngan hang va ma giao dich thanh toan." });
        return;
      }
    }

    const before = {
      fineStatus: loan.fineStatus || "none",
      finePaidDate: loan.finePaidDate || null,
      fineHandledBy: loan.fineHandledBy || "",
      finePaymentMethod: loan.finePaymentMethod || "",
      finePaymentBank: loan.finePaymentBank || "",
      fineTransactionCode: loan.fineTransactionCode || "",
      finePaymentNote: loan.finePaymentNote || "",
      finePaymentSubmittedBy: loan.finePaymentSubmittedBy || "",
      finePaymentConfirmedAt: loan.finePaymentConfirmedAt || null,
    };
    loan.fineStatus = fineStatus;
    loan.finePaidDate = fineStatus === "paid" ? normalizeDate() : null;
    loan.fineHandledBy = fineStatus === "paid" || fineStatus === "waived" ? getActorLabel(data, req) : "";
    loan.finePaymentMethod = fineStatus === "paid" ? paymentMethod : "";
    loan.finePaymentBank = fineStatus === "paid" ? bankName : "";
    loan.fineTransactionCode = fineStatus === "paid" ? transactionCode : "";
    loan.finePaymentNote = fineStatus === "paid" ? paymentNote : "";
    loan.finePaymentSubmittedBy = fineStatus === "paid" ? getActorLabel(data, req) : "";
    loan.finePaymentConfirmedAt = fineStatus === "paid" ? new Date().toISOString() : null;

    addActivity(data, req, "loan.fine_updated", `Cap nhat tien phat phieu #${loan.id}: ${fineStatus}${fineStatus === "paid" ? " qua chuyen khoan ngan hang" : ""}.`, {
      loanId,
      readerId: loan.readerId,
      bookId: loan.bookId,
      before,
      after: {
        fineStatus: loan.fineStatus,
        finePaidDate: loan.finePaidDate,
        fineHandledBy: loan.fineHandledBy,
        finePaymentMethod: loan.finePaymentMethod,
        finePaymentBank: loan.finePaymentBank,
        fineTransactionCode: loan.fineTransactionCode,
        finePaymentNote: loan.finePaymentNote,
        finePaymentSubmittedBy: loan.finePaymentSubmittedBy,
        finePaymentConfirmedAt: loan.finePaymentConfirmedAt,
      },
    });
    await writeData(data);
    sendJson(res, 200, decorateLoans(data).find((item) => item.id === loanId));
    return;
  }

  if (req.method === "PATCH" && extendMatch) {
    const loanId = Number(extendMatch[1]);
    const loan = data.loans.find((item) => item.id === loanId);

    if (!loan) {
      sendJson(res, 404, { error: "Khong tim thay phieu muon." });
      return;
    }

    if (!isStaffRequest(data, req)) {
      const reader = requireReaderForUser(data, req, res);
      if (!reader) return;

      if (loan.readerId !== reader.id) {
        sendJson(res, 403, { error: "Ban chi duoc gia han phieu muon cua chinh minh." });
        return;
      }
    }

    if (loan.status === "returned") {
      sendJson(res, 400, { error: "Khong the gia han phieu muon da tra." });
      return;
    }

    const body = await parseBody(req);
    const dueDate = String(body.dueDate || "").trim();

    if (!isValidDateString(dueDate) || isBeforeToday(dueDate)) {
      sendJson(res, 400, { error: "Han tra moi phai la ngay hop le va khong duoc trong qua khu." });
      return;
    }

    if (new Date(dueDate) <= new Date(loan.dueDate)) {
      sendJson(res, 400, { error: "Han tra moi phai lon hon han tra hien tai." });
      return;
    }

    loan.dueDate = dueDate;
    const reader = data.readers.find((item) => item.id === loan.readerId);
    const book = data.books.find((item) => item.id === loan.bookId);
    addActivity(data, req, "loan.extended", `Gia han phieu #${loan.id} den ${dueDate}.`, {
      loanId,
      readerId: loan.readerId,
      readerName: reader?.name || "",
      bookId: loan.bookId,
      bookTitle: book?.title || "",
      dueDate,
    });
    await writeData(data);
    sendJson(res, 200, decorateLoans(data).find((item) => item.id === loanId));
    return;
  }

  if (req.method === "PATCH" && returnMatch) {
    const loanId = Number(returnMatch[1]);
    const loan = data.loans.find((item) => item.id === loanId);

    if (!loan) {
      sendJson(res, 404, { error: "Khong tim thay phieu muon." });
      return;
    }

    if (!isStaffRequest(data, req)) {
      const reader = requireReaderForUser(data, req, res);
      if (!reader) return;

      if (loan.readerId !== reader.id) {
        sendJson(res, 403, { error: "Ban chi duoc tra sach cua chinh minh." });
        return;
      }
    }

    loan.status = "returned";
    loan.returnedDate = normalizeDate();
    const reader = data.readers.find((item) => item.id === loan.readerId);
    const book = data.books.find((item) => item.id === loan.bookId);
    addActivity(data, req, "loan.returned", `Tra sach phieu #${loan.id}: ${book?.title || "khong ro sach"}.`, {
      loanId,
      readerId: loan.readerId,
      readerName: reader?.name || "",
      bookId: loan.bookId,
      bookTitle: book?.title || "",
      returnedDate: loan.returnedDate,
    });
    await writeData(data);
    sendJson(res, 200, decorateLoans(data).find((item) => item.id === loanId));
    return;
  }

  sendJson(res, 404, { error: "Khong tim thay API muon sach." });
}

async function handleStats(req, res) {
  const data = await readData();
  const loans = decorateLoans(data);
  const books = decorateBooks(data);
  const isAdmin = isStaffRequest(data, req);
  const reader = isAdmin ? null : requireReaderForUser(data, req, res);

  if (!isAdmin && !reader) {
    return;
  }

  const visibleLoans = isAdmin ? loans : loans.filter((loan) => loan.readerId === reader.id);
  const visibleReservations = isAdmin
    ? decorateReservations(data)
    : decorateReservations(data).filter((reservation) => reservation.readerId === reader.id);
  const borrowedLoans = visibleLoans.filter((loan) => loan.status === "borrowed");
  const overdueLoans = visibleLoans.filter((loan) => loan.status === "overdue");
  const waitingReservations = visibleReservations.filter((reservation) => reservation.status === "waiting");
  const today = new Date(normalizeDate());
  const dueSoonLimit = new Date(today);
  dueSoonLimit.setDate(dueSoonLimit.getDate() + 3);
  const dueSoonLoans = borrowedLoans
    .filter((loan) => {
      const dueDate = new Date(loan.dueDate);
      return dueDate >= today && dueDate <= dueSoonLimit;
    })
    .sort((first, second) => new Date(first.dueDate) - new Date(second.dueDate));
  const loanCountsByBook = visibleLoans.reduce((counts, loan) => {
    counts[loan.bookId] = (counts[loan.bookId] || 0) + 1;
    return counts;
  }, {});
  const loanCountsByReader = visibleLoans.reduce((counts, loan) => {
    counts[loan.readerId] = (counts[loan.readerId] || 0) + 1;
    return counts;
  }, {});
  const todayText = normalizeDate();
  const todayLoans = visibleLoans.filter((loan) => loan.borrowedDate === todayText);
  const todayReturns = visibleLoans.filter((loan) => loan.returnedDate === todayText);
  const todayFines = overdueLoans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0);
  const monthLabels = [];
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(currentMonth);
    date.setMonth(currentMonth.getMonth() - index);
    monthLabels.push(date.toISOString().slice(0, 7));
  }
  const monthlyActivity = monthLabels.map((month) => ({
    month,
    borrowed: visibleLoans.filter((loan) => String(loan.borrowedDate || "").startsWith(month)).length,
    returned: visibleLoans.filter((loan) => String(loan.returnedDate || "").startsWith(month)).length,
  }));
  const monthlyFines = monthLabels.map((month) => {
    const paidLoans = visibleLoans.filter(
      (loan) => loan.fineStatus === "paid" && String(loan.finePaidDate || "").startsWith(month)
    );
    const waivedLoans = visibleLoans.filter(
      (loan) => loan.fineStatus === "waived" && String(loan.finePaidDate || loan.returnedDate || loan.dueDate || "").startsWith(month)
    );
    const unpaidLoans = visibleLoans.filter(
      (loan) => loan.fineAmount > 0 && loan.fineStatus === "unpaid" && String(loan.dueDate || "").startsWith(month)
    );

    return {
      month,
      paid: paidLoans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
      unpaid: unpaidLoans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
      waived: waivedLoans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
    };
  });
  const reminders = [...overdueLoans, ...dueSoonLoans]
    .sort((first, second) => new Date(first.dueDate) - new Date(second.dueDate))
    .slice(0, 8);
  const notificationItems = buildNotifications(data, req);
  const notificationDigest = notificationItems.reduce(
    (digest, item) => {
      const tone = item.tone || "info";
      digest.total += 1;
      digest[tone] = (digest[tone] || 0) + 1;
      return digest;
    },
    { total: 0, danger: 0, warning: 0, success: 0, info: 0 }
  );
  const roleSummary = isAdmin
    ? data.users.reduce(
        (summary, user) => {
          const role = user.role === "librarian" ? "librarians" : user.role === "admin" ? "admins" : "members";
          summary[role] += 1;
          if ((user.status || "active") === "locked") summary.locked += 1;
          return summary;
        },
        { admins: 0, librarians: 0, members: 0, locked: 0 }
      )
    : { admins: 0, librarians: 0, members: 1, locked: 0 };
  const categoryCounts = visibleLoans.reduce((counts, loan) => {
    const book = data.books.find((item) => item.id === loan.bookId);
    if (!book?.category) return counts;
    counts[book.category] = (counts[book.category] || 0) + 1;
    return counts;
  }, {});
  const categoryWaitCounts = visibleReservations.reduce((counts, reservation) => {
    const book = data.books.find((item) => item.id === reservation.bookId);
    if (!book?.category) return counts;
    counts[book.category] = (counts[book.category] || 0) + 1;
    return counts;
  }, {});
  const reservationQueue = {
    totalWaiting: waitingReservations.length,
    readyToFulfill: visibleReservations.filter(
      (reservation) => reservation.status === "waiting" && Number(reservation.availableQuantity || 0) > 0
    ).length,
    blockedByStock: visibleReservations.filter(
      (reservation) => reservation.status === "waiting" && Number(reservation.availableQuantity || 0) <= 0
    ).length,
  };
  const bookForecast = Object.entries(categoryCounts)
    .map(([category, borrowCount]) => ({
      category,
      borrowCount,
      waitingReservations: categoryWaitCounts[category] || 0,
    }))
    .sort((first, second) => second.borrowCount - first.borrowCount)
    .slice(0, 4);
  const hotCategories = Object.entries(categoryCounts)
    .map(([category, borrowCount]) => ({
      category,
      borrowCount,
      waitingReservations: categoryWaitCounts[category] || 0,
      demandScore: borrowCount + (categoryWaitCounts[category] || 0) * 2,
    }))
    .sort((first, second) => second.demandScore - first.demandScore)
    .slice(0, 4);
  const topReservationBooks = Object.values(
    visibleReservations.reduce((counts, reservation) => {
      const book = data.books.find((item) => item.id === reservation.bookId);
      if (!book) return counts;
      const key = String(book.id);
      counts[key] = counts[key] || {
        id: book.id,
        title: book.title,
        author: book.author,
        waitingCount: 0,
      };
      counts[key].waitingCount += 1;
      return counts;
    }, {})
  )
    .sort((first, second) => second.waitingCount - first.waitingCount)
    .slice(0, 4);
  const recommendedBooks = books
    .filter((book) => Number(book.availableQuantity || 0) > 0)
    .map((book) => {
      const categoryDemand = categoryCounts[book.category] || 0;
      const waitingDemand = categoryWaitCounts[book.category] || 0;
      const demandScore = categoryDemand * 2 + waitingDemand + Math.min(3, Number(book.availableQuantity || 0));
      const recommendationReason =
        categoryDemand > 0
          ? "Thể loại bạn quan tâm"
          : waitingDemand > 0
            ? "Đang có độc giả đặt trước cùng thể loại"
            : "Sách còn bản sẵn để giới thiệu";

      return {
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category,
        availableQuantity: book.availableQuantity,
        demandScore,
        recommendationReason,
      };
    })
    .sort((first, second) => second.demandScore - first.demandScore || Number(second.availableQuantity || 0) - Number(first.availableQuantity || 0))
    .slice(0, 5);

  sendJson(res, 200, {
    totalBooks: data.books.reduce((total, book) => total + Number(book.quantity || 0), 0),
    readers: isAdmin ? data.readers.length : 1,
    borrowed: borrowedLoans.length,
    overdue: overdueLoans.length,
    dueSoon: dueSoonLoans.length,
    waitingReservations: waitingReservations.length,
    totalFines: overdueLoans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
    availableBooks: books.reduce((total, book) => total + Number(book.availableQuantity || 0), 0),
    missingImageBooks: books.filter((book) => !book.imageUrl).length,
    lowStockBooks: books
      .filter((book) => Number(book.availableQuantity || 0) <= 2)
      .sort((first, second) => Number(first.availableQuantity || 0) - Number(second.availableQuantity || 0))
      .slice(0, 5),
    popularBooks: books
      .map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        borrowedCount: loanCountsByBook[book.id] || 0,
      }))
      .filter((book) => book.borrowedCount > 0)
      .sort((first, second) => second.borrowedCount - first.borrowedCount)
      .slice(0, 5),
    topReaders: data.readers
      .map((reader) => ({
        id: reader.id,
        name: reader.name,
        email: reader.email,
        borrowedCount: loanCountsByReader[reader.id] || 0,
      }))
      .filter((item) => item.borrowedCount > 0)
      .sort((first, second) => second.borrowedCount - first.borrowedCount)
      .slice(0, 5),
    todayActivity: {
      borrowed: todayLoans.length,
      returned: todayReturns.length,
      fines: todayFines,
    },
    fineSummary: {
      unpaid: visibleLoans.filter((loan) => loan.fineAmount > 0 && loan.fineStatus === "unpaid").length,
      paid: visibleLoans.filter((loan) => loan.fineStatus === "paid").length,
      waived: visibleLoans.filter((loan) => loan.fineStatus === "waived").length,
      paidAmount: visibleLoans
        .filter((loan) => loan.fineStatus === "paid")
        .reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
    },
    roleSummary,
    notificationDigest,
    reservationQueue,
    bookForecast,
    hotCategories,
    topReservationBooks,
    recommendedBooks,
    monthlyActivity,
    monthlyFines,
    reminders,
    recentLoans: visibleLoans
      .slice()
      .sort((first, second) => second.id - first.id)
      .slice(0, 5),
    dueSoonLoans: dueSoonLoans.slice(0, 5),
  });
}

async function handleReservations(req, res, pathname) {
  const data = await readData();
  const idMatch = pathname.match(/^\/api\/reservations\/(\d+)$/);

  if (req.method === "GET" && pathname === "/api/reservations") {
    if (isStaffRequest(data, req)) {
      sendJson(res, 200, decorateReservations(data).sort((first, second) => second.id - first.id));
      return;
    }

    const reader = requireReaderForUser(data, req, res);
    if (!reader) return;

    sendJson(
      res,
      200,
      decorateReservations(data)
        .filter((reservation) => reservation.readerId === reader.id)
        .sort((first, second) => second.id - first.id)
    );
    return;
  }

  if (req.method === "POST" && pathname === "/api/reservations") {
    const body = await parseBody(req);
    const bookId = Number(body.bookId);
    const book = data.books.find((item) => item.id === bookId);
    if (!book) {
      sendJson(res, 404, { error: "Khong tim thay sach de dat truoc." });
      return;
    }

    const reader = isStaffRequest(data, req)
      ? data.readers.find((item) => item.id === Number(body.readerId))
      : requireReaderForUser(data, req, res);
    if (!reader) return;

    const exists = (data.reservations || []).some(
      (item) => item.bookId === bookId && item.readerId === reader.id && item.status === "waiting"
    );
    if (exists) {
      sendJson(res, 409, { error: "Doc gia da dat truoc sach nay." });
      return;
    }

    const reservation = {
      id: nextId(data.reservations || []),
      readerId: reader.id,
      bookId,
      status: "waiting",
      note: String(body.note || "").trim(),
      createdAt: new Date().toISOString(),
      handledAt: null,
      handledBy: "",
    };
    data.reservations = [...(data.reservations || []), reservation];
    addActivity(data, req, "reservation.created", `Dat truoc sach: ${book.title}.`, {
      reservationId: reservation.id,
      readerId: reader.id,
      readerName: reader.name,
      bookId,
      bookTitle: book.title,
    });
    await writeData(data);
    sendJson(res, 201, decorateReservations(data).find((item) => item.id === reservation.id));
    return;
  }

  if (req.method === "PATCH" && idMatch) {
    if (!requireAdmin(data, req, res)) return;

    const reservation = (data.reservations || []).find((item) => item.id === Number(idMatch[1]));
    if (!reservation) {
      sendJson(res, 404, { error: "Khong tim thay phieu dat truoc." });
      return;
    }

    const body = await parseBody(req);
    const status = String(body.status || "").trim().toLowerCase();
    if (!["waiting", "fulfilled", "cancelled"].includes(status)) {
      sendJson(res, 400, { error: "Trang thai dat truoc khong hop le." });
      return;
    }

    let createdLoan = null;
    if (status === "fulfilled" && body.createLoan) {
      const reader = data.readers.find((item) => item.id === reservation.readerId);
      const book = data.books.find((item) => item.id === reservation.bookId);
      const dueDate = String(body.dueDate || "").trim();

      if (!reader || !book) {
        sendJson(res, 400, { error: "Doc gia hoac sach cua dat truoc khong con ton tai." });
        return;
      }

      if (!isValidDateString(dueDate) || isBeforeToday(dueDate)) {
        sendJson(res, 400, { error: "Han tra phai la ngay hop le va khong duoc trong qua khu." });
        return;
      }

      const activeReaderLoans = data.loans.filter(
        (loan) => loan.readerId === reader.id && loan.status !== "returned"
      ).length;
      if (activeReaderLoans >= MAX_ACTIVE_LOANS_PER_READER) {
        sendJson(res, 400, { error: `Doc gia da muon toi da ${MAX_ACTIVE_LOANS_PER_READER} sach.` });
        return;
      }

      const duplicateActiveLoan = data.loans.some(
        (loan) => loan.readerId === reader.id && loan.bookId === book.id && loan.status !== "returned"
      );
      if (duplicateActiveLoan) {
        sendJson(res, 400, { error: "Doc gia dang muon sach nay, khong the tao phieu trung." });
        return;
      }

      const availableQuantity = Number(book.quantity) - activeLoanCount(data.loans, book.id);
      if (availableQuantity <= 0 || ["lost", "repair"].includes(book.condition || "good")) {
        sendJson(res, 400, { error: "Sach chua san sang de chuyen dat truoc thanh phieu muon." });
        return;
      }

      createdLoan = {
        id: nextId(data.loans),
        readerId: reader.id,
        bookId: book.id,
        borrowedDate: normalizeDate(),
        dueDate,
        returnedDate: null,
        status: "borrowed",
        fineStatus: "none",
        finePaidDate: null,
        fineHandledBy: "",
        finePaymentMethod: "",
        finePaymentBank: "",
        fineTransactionCode: "",
        finePaymentNote: "",
        finePaymentSubmittedBy: "",
        finePaymentConfirmedAt: null,
        reservationId: reservation.id,
      };
      data.loans.push(createdLoan);
      addActivity(data, req, "loan.created_from_reservation", `Tao phieu muon #${createdLoan.id} tu dat truoc #${reservation.id}.`, {
        loanId: createdLoan.id,
        reservationId: reservation.id,
        readerId: reader.id,
        bookId: book.id,
        dueDate,
      });
    }

    reservation.status = status;
    reservation.handledAt = status === "waiting" ? null : new Date().toISOString();
    reservation.handledBy = status === "waiting" ? "" : getActorLabel(data, req);
    addActivity(data, req, "reservation.updated", `Cap nhat dat truoc #${reservation.id}: ${status}.`, {
      reservationId: reservation.id,
      status,
      readerId: reservation.readerId,
      bookId: reservation.bookId,
    });
    await writeData(data);
    sendJson(res, 200, {
      reservation: decorateReservations(data).find((item) => item.id === reservation.id),
      loan: createdLoan ? decorateLoans(data).find((item) => item.id === createdLoan.id) : null,
    });
    return;
  }

  sendJson(res, 404, { error: "Khong tim thay API dat truoc." });
}

async function handleReviews(req, res, pathname) {
  const data = await readData();

  if (req.method === "GET" && pathname === "/api/reviews") {
    const reviews = decorateReviews(data).sort((first, second) => second.id - first.id);
    sendJson(res, 200, isStaffRequest(data, req) ? reviews : reviews.filter((review) => review.status !== "hidden"));
    return;
  }

  if (req.method === "POST" && pathname === "/api/reviews") {
    const body = await parseBody(req);
    const bookId = Number(body.bookId);
    const rating = Number(body.rating);
    const comment = String(body.comment || "").trim();
    const book = data.books.find((item) => item.id === bookId);
    if (!book || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      sendJson(res, 400, { error: "Vui long chon sach va danh gia tu 1 den 5 sao." });
      return;
    }

    const reader = requireReaderForUser(data, req, res);
    if (!reader) return;

    const existingIndex = (data.reviews || []).findIndex(
      (item) => item.bookId === bookId && item.readerId === reader.id
    );
    const review = {
      id: existingIndex >= 0 ? data.reviews[existingIndex].id : nextId(data.reviews || []),
      bookId,
      readerId: reader.id,
      rating,
      comment,
      status: "visible",
      createdAt: existingIndex >= 0 ? data.reviews[existingIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      data.reviews[existingIndex] = review;
    } else {
      data.reviews = [...(data.reviews || []), review];
    }

    addActivity(data, req, "review.created", `Danh gia sach ${book.title}: ${rating} sao.`, {
      reviewId: review.id,
      bookId,
      bookTitle: book.title,
      readerId: reader.id,
      rating,
    });
    await writeData(data);
    sendJson(res, existingIndex >= 0 ? 200 : 201, decorateReviews(data).find((item) => item.id === review.id));
    return;
  }

  sendJson(res, 404, { error: "Khong tim thay API danh gia." });
}

async function handleCatalog(req, res, pathname) {
  const data = await readData();
  const valueMatch = pathname.match(/^\/api\/catalog\/(categories|publishers)\/(.+)$/);

  if (req.method === "GET" && pathname === "/api/catalog") {
    const categories = new Set([...(data.catalog?.categories || []), ...data.books.map((book) => book.category).filter(Boolean)]);
    const publishers = new Set([...(data.catalog?.publishers || []), ...data.books.map((book) => book.publisher).filter(Boolean)]);
    sendJson(res, 200, {
      categories: Array.from(categories).sort(),
      publishers: Array.from(publishers).sort(),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/catalog") {
    if (!requireAdmin(data, req, res)) return;

    const body = await parseBody(req);
    const type = String(body.type || "").trim();
    const name = String(body.name || "").trim();
    if (!["categories", "publishers"].includes(type) || !name) {
      sendJson(res, 400, { error: "Vui long nhap loai danh muc va ten hop le." });
      return;
    }

    data.catalog = data.catalog || { categories: [], publishers: [] };
    data.catalog[type] = Array.from(new Set([...(data.catalog[type] || []), name])).sort();
    addActivity(data, req, "catalog.updated", `Them danh muc ${type}: ${name}.`, { type, name });
    await writeData(data);
    sendJson(res, 201, data.catalog);
    return;
  }

  if (req.method === "DELETE" && valueMatch) {
    if (!requireAdmin(data, req, res)) return;

    const type = valueMatch[1];
    const name = decodeURIComponent(valueMatch[2]);
    data.catalog = data.catalog || { categories: [], publishers: [] };
    data.catalog[type] = (data.catalog[type] || []).filter((item) => item !== name);
    addActivity(data, req, "catalog.updated", `Xoa danh muc ${type}: ${name}.`, { type, name });
    await writeData(data);
    sendJson(res, 200, data.catalog);
    return;
  }

  sendJson(res, 404, { error: "Khong tim thay API danh muc." });
}

async function handleActivities(req, res, url) {
  const data = await readData();

  if (!requireAdmin(data, req, res)) return;

  if (req.method === "DELETE") {
    const beforeCount = Array.isArray(data.activities) ? data.activities.length : 0;
    const olderThan = url.searchParams.get("olderThan");

    if (olderThan) {
      const cutoff = new Date(`${olderThan}T23:59:59`);
      data.activities = (data.activities || []).filter(
        (activity) => new Date(activity.createdAt) > cutoff
      );
    } else {
      data.activities = [];
    }

    await writeData(data);
    sendJson(res, 200, {
      deleted: beforeCount - data.activities.length,
      remaining: data.activities.length,
    });
    return;
  }

  const activities = Array.isArray(data.activities) ? data.activities : [];
  sendJson(res, 200, activities.slice(0, 300));
}

async function handleNotifications(req, res) {
  const data = await readData();

  if (!isStaffRequest(data, req)) {
    const reader = requireReaderForUser(data, req, res);
    if (!reader) return;
  }

  sendJson(res, 200, buildNotifications(data, req));
}

async function handleBackup(req, res) {
  const data = await readData();
  if (!requireAdminOnly(data, req, res)) return;

  sendJson(res, 200, {
    exportedAt: new Date().toISOString(),
    version: 1,
    data,
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    sendNoContent(res);
    return;
  }

  try {
    if (pathname === "/api/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/auth") ||
      pathname === "/login" ||
      pathname === "/register"
    ) {
      await handleAuth(req, res, pathname);
      return;
    }

    if (pathname.startsWith("/api/books")) {
      await handleBooks(req, res, pathname);
      return;
    }

    if (pathname.startsWith("/api/readers") || pathname.startsWith("/readers")) {
      await handleReaders(req, res, pathname);
      return;
    }

    if (pathname.startsWith("/api/loans")) {
      await handleLoans(req, res, pathname);
      return;
    }

    if (pathname.startsWith("/api/reservations")) {
      await handleReservations(req, res, pathname);
      return;
    }

    if (pathname.startsWith("/api/reviews")) {
      await handleReviews(req, res, pathname);
      return;
    }

    if (pathname.startsWith("/api/catalog")) {
      await handleCatalog(req, res, pathname);
      return;
    }

    if (req.method === "GET" && pathname === "/api/stats") {
      await handleStats(req, res);
      return;
    }

    if ((req.method === "GET" || req.method === "DELETE") && pathname === "/api/activities") {
      await handleActivities(req, res, url);
      return;
    }

    if (req.method === "GET" && pathname === "/api/notifications") {
      await handleNotifications(req, res);
      return;
    }

    if (req.method === "GET" && pathname === "/api/backup") {
      await handleBackup(req, res);
      return;
    }

    sendJson(res, 404, { error: `Khong tim thay endpoint: ${req.method} ${pathname}` });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Loi server." });
  }
}

if (require.main === module) {
  const server = http.createServer(handleRequest);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} dang bi chiem. Hay tat process cu hoac chay voi PORT khac.`);
      console.error(`Vi du: $env:PORT=4001; npm run server`);
      process.exit(1);
    }

    throw error;
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Library API dang chay tai http://127.0.0.1:${PORT}`);
  });
}

module.exports = handleRequest;

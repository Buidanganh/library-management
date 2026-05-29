const http = require("http");
const crypto = require("crypto");
const { readData, writeData } = require("./database");

const PORT = Number(process.env.PORT || 4000);
const MAX_ACTIVE_LOANS_PER_READER = 5;
const DAILY_OVERDUE_FINE = 5000;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-user-role, x-user-id, x-user-email",
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-user-role, x-user-id, x-user-email",
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
  };
}

function publicUserWithReader(data, user) {
  const reader = getReaderForUser(data, user);

  return {
    ...publicUser(user),
    readerId: reader?.id || null,
  };
}

function isAdminRequest(req) {
  return String(req.headers["x-user-role"] || "").toLowerCase() === "admin";
}

function requireAdmin(req, res) {
  if (isAdminRequest(req)) {
    return true;
  }

  sendJson(res, 403, { error: "Chi admin moi co quyen thuc hien thao tac nay." });
  return false;
}

function getRequestUser(data, req) {
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

function getReaderForUser(data, user) {
  if (!user) return null;

  return (
    data.readers.find((reader) => reader.userId === user.id) ||
    data.readers.find((reader) => reader.email.toLowerCase() === user.email.toLowerCase()) ||
    null
  );
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

function decorateBooks(data) {
  return data.books.map((book) => ({
    ...book,
    availableQuantity: Math.max(0, Number(book.quantity) - activeLoanCount(data.loans, book.id)),
  }));
}

function decorateReaders(data) {
  return data.readers.map((reader) => ({
    ...reader,
    booksBorrowed: data.loans.filter(
      (loan) => loan.readerId === reader.id && loan.status !== "returned"
    ).length,
  }));
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
    };
  });
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
      shelfLocation: String(input.shelfLocation || "").trim(),
      description: String(input.description || "").trim(),
    },
  };
}

function validateReader(input) {
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const phone = String(input.phone || "").trim();

  if (!name || !email || !email.includes("@")) {
    return { error: "Vui long nhap ho ten va email doc gia hop le." };
  }

  return {
    reader: {
      name,
      email,
      phone,
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

    sendJson(res, 200, publicUserWithReader(data, user));
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
      userId: user.id,
    });
    await writeData(data);
    sendJson(res, 201, publicUserWithReader(data, user));
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
    if (!requireAdmin(req, res)) return;

    const body = await parseBody(req);
    const { book, error } = validateBook(body);

    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    const createdBook = { id: nextId(data.books), ...book };
    data.books.push(createdBook);
    await writeData(data);
    sendJson(res, 201, { ...createdBook, availableQuantity: createdBook.quantity });
    return;
  }

  if (req.method === "POST" && pathname === "/api/books/bulk") {
    if (!requireAdmin(req, res)) return;

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

    await writeData(data);
    sendJson(res, 201, createdBooks);
    return;
  }

  if (req.method === "PUT" && idMatch) {
    if (!requireAdmin(req, res)) return;

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

    data.books[existingIndex] = { id: bookId, ...book };
    await writeData(data);
    sendJson(res, 200, decorateBooks(data).find((item) => item.id === bookId));
    return;
  }

  if (req.method === "DELETE" && idMatch) {
    if (!requireAdmin(req, res)) return;

    const bookId = Number(idMatch[1]);
    const hasActiveLoan = data.loans.some(
      (loan) => loan.bookId === bookId && loan.status !== "returned"
    );

    if (hasActiveLoan) {
      sendJson(res, 400, { error: "Khong the xoa sach dang duoc muon." });
      return;
    }

    const beforeCount = data.books.length;
    data.books = data.books.filter((book) => book.id !== bookId);

    if (data.books.length === beforeCount) {
      sendJson(res, 404, { error: "Khong tim thay sach." });
      return;
    }

    await writeData(data);
    sendNoContent(res);
    return;
  }

  sendJson(res, 404, { error: "Khong tim thay API sach." });
}

async function handleReaders(req, res, pathname) {
  const data = await readData();
  const loansMatch = pathname.match(/^\/(?:api\/)?readers\/([^/]+)\/loans$/);
  const idMatch = pathname.match(/^\/(?:api\/)?readers\/([^/]+)$/);

  if (req.method === "GET" && pathname === "/api/readers") {
    if (isAdminRequest(req)) {
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

    if (!isAdminRequest(req)) {
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
    if (!requireAdmin(req, res)) return;

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
    await writeData(data);
    sendJson(res, 201, { ...createdReader, booksBorrowed: 0 });
    return;
  }

  if (req.method === "PUT" && idMatch) {
    if (!requireAdmin(req, res)) return;

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

    await writeData(data);
    sendJson(res, 200, decorateReaders(data).find((item) => item.id === readerId));
    return;
  }

  if (req.method === "DELETE" && idMatch) {
    if (!requireAdmin(req, res)) return;

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

    const beforeCount = data.readers.length;
    data.readers = data.readers.filter((reader) => reader.id !== readerId);

    if (data.readers.length === beforeCount) {
      sendJson(res, 404, { error: "Khong tim thay doc gia." });
      return;
    }

    data.loans = data.loans.filter((loan) => loan.readerId !== readerId);
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

  if (req.method === "GET" && pathname === "/api/loans") {
    const loans = decorateLoans(data);

    if (isAdminRequest(req)) {
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
    const reader = isAdminRequest(req)
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

    const loan = {
      id: nextId(data.loans),
      readerId,
      bookId,
      borrowedDate: normalizeDate(),
      dueDate,
      returnedDate: null,
      status: "borrowed",
    };

    data.loans.push(loan);
    await writeData(data);
    sendJson(res, 201, decorateLoans(data).find((item) => item.id === loan.id));
    return;
  }

  if (req.method === "PATCH" && extendMatch) {
    const loanId = Number(extendMatch[1]);
    const loan = data.loans.find((item) => item.id === loanId);

    if (!loan) {
      sendJson(res, 404, { error: "Khong tim thay phieu muon." });
      return;
    }

    if (!isAdminRequest(req)) {
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

    if (!isAdminRequest(req)) {
      const reader = requireReaderForUser(data, req, res);
      if (!reader) return;

      if (loan.readerId !== reader.id) {
        sendJson(res, 403, { error: "Ban chi duoc tra sach cua chinh minh." });
        return;
      }
    }

    loan.status = "returned";
    loan.returnedDate = normalizeDate();
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
  const borrowedLoans = loans.filter((loan) => loan.status === "borrowed");
  const overdueLoans = loans.filter((loan) => loan.status === "overdue");
  const today = new Date(normalizeDate());
  const dueSoonLimit = new Date(today);
  dueSoonLimit.setDate(dueSoonLimit.getDate() + 3);
  const dueSoonLoans = borrowedLoans
    .filter((loan) => {
      const dueDate = new Date(loan.dueDate);
      return dueDate >= today && dueDate <= dueSoonLimit;
    })
    .sort((first, second) => new Date(first.dueDate) - new Date(second.dueDate));
  const loanCountsByBook = data.loans.reduce((counts, loan) => {
    counts[loan.bookId] = (counts[loan.bookId] || 0) + 1;
    return counts;
  }, {});

  sendJson(res, 200, {
    totalBooks: data.books.reduce((total, book) => total + Number(book.quantity || 0), 0),
    readers: data.readers.length,
    borrowed: borrowedLoans.length,
    overdue: overdueLoans.length,
    dueSoon: dueSoonLoans.length,
    totalFines: overdueLoans.reduce((total, loan) => total + Number(loan.fineAmount || 0), 0),
    availableBooks: books.reduce((total, book) => total + Number(book.availableQuantity || 0), 0),
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
    recentLoans: loans
      .slice()
      .sort((first, second) => second.id - first.id)
      .slice(0, 5),
    dueSoonLoans: dueSoonLoans.slice(0, 5),
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

    if (req.method === "GET" && pathname === "/api/stats") {
      await handleStats(req, res);
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

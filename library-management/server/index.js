const http = require("http");
const crypto = require("crypto");
const { readData, writeData } = require("./database");

const PORT = Number(process.env.PORT || 4000);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-user-role",
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-user-role",
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

function normalizeDate(date = new Date()) {
  return new Date(date).toISOString().split("T")[0];
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

function decorateLoans(data) {
  return data.loans.map((loan) => {
    const reader = data.readers.find((item) => item.id === loan.readerId);
    const book = data.books.find((item) => item.id === loan.bookId);

    return {
      ...loan,
      status: getLoanStatus(loan),
      readerName: reader?.name || "Khong ro doc gia",
      bookTitle: book?.title || "Khong ro sach",
    };
  });
}

function validateBook(input) {
  const title = String(input.title || "").trim();
  const author = String(input.author || "").trim();
  const category = String(input.category || "").trim();
  const quantity = Number(input.quantity);

  if (!title || !author || !category || !Number.isFinite(quantity) || quantity < 0) {
    return { error: "Vui long nhap ten sach, tac gia, the loai va so luong hop le." };
  }

  return {
    book: {
      title,
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

    sendJson(res, 200, publicUser(user));
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
    sendJson(res, 201, publicUser(user));
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

async function handleLoans(req, res, pathname) {
  const data = await readData();
  const returnMatch = pathname.match(/^\/api\/loans\/(\d+)\/return$/);

  if (req.method === "GET" && pathname === "/api/loans") {
    sendJson(res, 200, decorateLoans(data));
    return;
  }

  if (req.method === "POST" && pathname === "/api/loans") {
    const body = await parseBody(req);
    const readerId = Number(body.readerId);
    const bookId = Number(body.bookId);
    const dueDate = String(body.dueDate || "").trim();
    const reader = data.readers.find((item) => item.id === readerId);
    const book = data.books.find((item) => item.id === bookId);

    if (!reader || !book || !dueDate) {
      sendJson(res, 400, { error: "Doc gia, sach hoac han tra khong hop le." });
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

  if (req.method === "PATCH" && returnMatch) {
    const loanId = Number(returnMatch[1]);
    const loan = data.loans.find((item) => item.id === loanId);

    if (!loan) {
      sendJson(res, 404, { error: "Khong tim thay phieu muon." });
      return;
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

  sendJson(res, 200, {
    totalBooks: data.books.reduce((total, book) => total + Number(book.quantity || 0), 0),
    readers: data.readers.length,
    borrowed: loans.filter((loan) => loan.status === "borrowed").length,
    overdue: loans.filter((loan) => loan.status === "overdue").length,
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

    if (req.method === "GET" && pathname === "/api/readers") {
      sendJson(res, 200, decorateReaders(await readData()));
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

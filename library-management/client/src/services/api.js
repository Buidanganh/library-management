const API_URL = import.meta.env.VITE_API_URL || "";

async function handleResponse(response) {
  const content = await response.text();
  let payload = {};

  if (content) {
    try {
      payload = JSON.parse(content);
    } catch {
      throw new Error(
        response.ok
          ? "API trả về dữ liệu không hợp lệ."
          : `API không trả về JSON (${response.status}). Hãy kiểm tra route /api trên Vercel.`
      );
    }
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.message || response.statusText || "Lỗi API");
  }

  return payload;
}

function request(path, options = {}) {
  const savedUser = localStorage.getItem("libraryUser");
  const user = savedUser ? JSON.parse(savedUser) : null;
  const headers = {
    ...(options.headers || {}),
    ...(user?.role ? { "x-user-role": user.role } : {}),
    ...(user?.id ? { "x-user-id": String(user.id) } : {}),
    ...(user?.email ? { "x-user-email": user.email } : {}),
  };

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  }).then(handleResponse);
}

export function login(payload) {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function register(payload) {
  return request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getBooks() {
  return request("/api/books");
}

export function createBook(book) {
  return request("/api/books", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(book),
  });
}

export function createBooksBulk(books) {
  return request("/api/books/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(books),
  });
}

export function updateBook(bookId, book) {
  return request(`/api/books/${bookId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(book),
  });
}

export function deleteBook(bookId) {
  return request(`/api/books/${bookId}`, {
    method: "DELETE",
  });
}

export function getReaders() {
  return request("/api/readers");
}

export function getReaderLoans(readerId) {
  if (!readerId) {
    throw new Error("Không xác định được mã độc giả.");
  }

  return request(`/api/readers/${readerId}/loans`);
}

export function createReader(reader) {
  return request("/api/readers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reader),
  });
}

export function updateReader(readerId, reader) {
  if (!readerId) {
    throw new Error("Không xác định được mã độc giả.");
  }

  return request(`/api/readers/${readerId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reader),
  });
}

export function deleteReader(readerId) {
  if (!readerId) {
    throw new Error("Không xác định được mã độc giả.");
  }

  return request(`/api/readers/${readerId}`, {
    method: "DELETE",
  });
}

export function getLoans() {
  return request("/api/loans");
}

export function borrowBook(payload) {
  return request("/api/loans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function returnLoan(loanId) {
  return request(`/api/loans/${loanId}/return`, {
    method: "PATCH",
  });
}

export function extendLoan(loanId, dueDate) {
  if (!loanId) {
    throw new Error("Không xác định được mã phiếu mượn.");
  }

  return request(`/api/loans/${loanId}/extend`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dueDate }),
  });
}

export function getStats() {
  return request("/api/stats");
}

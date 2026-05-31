const API_URL = import.meta.env.VITE_API_URL || "";

function readSavedUser() {
  try {
    const savedUser = localStorage.getItem("libraryUser");
    return savedUser ? JSON.parse(savedUser) : null;
  } catch {
    localStorage.removeItem("libraryUser");
    return null;
  }
}

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
  const user = readSavedUser();
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

export function createReadersBulk(readers) {
  return request("/api/readers/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(readers),
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

export function updateReaderAccountStatus(readerId, status) {
  if (!readerId) {
    throw new Error("Không xác định được mã độc giả.");
  }

  return request(`/api/readers/${readerId}/account`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
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

export function updateLoanFineStatus(loanId, fineStatus) {
  if (!loanId) {
    throw new Error("Không xác định được mã phiếu mượn.");
  }

  return request(`/api/loans/${loanId}/fine`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fineStatus }),
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

export function getReservations() {
  return request("/api/reservations");
}

export function createReservation(payload) {
  return request("/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateReservationStatus(reservationId, status) {
  if (!reservationId) {
    throw new Error("Không xác định được mã đặt trước.");
  }

  return request(`/api/reservations/${reservationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function getReviews() {
  return request("/api/reviews");
}

export function createReview(payload) {
  return request("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getCatalog() {
  return request("/api/catalog");
}

export function createCatalogItem(payload) {
  return request("/api/catalog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteCatalogItem(type, name) {
  return request(`/api/catalog/${type}/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export function getActivities() {
  return request("/api/activities");
}

export function deleteActivities(olderThan) {
  const query = olderThan ? `?olderThan=${encodeURIComponent(olderThan)}` : "";
  return request(`/api/activities${query}`, {
    method: "DELETE",
  });
}

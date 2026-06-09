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

function repairMojibakeText(value) {
 if (typeof value !== "string") return value;

 let text = value;

 if (/[\u00C3\u00C2\u00C6\u00C4\u00D0]/.test(text) && typeof TextDecoder !== "undefined") {
 try {
 const bytes = Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 255));
 const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
 if ((decoded.match(/[\u00C3\u00C2\u00C6\u00C4\u00D0]/g) || []).length < (text.match(/[\u00C3\u00C2\u00C6\u00C4\u00D0]/g) || []).length) {
 text = decoded;
 }
 } catch {
 // Keep original text if it was not a byte-level mojibake string.
 }
 }

 return text.replace(/Th[?\uFFFD] lo[?\uFFFD]i b[?\uFFFD]n quan t[?\uFFFD]m/gi, "Thể loại bạn quan tâm").replace(/S[?\uFFFD]ch qu[?\uFFFD] h[?\uFFFD]n/gi, "Sách quá hạn").replace(/s[?\uFFFD]ch qu[?\uFFFD] h[?\uFFFD]n/gi, "sách quá hạn").replace(/qu[?\uFFFD] h[?\uFFFD]n/gi, "quá hạn").replace(/s[?\uFFFD]p d[?\uFFFD]n h[?\uFFFD]n/gi, "sắp đến hạn").replace(/h[?\uFFFD]n tr[?\uFFFD]/gi, "hạn trả").replace(/[đd][?\uFFFD]t tr[?\uFFFD][?\uFFFD]c/gi, "đặt trước").replace(/x[?\uFFFD] l[?\uFFFD]/gi, "xử lý").replace(/c[?\uFFFD] th[?\uFFFD]/gi, "có thể").replace(/hi[?\uFFFD]n c[?\uFFFD]n/gi, "hiện còn").replace(/c[?\uFFFD]n ([0-9]+) b[?\uFFFD]n/gi, "còn $1 bản").replace(/b[?\uFFFD]n quan/gi, "bạn quan").replace(/b[?\uFFFD]n s[?\uFFFD]n/gi, "bản sẵn").replace(/([0-9]+) b[?\uFFFD]n/gi, "$1 bản").replace(/d[?\uFFFD] li[?\uFFFD]u/gi, "dữ liệu").replace(/kh[?\uFFFD]ng/gi, "không").replace(/th[?\uFFFD]ng b[?\uFFFD]o/gi, "thông báo").replace(/m[?\uFFFD][ượu]n/gi, "mượn").replace(/tr[?\uFFFD] s[?\uFFFD]ch/gi, "trả sách").replace(/d[?\uFFFD]c gi[?\uFFFD]/gi, "độc giả").replace(/t[?\uFFFD]i kho[?\uFFFD]n/gi, "tài khoản").replace(/qu[?\uFFFD]n tr[?\uFFFD] vi[êe]n/gi, "quản trị viên");
}

export function sanitizeVietnameseText(value) {
 if (typeof value === "string") return repairMojibakeText(value);
 if (Array.isArray(value)) return value.map(sanitizeVietnameseText);
 if (value && typeof value === "object") {
 return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeVietnameseText(item)]));
 }
 return value;
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

 return sanitizeVietnameseText(payload);
}

function request(path, options = {}) {
 const user = readSavedUser();
 const headers = {...(options.headers || {}),...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
 };

 return fetch(`${API_URL}${path}`, {...options,
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

export function updateReaderAccount(readerId, payload) {
 if (!readerId) {
 throw new Error("Không xác định được mã độc giả.");
 }

 return request(`/api/readers/${readerId}/account`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
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

export function updateLoanFineStatus(loanId, fineStatus, options = {}) {
 if (!loanId) {
 throw new Error("Không xác định được mã phiếu mượn.");
 }

 return request(`/api/loans/${loanId}/fine`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ fineStatus,...options }),
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

export function getNotifications() {
 return request("/api/notifications");
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

export function updateReservationStatus(reservationId, status, options = {}) {
 if (!reservationId) {
 throw new Error("Không xác định được mã đặt trước.");
 }

 return request(`/api/reservations/${reservationId}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ status,...options }),
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

export function getBackup() {
 return request("/api/backup");
}

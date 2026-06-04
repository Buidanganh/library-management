const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const os = require("os");

const DB_FILE = path.join(__dirname, "library.db.json");
const TMP_DB_FILE = path.join(os.tmpdir(), "library.db.json");
const REMOTE_DB_KEY = process.env.REMOTE_DB_KEY || "library-management:db";
const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_REMOTE_DB = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);
const FORCE_TMP_DB = process.env.FORCE_TMP_DB === "1" || process.env.FORCE_TMP_DB === "true";

const defaultData = {
  users: [
    {
      id: 1,
      fullName: "Quan tri vien",
      email: "admin@gmail.com",
      passwordHash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
      role: "admin",
    },
    {
      id: 2,
      fullName: "Bui Dang Anh",
      email: "buidanganh@gmail.com",
      passwordHash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
      role: "user",
    },
  ],
  books: [
    {
      id: 1,
      title: "Clean Code",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg",
      author: "Robert C. Martin",
      category: "Lap trinh",
      publisher: "Prentice Hall",
      year: "2008",
      quantity: 10,
      shelfLocation: "Ke A1",
      description: "Sach ve cach viet ma nguon sach va de bao tri."
    },
    {
      id: 2,
      title: "Design Patterns",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780201633610-L.jpg",
      author: "Erich Gamma",
      category: "Ky thuat phan mem",
      publisher: "Addison-Wesley",
      year: "1994",
      quantity: 6,
      shelfLocation: "Ke B2",
      description: "Cac mau thiet ke pho bien trong lap trinh huong doi tuong."
    },
    {
      id: 3,
      title: "You Don't Know JS",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9781491904244-L.jpg",
      author: "Kyle Simpson",
      category: "JavaScript",
      publisher: "O'Reilly",
      year: "2015",
      quantity: 8,
      shelfLocation: "Ke C1",
      description: "Giai thich sau ve ngon ngu JavaScript."
    },
    {
      id: 4,
      title: "The Pragmatic Programmer",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780201616224-L.jpg",
      author: "Andrew Hunt, David Thomas",
      category: "Lap trinh",
      publisher: "Addison-Wesley",
      year: "1999",
      quantity: 7,
      shelfLocation: "Ke A2",
      description: "Huong dan tu duy thuc chien cho lap trinh vien."
    },
    {
      id: 5,
      title: "Refactoring",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780134757599-L.jpg",
      author: "Martin Fowler",
      category: "Ky thuat phan mem",
      publisher: "Addison-Wesley",
      year: "2018",
      quantity: 5,
      shelfLocation: "Ke B1",
      description: "Cac ky thuat cai thien cau truc ma nguon."
    },
    {
      id: 6,
      title: "Introduction to Algorithms",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780262033848-L.jpg",
      author: "Thomas H. Cormen",
      category: "Giai thuat",
      publisher: "MIT Press",
      year: "2009",
      quantity: 4,
      shelfLocation: "Ke D1",
      description: "Giao trinh nen tang ve thuat toan va cau truc du lieu."
    },
    {
      id: 7,
      title: "Database System Concepts",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780073523323-L.jpg",
      author: "Abraham Silberschatz",
      category: "Co so du lieu",
      publisher: "McGraw-Hill",
      year: "2010",
      quantity: 6,
      shelfLocation: "Ke E1",
      description: "Kien thuc nen tang ve he quan tri co so du lieu."
    },
    {
      id: 8,
      title: "Computer Networking: A Top-Down Approach",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780133594140-L.jpg",
      author: "James F. Kurose, Keith W. Ross",
      category: "Mang may tinh",
      publisher: "Pearson",
      year: "2016",
      quantity: 5,
      shelfLocation: "Ke F1",
      description: "Nhap mon mang may tinh theo cach tiep can tu tren xuong."
    },
    {
      id: 9,
      title: "Operating System Concepts",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9781118063330-L.jpg",
      author: "Abraham Silberschatz",
      category: "He dieu hanh",
      publisher: "Wiley",
      year: "2012",
      quantity: 4,
      shelfLocation: "Ke F2",
      description: "Tong quan ve tien trinh, bo nho, luu tru va bao mat he dieu hanh."
    },
    {
      id: 10,
      title: "Artificial Intelligence: A Modern Approach",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780134610993-L.jpg",
      author: "Stuart Russell, Peter Norvig",
      category: "Tri tue nhan tao",
      publisher: "Pearson",
      year: "2020",
      quantity: 3,
      shelfLocation: "Ke G1",
      description: "Sach nen tang ve tri tue nhan tao hien dai."
    },
    {
      id: 11,
      title: "Deep Learning",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780262035613-L.jpg",
      author: "Ian Goodfellow, Yoshua Bengio, Aaron Courville",
      category: "Tri tue nhan tao",
      publisher: "MIT Press",
      year: "2016",
      quantity: 4,
      shelfLocation: "Ke G2",
      description: "Tai lieu chuyen sau ve hoc sau va mang neural."
    },
    {
      id: 12,
      title: "Eloquent JavaScript",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9781593279509-L.jpg",
      author: "Marijn Haverbeke",
      category: "JavaScript",
      publisher: "No Starch Press",
      year: "2018",
      quantity: 9,
      shelfLocation: "Ke C2",
      description: "Hoc JavaScript qua cac vi du va bai tap thuc hanh."
    },
    {
      id: 13,
      title: "Head First Design Patterns",
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780596007126-L.jpg",
      author: "Eric Freeman, Elisabeth Robson",
      category: "Ky thuat phan mem",
      publisher: "O'Reilly",
      year: "2004",
      quantity: 6,
      shelfLocation: "Ke B3",
      description: "Giai thich design pattern bang cach truc quan va de tiep can."
    }
  ],
  readers: [
    {
      id: 1,
      name: "Nguyen Van An",
      email: "an@example.com",
      phone: "0901000001"
    },
    {
      id: 2,
      name: "Tran Thi Binh",
      email: "binh@example.com",
      phone: "0901000002"
    },
    {
      id: 3,
      name: "Le Minh Chau",
      email: "chau@example.com",
      phone: "0901000003"
    },
    {
      id: 4,
      name: "Bui Dang Anh",
      email: "buidanganh@gmail.com",
      phone: "0901000004",
      userId: 2
    }
  ],
  loans: [
    {
      id: 1,
      readerId: 1,
      bookId: 2,
      borrowedDate: "2026-05-10",
      dueDate: "2026-05-24",
      returnedDate: null,
      status: "borrowed"
    }
  ],
  reservations: [],
  reviews: [],
  catalog: {
    categories: [],
    publishers: [],
  },
  activities: [
    {
      id: 1,
      type: "system",
      message: "Khoi tao du lieu thu vien mau.",
      actor: "He thong",
      createdAt: "2026-05-10T00:00:00.000Z",
      metadata: {}
    }
  ]
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function canWritePath(filePath) {
  try {
    await fs.access(filePath, fsSync.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function getEffectiveDbPath() {
  if (USE_REMOTE_DB) return null;
  if (FORCE_TMP_DB) return TMP_DB_FILE;

  if (await fileExists(DB_FILE)) {
    if (await canWritePath(DB_FILE)) return DB_FILE;
    return TMP_DB_FILE;
  }

  const baseDir = path.dirname(DB_FILE);
  if (await canWritePath(baseDir)) return DB_FILE;
  return TMP_DB_FILE;
}

async function kvCommand(command, ...args) {
  if (typeof fetch !== "function") {
    throw new Error("Node.js runtime khong ho tro fetch de ket noi remote database.");
  }

  const response = await fetch(KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([command, ...args]),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Remote database error ${response.status}: ${message || response.statusText}`);
  }

  const payload = await response.json();
  return payload.result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJsonFile(raw) {
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function getDefaultReaderProfileImageUrl(reader) {
  const seed = encodeURIComponent(reader?.name || reader?.email || `reader-${reader?.id || "new"}`);
  return `https://api.dicebear.com/9.x/initials/svg?seed=${seed}`;
}

function normalizeReaders(readers) {
  return readers.map((reader) => ({
    ...reader,
    profileImageUrl: reader.profileImageUrl || getDefaultReaderProfileImageUrl(reader),
  }));
}

async function loadSeedData() {
  if (await fileExists(DB_FILE)) {
    return withDefaults(parseJsonFile(await fs.readFile(DB_FILE, "utf8")));
  }

  const oldDataFile = path.join(__dirname, "data.json");
  if (await fileExists(oldDataFile)) {
    return withDefaults(parseJsonFile(await fs.readFile(oldDataFile, "utf8")));
  }

  return clone(defaultData);
}

function withDefaults(data) {
  return {
    users: Array.isArray(data.users) && data.users.length > 0 ? data.users : clone(defaultData.users),
    books: Array.isArray(data.books) ? data.books : clone(defaultData.books),
    readers: normalizeReaders(Array.isArray(data.readers) ? data.readers : clone(defaultData.readers)),
    loans: Array.isArray(data.loans) ? data.loans : clone(defaultData.loans),
    reservations: Array.isArray(data.reservations) ? data.reservations : clone(defaultData.reservations),
    reviews: Array.isArray(data.reviews) ? data.reviews : clone(defaultData.reviews),
    catalog: {
      categories: Array.isArray(data.catalog?.categories) ? data.catalog.categories : clone(defaultData.catalog.categories),
      publishers: Array.isArray(data.catalog?.publishers) ? data.catalog.publishers : clone(defaultData.catalog.publishers),
    },
    activities: Array.isArray(data.activities) ? data.activities : clone(defaultData.activities),
  };
}

async function ensureDatabase() {
  if (USE_REMOTE_DB) {
    const existing = await kvCommand("GET", REMOTE_DB_KEY);
    if (!existing) {
      await kvCommand("SET", REMOTE_DB_KEY, JSON.stringify(await loadSeedData()));
    }
    return;
  }

  const effectiveFile = await getEffectiveDbPath();
  if (effectiveFile === TMP_DB_FILE) {
    if (await fileExists(TMP_DB_FILE)) {
      return;
    }

    if (await fileExists(DB_FILE)) {
      const raw = await fs.readFile(DB_FILE, "utf8");
      await fs.writeFile(TMP_DB_FILE, raw, "utf8");
      return;
    }

    await fs.writeFile(TMP_DB_FILE, JSON.stringify(withDefaults(clone(defaultData)), null, 2) + "\n", "utf8");
    return;
  }

  if (!(await fileExists(DB_FILE))) {
    const oldDataFile = path.join(__dirname, "data.json");
    if (await fileExists(oldDataFile)) {
      const oldData = parseJsonFile(await fs.readFile(oldDataFile, "utf8"));
      await writeData(withDefaults(oldData));
      return;
    }

    await writeData(clone(defaultData));
  }
}

async function readData() {
  await ensureDatabase();

  if (USE_REMOTE_DB) {
    const raw = await kvCommand("GET", REMOTE_DB_KEY);
    if (!raw) {
      return withDefaults(await loadSeedData());
    }
    return withDefaults(typeof raw === "string" ? parseJsonFile(raw) : raw);
  }

  const effectiveFile = await getEffectiveDbPath();
  const readFilePath = effectiveFile === TMP_DB_FILE && (await fileExists(TMP_DB_FILE)) ? TMP_DB_FILE : DB_FILE;
  const raw = await fs.readFile(readFilePath, "utf8");
  return withDefaults(parseJsonFile(raw));
}

async function writeData(data) {
  if (USE_REMOTE_DB) {
    await kvCommand("SET", REMOTE_DB_KEY, JSON.stringify(withDefaults(data)));
    return;
  }

  const effectiveFile = await getEffectiveDbPath();
  const writeFilePath = effectiveFile || DB_FILE;

  try {
    await fs.writeFile(writeFilePath, JSON.stringify(withDefaults(data), null, 2) + "\n", "utf8");
  } catch (error) {
    if (error.code === "EROFS" || error.code === "ENOTDIR" || error.code === "EACCES") {
      await fs.writeFile(TMP_DB_FILE, JSON.stringify(withDefaults(data), null, 2) + "\n", "utf8");
      return;
    }
    throw error;
  }
}

module.exports = {
  readData,
  writeData,
};

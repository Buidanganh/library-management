const fs = require("fs/promises");
const path = require("path");

const DB_FILE = process.env.VERCEL
  ? path.join("/tmp", "library.db.json")
  : path.join(__dirname, "library.db.json");

const defaultData = {
  users: [
    {
      id: 1,
      fullName: "Quan tri vien",
      email: "admin@gmail.com",
      passwordHash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
      role: "admin",
    },
  ],
  books: [
    {
      id: 1,
      title: "Clean Code",
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
      author: "Kyle Simpson",
      category: "JavaScript",
      publisher: "O'Reilly",
      year: "2015",
      quantity: 8,
      shelfLocation: "Ke C1",
      description: "Giai thich sau ve ngon ngu JavaScript."
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withDefaults(data) {
  return {
    users: Array.isArray(data.users) && data.users.length > 0 ? data.users : clone(defaultData.users),
    books: Array.isArray(data.books) ? data.books : clone(defaultData.books),
    readers: Array.isArray(data.readers) ? data.readers : clone(defaultData.readers),
    loans: Array.isArray(data.loans) ? data.loans : clone(defaultData.loans),
  };
}

async function ensureDatabase() {
  if (!(await fileExists(DB_FILE))) {
    const oldDataFile = path.join(__dirname, "data.json");
    if (await fileExists(oldDataFile)) {
      const oldData = JSON.parse(await fs.readFile(oldDataFile, "utf8"));
      await writeData(withDefaults(oldData));
      return;
    }

    await writeData(clone(defaultData));
  }
}

async function readData() {
  await ensureDatabase();
  const raw = await fs.readFile(DB_FILE, "utf8");
  return withDefaults(JSON.parse(raw));
}

async function writeData(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(withDefaults(data), null, 2) + "\n", "utf8");
}

module.exports = {
  readData,
  writeData,
};

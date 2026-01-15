PRAGMA foreign_keys=ON;

-- USERS (login)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,      -- hash (scrypt/bcrypt-like; kita pakai WebCrypto SHA-256 + salt simple untuk sample)
  salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,              -- random token
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- MATERIALS
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode TEXT UNIQUE NOT NULL,
  jenis TEXT NOT NULL,              -- Aluminium | Besi | Stainless
  deskripsi TEXT NOT NULL,
  berat_per_meter REAL NOT NULL DEFAULT 0,
  luas_per_meter REAL NOT NULL DEFAULT 0,
  panjang_las REAL NOT NULL DEFAULT 0
);

-- ACCESSORIES
CREATE TABLE IF NOT EXISTS accessories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode TEXT UNIQUE NOT NULL,
  nama TEXT NOT NULL,
  satuan TEXT NOT NULL
);

-- ITEMS
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode TEXT UNIQUE NOT NULL,
  nama TEXT NOT NULL,
  dimensi TEXT NOT NULL,
  buyer TEXT NOT NULL
);

-- BOMS (header)
CREATE TABLE IF NOT EXISTS boms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_code TEXT UNIQUE NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- BOM LINES (material lines)
CREATE TABLE IF NOT EXISTS bom_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  nama_komponen TEXT NOT NULL,
  material_kode TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  panjang_mm REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE CASCADE,
  FOREIGN KEY (material_kode) REFERENCES materials(kode)
);

-- BOM ACCESSORIES (accessory lines)
CREATE TABLE IF NOT EXISTS bom_accessories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  accessory_kode TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE CASCADE,
  FOREIGN KEY (accessory_kode) REFERENCES accessories(kode)
);

-- SETTINGS (logo key etc)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- SEED minimal data (optional, bisa lo hapus)
INSERT OR IGNORE INTO materials (kode, jenis, deskripsi, berat_per_meter, luas_per_meter, panjang_las) VALUES
('M01020','Aluminium','Alluminium Plat Strep 145x5mm',1.964,0.300,60),
('M12006','Aluminium','Alluminium Hollow SQ. 76x76x2mm R0,4',1.603,0.304,60.8);

INSERT OR IGNORE INTO accessories (kode, nama, satuan) VALUES
('ACC-M6','Adjuster M6','Pcs');

INSERT OR IGNORE INTO items (kode, nama, dimensi, buyer) VALUES
('SDN-CS','Sedona Counter Stool','500x500x800mm','DANAO'),
('SDN-BS','Sedona Bar Stool','480x480x760mm','DANAO');

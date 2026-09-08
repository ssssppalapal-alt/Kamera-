const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// ==== KONFIGURASI ====
const ADMIN_PASSWORD = '312312322'; // Sandi admin kamu
const RETENTION_DAYS = 30;          // Hapus otomatis setelah 30 hari
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const META_FILE = path.join(__dirname, 'meta.json');

// Buat folder uploads & meta.json jika belum ada
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, '[]');

// Membaca data meta dari file ke memory
let metaData = [];
try {
  metaData = JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
} catch (e) {
  metaData = [];
}

function saveMeta() {
  fs.writeFileSync(META_FILE, JSON.stringify(metaData, null, 2));
}

// ==== MULTER (Konfigurasi Upload) ====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    cb(null, name);
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==== ROUTE 1: UPLOAD FOTO (Otomatis tiap 2-3 detik) ====
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada foto' });

  metaData.push({
    filename: req.file.filename,
    createdAt: new Date().toISOString()
  });
  saveMeta();

  res.json({ ok: true, filename: req.file.filename });
});

// ==== ROUTE 2: CEK PIN & AMBIL FOTO ADMIN ====
app.post('/api/admin/photos', (req, res) => {
  const { password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Kode salah! Akses ditolak.' });
  }

  // Kirim daftar foto terbaru dulu
  const photos = metaData
    .slice()
    .reverse()
    .map(p => ({
      url: `/uploads/${p.filename}`,
      createdAt: p.createdAt
    }));

  res.json({ ok: true, photos });
});

// ==== CLEANUP FOTO LAMA (> 30 Hari) ====
function cleanupOldPhotos() {
  const now = Date.now();
  const cutoff = RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const remaining = [];
  for (const item of metaData) {
    const age = now - new Date(item.createdAt).getTime();
    if (age > cutoff) {
      const filePath = path.join(UPLOAD_DIR, item.filename);
      fs.unlink(filePath, () => {});
    } else {
      remaining.push(item);
    }
  }
  metaData = remaining;
  saveMeta();
}

// Jalankan pembersihan tiap jam & saat server dinyalakan
cron.schedule('0 * * * *', cleanupOldPhotos);
cleanupOldPhotos();

app.listen(PORT, () => {
  console.log(`Server aktif di port ${PORT}`);
});

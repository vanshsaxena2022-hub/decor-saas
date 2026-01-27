require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;

/* ===================== AUTH MIDDLEWARE ===================== */
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/* ===================== ADMIN LOGIN ===================== */
/* NO SIGNUP, NO PASSWORD CHANGE */
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;

  const q = await pool.query(
    "SELECT * FROM admins WHERE email=$1",
    [email]
  );

  if (!q.rows.length) return res.sendStatus(401);

  const admin = q.rows[0];
  const ok = await bcrypt.compare(password, admin.password);
  if (!ok) return res.sendStatus(401);

  const token = jwt.sign(
    { shop_id: admin.shop_id, role: admin.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, shop_id: admin.shop_id });
});

/* ===================== FILE UPLOAD (IMAGES ONLY) ===================== */
const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      cb(null, Date.now() + "-" + safe);
    }
  })
});

/* ===================== SHOP INFO (CUSTOMER + ADMIN) ===================== */
app.get("/api/shop/:id", async (req, res) => {
  const q = await pool.query(
    "SELECT id, name, tagline, logo_url, phone, address FROM shops WHERE id=$1",
    [req.params.id]
  );
  if (!q.rows.length) return res.sendStatus(404);
  res.json(q.rows[0]);
});

/* ===================== PRODUCTS (CUSTOMER) ===================== */
app.get("/api/products", async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: "shop missing" });

  const q = await pool.query(
    `
    SELECT id, category, description, image_urls, ar_model
    FROM products
    WHERE shop_id=$1
    ORDER BY created_at DESC
    `,
    [shop]
  );

  res.json(q.rows);
});

app.get("/api/product/:id", async (req, res) => {
  const q = await pool.query(
    "SELECT * FROM products WHERE id=$1",
    [req.params.id]
  );
  if (!q.rows.length) return res.sendStatus(404);
  res.json(q.rows[0]);
});

/* ===================== PRODUCTS (ADMIN) ===================== */
app.post(
  "/api/admin/product",
  auth,
  upload.array("images", 6),
  async (req, res) => {
    const { category, description } = req.body;
    if (!category) return res.status(400).json({ error: "category required" });

    const images = (req.files || []).map(f => "/uploads/" + f.filename);
    if (!images.length)
      return res.status(400).json({ error: "images required" });

    await pool.query(
      `
      INSERT INTO products
      (id, shop_id, category, description, image_urls)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [
        uuidv4(),
        req.user.shop_id,
        category,
        description || "",
        images
      ]
    );

    res.json({ status: "created" });
  }
);

app.put("/api/admin/product/:id", auth, async (req, res) => {
  const { category, description } = req.body;

  await pool.query(
    `
    UPDATE products
    SET category=$1, description=$2
    WHERE id=$3 AND shop_id=$4
    `,
    [category, description || "", req.params.id, req.user.shop_id]
  );

  res.json({ status: "updated" });
});

app.delete("/api/admin/product/:id", auth, async (req, res) => {
  await pool.query(
    "DELETE FROM products WHERE id=$1 AND shop_id=$2",
    [req.params.id, req.user.shop_id]
  );
  res.json({ status: "deleted" });
});

/* ===================== AR (SUPER ADMIN ONLY – MANUAL) ===================== */
/* You update ar_model directly in DB or Postman */

/* ===================== EVENTS (ANALYTICS) ===================== */
app.post("/api/event", async (req, res) => {
  const { shop_id, product_id, type } = req.body;
  if (!shop_id || !type) return res.sendStatus(400);

  await pool.query(
    `
    INSERT INTO events
    (id, shop_id, product_id, type)
    VALUES ($1,$2,$3,$4)
    `,
    [uuidv4(), shop_id, product_id || null, type]
  );

  res.json({ ok: true });
});

app.get("/api/analytics", async (req, res) => {
  const { shop, range } = req.query;
  if (!shop) return res.status(400).json({ error: "shop missing" });

  let interval = "7 days";
  if (range === "15") interval = "15 days";
  if (range === "30") interval = "30 days";
  if (range === "365") interval = "365 days";

  const q = await pool.query(
    `
    SELECT type, COUNT(*)::int AS count
    FROM events
    WHERE shop_id=$1
      AND created_at >= NOW() - INTERVAL '${interval}'
    GROUP BY type
    `,
    [shop]
  );

  const out = {};
  q.rows.forEach(r => out[r.type] = r.count);

  res.json({
    visitors: out.shop_view || 0,
    product_views: out.product_view || 0,
    whatsapp: out.whatsapp || 0,
    ar_views: out.ar_view || 0
  });
});

/* ===================== STATIC FILES ===================== */
app.use(express.static(path.join(__dirname, "public")));

/* ===================== START ===================== */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("✅ Server locked & running on port", PORT);
});

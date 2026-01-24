require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("public"));

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  res.json({ status: "LIVE", time: new Date() });
});

app.get("/test-db", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW()");
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ================= SHOP CREATE ================= */
app.post("/shop/create", async (req, res) => {
  try {
    const { name, phone, logo_url } = req.body;
    const id = uuidv4();

    await pool.query(
      `INSERT INTO shops(id,name,phone,logo_url)
       VALUES($1,$2,$3,$4)`,
      [id, name, phone, logo_url || null]
    );

    res.json({ id, name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ================= ADD PRODUCT ================= */
app.post("/admin/product/add", async (req, res) => {
  try {
    const { shop_id, name, category, image_url, ar_url } = req.body;
    const id = uuidv4();

    await pool.query(
      `INSERT INTO products(id,shop_id,name,category,image_url,ar_url)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [id, shop_id, name, category, image_url, ar_url]
    );

    res.json({ success: true, product_id: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ================= PUBLIC PRODUCTS ================= */
app.get("/api/products", async (req, res) => {
  try {
    const shopId = req.query.shop;
    if (!shopId) {
      return res.status(400).json({ error: "shop id missing" });
    }

    const q = await pool.query(
      `SELECT id, name, description, category, image_url, ar_url
       FROM products
       WHERE shop_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [shopId]
    );

    res.json(q.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to load products" });
  }
});

app.get("/buy/:product_id", async (req, res) => {
  try {
    const { product_id } = req.params;

    const q = await pool.query(`
      SELECT p.name, p.image_url, s.name AS shop_name, s.phone
      FROM products p
      JOIN shops s ON p.shop_id = s.id
      WHERE p.id = $1
    `, [product_id]);

    if (!q.rows.length) return res.send("Invalid product");

    const p = q.rows[0];

    const msg = `
Hi, I'm interested in buying this product:

🛒 Product: ${p.name}
🏪 Shop: ${p.shop_name}
📸 Image: ${p.image_url}

Please share price & delivery details.
    `;

    const wa = `https://wa.me/91${p.phone}?text=${encodeURIComponent(msg)}`;
    res.redirect(wa);

  } catch (e) {
    res.send("Something went wrong");
  }
});


/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.json({ status: "Decor SaaS backend running" });
});

/* ================= START ================= */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});

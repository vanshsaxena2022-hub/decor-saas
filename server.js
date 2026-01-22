require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const QRCode = require("qrcode");

const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "LIVE" });
});

app.use(cors());
app.use(express.static("public"));
app.use("/assets", express.static("assets"));

const PORT = process.env.PORT || 4000;

/* ================= HOME (QR TARGET) ================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ================= CATEGORY ================= */
app.get("/category/:name", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "category.html"));
});

/* ================= PRODUCT ================= */
app.get("/product/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "product.html"));
});

/* ================= AR VIEW ================= */
app.get("/ar/:id", (req, res) => {
  res.send(`
    <html>
      <body style="font-family:Arial;text-align:center">
        <h2>View It Live (AR Demo)</h2>
        <p>This is a demo AR preview</p>

        <model-viewer 
          src="https://modelviewer.dev/shared-assets/models/Astronaut.glb"
          ar 
          auto-rotate 
          camera-controls
          style="width:100%;height:400px">
        </model-viewer>

        <script src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
      </body>
    </html>
  `);
});


app.get("/get-qr", async (req, res) => {
  const url = "http://localhost:4000"; // later replace with live URL

  try {
    const qr = await QRCode.toDataURL(url);
    res.send(`
      <html>
        <body style="text-align:center;font-family:Arial">
          <h2>Scan This QR</h2>
          <img src="${qr}" />
          <p>${url}</p>
        </body>
      </html>
    `);
  } catch (e) {
    res.send("QR generation failed");
  }
});

// ================= SHOP DATA API =================
app.get("/api/shop/:shop_id", async (req, res) => {
  try {
    const { shop_id } = req.params;

    // Get shop
    const shop = await pool.query(
      "SELECT id, name, phone, logo_url FROM shops WHERE id=$1",
      [shop_id]
    );

    if (!shop.rows.length) {
      return res.status(404).json({ error: "Shop not found" });
    }

    // Get products
    const products = await pool.query(
      `SELECT id, name, description, category, image_url, ar_url
       FROM products
       WHERE shop_id=$1 AND is_active=true`,
      [shop_id]
    );

    const categories = [
      ...new Set(products.rows.map(p => p.category))
    ];

    res.json({
      shop: shop.rows[0],
      categories,
      products: products.rows
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const pool = require("./db");

app.get("/test-db", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW()");
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


/* ================= START ================= */
app.listen(PORT, () => {
  console.log("Decor SaaS running on port", PORT);
});
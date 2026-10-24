const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const root = __dirname;
const dataDirectory = path.join(root, "data");
const databasePath = path.join(dataDirectory, "stars-kids.sqlite");
const port = Number(process.env.PORT || 3000);
const adminPassword = process.env.ADMIN_PASSWORD;
const sessions = new Map();
const requestBuckets = new Map();
const sessionDurationMs = 8 * 60 * 60 * 1000;
const categories = new Set(["babywear", "girlswear", "boyswear", "accessories"]);
const productColumns = "id, category, name_ar, name_en, description_ar, description_en, price, currency, stock, image_url, is_sample, created_at, updated_at";

if (!adminPassword || adminPassword.length < 12) {
  console.error("Set ADMIN_PASSWORD to a value of at least 12 characters before starting the server.");
  process.exit(1);
}

fs.mkdirSync(dataDirectory, { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('babywear', 'girlswear', 'boyswear', 'accessories')),
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description_ar TEXT NOT NULL,
    description_en TEXT NOT NULL,
    price REAL NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'EGP',
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    image_url TEXT NOT NULL,
    is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS customer_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const initialProducts = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
const insertInitialProduct = database.prepare(`
  INSERT OR IGNORE INTO products
    (id, category, name_ar, name_en, description_ar, description_en, price, currency, stock, image_url, is_sample)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1)
`);
for (const product of initialProducts) {
  const price = Number.parseFloat(product.price);
  insertInitialProduct.run(
    product.id,
    product.category,
    product.nameAr,
    product.nameEn,
    product.descriptionAr,
    product.descriptionEn,
    Number.isFinite(price) ? price : 0,
    "EGP",
    product.image
  );
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function getClientAddress(request) {
  return request.socket.remoteAddress || "unknown";
}

function isRateLimited(key, limit, intervalMs) {
  const now = Date.now();
  const recent = (requestBuckets.get(key) || []).filter(timestamp => now - timestamp < intervalMs);
  recent.push(now);
  requestBuckets.set(key, recent);
  return recent.length > limit;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 16_384) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isSameOriginWrite(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function getSession(request) {
  const cookies = request.headers.cookie || "";
  const token = cookies.split(";").map(cookie => cookie.trim()).find(cookie => cookie.startsWith("stars_session="))?.slice("stars_session=".length);
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + sessionDurationMs);
  return true;
}

function requireAdmin(request, response) {
  if (getSession(request)) return true;
  sendJson(response, 401, { error: "Authentication required" });
  return false;
}

function validateProduct(body) {
  const product = {
    id: cleanText(body.id, 80),
    category: cleanText(body.category, 30),
    name_ar: cleanText(body.name_ar, 120),
    name_en: cleanText(body.name_en, 120),
    description_ar: cleanText(body.description_ar, 1000),
    description_en: cleanText(body.description_en, 1000),
    price: Number(body.price),
    currency: cleanText(body.currency, 8).toUpperCase(),
    stock: Number(body.stock),
    image_url: cleanText(body.image_url, 2000),
    is_sample: body.is_sample === true
  };
  let image;
  try {
    image = new URL(product.image_url);
  } catch {
    image = null;
  }
  if (!product.id || !/^[a-z0-9-]+$/i.test(product.id)
    || !categories.has(product.category)
    || !product.name_ar || !product.name_en
    || !product.description_ar || !product.description_en
    || !Number.isFinite(product.price) || product.price < 0
    || !/^[A-Z]{3,8}$/.test(product.currency)
    || !Number.isInteger(product.stock) || product.stock < 0
    || !image || image.protocol !== "https:") {
    return null;
  }
  return product;
}

function serveStatic(request, response, pathname) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const allowed = new Set(["index.html", "contact.html", "product.html", "admin.html", "styles.css", "contact.css", "catalog.css", "product.css", "admin.css", "script.js", "product-page.js", "admin.js"]);
  const fullPath = path.resolve(root, requested);
  const assetsRoot = path.resolve(root, "assets");
  const isAsset = requested.startsWith("assets/");
  if ((!allowed.has(requested) && !isAsset)
    || (isAsset && !fullPath.startsWith(assetsRoot + path.sep))
    || !fullPath.startsWith(root + path.sep)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
  };
  response.writeHead(200, {
    "Content-Type": contentTypes[path.extname(fullPath).toLowerCase()] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff"
  });
  fs.createReadStream(fullPath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = url.pathname;
  try {
    if (request.method === "GET" && pathname === "/api/products") {
      const products = database.prepare(`SELECT ${productColumns} FROM products ORDER BY created_at DESC, id`).all();
      sendJson(response, 200, products);
      return;
    }

    const productMatch = pathname.match(/^\/api\/products\/([a-z0-9-]+)$/i);
    if (request.method === "GET" && productMatch) {
      const product = database.prepare(`SELECT ${productColumns} FROM products WHERE id = ?`).get(productMatch[1]);
      sendJson(response, product ? 200 : 404, product || { error: "Product not found" });
      return;
    }

    if (request.method === "POST" && pathname === "/api/inquiries") {
      if (!isSameOriginWrite(request)) {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return;
      }
      if (isRateLimited(`inquiries:${getClientAddress(request)}`, 5, 60 * 60 * 1000)) {
        sendJson(response, 429, { error: "Too many inquiries. Try again later." });
        return;
      }
      const body = await readJson(request);
      const name = cleanText(body.name, 100);
      const phone = cleanText(body.phone, 20);
      const category = cleanText(body.category, 30);
      const message = cleanText(body.message, 500);
      if (!name || !/^[0-9+\s()-]{7,20}$/.test(phone) || !categories.has(category) && category !== "other") {
        sendJson(response, 400, { error: "Please provide a valid name, phone number and category." });
        return;
      }
      const result = database.prepare(
        "INSERT INTO customer_inquiries (name, phone, category, message) VALUES (?, ?, ?, ?)"
      ).run(name, phone, category, message);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), saved: true });
      return;
    }

    if (pathname.startsWith("/api/admin/")) {
      if (!isSameOriginWrite(request) && request.method !== "GET") {
        sendJson(response, 403, { error: "Cross-origin request rejected" });
        return;
      }

      if (request.method === "GET" && pathname === "/api/admin/session") {
        sendJson(response, 200, { authenticated: getSession(request) });
        return;
      }

      if (request.method === "POST" && pathname === "/api/admin/login") {
        if (isRateLimited(`login:${getClientAddress(request)}`, 10, 15 * 60 * 1000)) {
          sendJson(response, 429, { error: "Too many login attempts. Try again later." });
          return;
        }
        const body = await readJson(request);
        const submittedHash = crypto.createHash("sha256").update(String(body.password || "")).digest();
        const expectedHash = crypto.createHash("sha256").update(adminPassword).digest();
        if (!crypto.timingSafeEqual(submittedHash, expectedHash)) {
          sendJson(response, 401, { error: "Incorrect password" });
          return;
        }
        const token = crypto.randomBytes(32).toString("base64url");
        sessions.set(token, Date.now() + sessionDurationMs);
        const secure = request.socket.encrypted || process.env.NODE_ENV === "production" ? "; Secure" : "";
        sendJson(response, 200, { authenticated: true }, {
          "Set-Cookie": `stars_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionDurationMs / 1000}${secure}`
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/admin/logout") {
        const cookies = request.headers.cookie || "";
        const token = cookies.split(";").map(cookie => cookie.trim()).find(cookie => cookie.startsWith("stars_session="))?.slice("stars_session=".length);
        if (token) sessions.delete(token);
        sendJson(response, 200, { authenticated: false }, {
          "Set-Cookie": "stars_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
        });
        return;
      }

      if (!requireAdmin(request, response)) return;

      if (request.method === "GET" && pathname === "/api/admin/inquiries") {
        const inquiries = database.prepare("SELECT id, name, phone, category, message, created_at FROM customer_inquiries ORDER BY id DESC LIMIT 500").all();
        sendJson(response, 200, inquiries);
        return;
      }

      const inquiryMatch = pathname.match(/^\/api\/admin\/inquiries\/(\d+)$/);
      if (inquiryMatch && request.method === "DELETE") {
        const result = database.prepare("DELETE FROM customer_inquiries WHERE id=?").run(Number(inquiryMatch[1]));
        sendJson(response, Number(result.changes) ? 200 : 404, Number(result.changes) ? { deleted: true } : { error: "Inquiry not found" });
        return;
      }

      if (request.method === "POST" && pathname === "/api/admin/products") {
        const product = validateProduct(await readJson(request));
        if (!product) {
          sendJson(response, 400, { error: "Product information is invalid." });
          return;
        }
        try {
          database.prepare(`
            INSERT INTO products (${productColumns.split(", ").slice(0, 11).join(", ")})
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(product.id, product.category, product.name_ar, product.name_en, product.description_ar, product.description_en, product.price, product.currency, product.stock, product.image_url, Number(product.is_sample));
        } catch (error) {
          if (error.code === "ERR_SQLITE_ERROR") {
            sendJson(response, 409, { error: "A product with this ID already exists." });
            return;
          }
          throw error;
        }
        sendJson(response, 201, { id: product.id });
        return;
      }

      const adminProductMatch = pathname.match(/^\/api\/admin\/products\/([a-z0-9-]+)$/i);
      if (adminProductMatch && request.method === "PUT") {
        const product = validateProduct({ ...(await readJson(request)), id: adminProductMatch[1] });
        if (!product) {
          sendJson(response, 400, { error: "Product information is invalid." });
          return;
        }
        const result = database.prepare(`
          UPDATE products SET category=?, name_ar=?, name_en=?, description_ar=?, description_en=?,
            price=?, currency=?, stock=?, image_url=?, is_sample=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
        `).run(product.category, product.name_ar, product.name_en, product.description_ar, product.description_en, product.price, product.currency, product.stock, product.image_url, Number(product.is_sample), product.id);
        sendJson(response, Number(result.changes) ? 200 : 404, Number(result.changes) ? { id: product.id } : { error: "Product not found" });
        return;
      }

      if (adminProductMatch && request.method === "DELETE") {
        const result = database.prepare("DELETE FROM products WHERE id=?").run(adminProductMatch[1]);
        sendJson(response, Number(result.changes) ? 200 : 404, Number(result.changes) ? { deleted: true } : { error: "Product not found" });
        return;
      }

      sendJson(response, 404, { error: "Admin endpoint not found" });
      return;
    }

    if (request.method === "GET") {
      serveStatic(request, response, pathname);
      return;
    }
    sendJson(response, 405, { error: "Method not allowed" }, { Allow: "GET, POST, PUT, DELETE" });
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, error.status || 500, { error: error.status ? error.message : "The request could not be completed." });
    }
    if (!error.status) console.error("Request failed:", error);
  }
});

server.listen(port, () => {
  console.log(`Stars Kids website running at http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});

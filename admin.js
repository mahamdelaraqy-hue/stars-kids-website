const loginPanel = document.querySelector("#loginPanel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#loginForm");
const productForm = document.querySelector("#productForm");
const productsElement = document.querySelector("#adminProducts");
const inquiriesElement = document.querySelector("#adminInquiries");
const productStatus = document.querySelector("#productStatus");
const sampleField = document.querySelector("#productSample");
let products = [];
let editingId = null;

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
  } catch {
    throw new Error("تعذر الاتصال بخادم الموقع. شغّل npm.cmd start في PowerShell واترك النافذة مفتوحة.");
  }

  const responseText = await response.text();
  let result;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(`الخادم رجّع ردًا غير متوقع (HTTP ${response.status}). تأكد أنك فتحت الموقع من عنوان الخادم، مثل http://localhost:3000/admin.html.`);
  }
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}

function setDashboardVisible(visible) {
  loginPanel.hidden = visible;
  dashboard.hidden = !visible;
}

function resetProductForm() {
  editingId = null;
  productForm.reset();
  document.querySelector("#productCurrency").value = "EGP";
  document.querySelector("#productFormTitle").textContent = "إضافة منتج";
  document.querySelector("#saveProductButton").textContent = "حفظ المنتج";
  document.querySelector("#productId").disabled = false;
  document.querySelector("#cancelEditButton").hidden = true;
  productStatus.textContent = "";
}

function renderProducts() {
  productsElement.replaceChildren();
  if (!products.length) {
    const empty = document.createElement("p");
    empty.className = "empty-admin-list";
    empty.textContent = "لا توجد منتجات بعد.";
    productsElement.append(empty);
    return;
  }

  for (const product of products) {
    const row = document.createElement("article");
    row.className = "admin-product-row";
    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = `${product.name_ar} (${product.id})`;
    const price = document.createElement("p");
    price.textContent = `السعر: ${product.price} ${product.currency}`;
    const stock = document.createElement("p");
    stock.textContent = `المخزون: ${product.stock}${product.is_sample ? " — تجريبي" : ""}`;
    info.append(title, price, stock);

    const actions = document.createElement("div");
    actions.className = "admin-row-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.action = "edit";
    edit.dataset.id = product.id;
    edit.textContent = "تعديل";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-product";
    remove.dataset.action = "delete";
    remove.dataset.id = product.id;
    remove.textContent = "حذف";
    actions.append(edit, remove);
    row.append(info, actions);
    productsElement.append(row);
  }
}

function renderInquiries(inquiries) {
  inquiriesElement.replaceChildren();
  if (!inquiries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-admin-list";
    empty.textContent = "لا توجد استفسارات محفوظة حتى الآن.";
    inquiriesElement.append(empty);
    return;
  }
  for (const inquiry of inquiries) {
    const row = document.createElement("article");
    row.className = "inquiry-row";
    const name = document.createElement("strong");
    name.textContent = inquiry.name;
    const details = document.createElement("div");
    details.textContent = `${inquiry.phone} — ${inquiry.category}${inquiry.message ? ` — ${inquiry.message}` : ""}`;
    const date = document.createElement("time");
    date.textContent = inquiry.created_at;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-inquiry";
    remove.dataset.id = inquiry.id;
    remove.textContent = "حذف الاستفسار";
    row.append(name, details, date, remove);
    inquiriesElement.append(row);
  }
}

async function refreshDashboard() {
  const [loadedProducts, inquiries] = await Promise.all([
    apiRequest("/api/products"),
    apiRequest("/api/admin/inquiries")
  ]);
  products = loadedProducts;
  renderProducts();
  renderInquiries(inquiries);
}

function editProduct(product) {
  editingId = product.id;
  for (const [key, value] of Object.entries(product)) {
    const field = productForm.elements.namedItem(key);
    if (field && key !== "created_at" && key !== "updated_at") {
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value;
    }
  }
  document.querySelector("#productId").disabled = true;
  document.querySelector("#productFormTitle").textContent = "تعديل المنتج";
  document.querySelector("#saveProductButton").textContent = "حفظ التعديلات";
  document.querySelector("#cancelEditButton").hidden = false;
  productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const status = document.querySelector("#loginStatus");
  status.textContent = "";
  try {
    await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: loginForm.elements.password.value })
    });
    loginForm.reset();
    await refreshDashboard();
    setDashboardVisible(true);
  } catch (error) {
    status.textContent = error.message === "Incorrect password"
      ? "كلمة المرور غير صحيحة. استخدم نفس كلمة المرور التي أدخلتها في PowerShell قبل تشغيل الخادم."
      : error.message;
  }
});

productForm.addEventListener("submit", async event => {
  event.preventDefault();
  productStatus.textContent = "";
  const product = Object.fromEntries(new FormData(productForm).entries());
  product.price = Number(product.price);
  product.stock = Number(product.stock);
  product.is_sample = sampleField.checked;
  try {
    await apiRequest(editingId ? `/api/admin/products/${encodeURIComponent(editingId)}` : "/api/admin/products", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(product)
    });
    resetProductForm();
    await refreshDashboard();
  } catch (error) {
    productStatus.textContent = error.message;
  }
});

productsElement.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const product = products.find(item => item.id === button.dataset.id);
  if (!product) return;
  if (button.dataset.action === "edit") {
    editProduct(product);
    return;
  }
  if (button.dataset.action === "delete" && window.confirm(`حذف المنتج "${product.name_ar}"؟`)) {
    try {
      await apiRequest(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
      await refreshDashboard();
      if (editingId === product.id) resetProductForm();
    } catch (error) {
      window.alert(error.message);
    }
  }
});

inquiriesElement.addEventListener("click", async event => {
  const button = event.target.closest("button.delete-inquiry");
  if (!button || !window.confirm("حذف بيانات هذا الاستفسار؟")) return;
  try {
    await apiRequest(`/api/admin/inquiries/${button.dataset.id}`, { method: "DELETE" });
    await refreshDashboard();
  } catch (error) {
    window.alert(error.message);
  }
});

document.querySelector("#cancelEditButton").addEventListener("click", resetProductForm);
document.querySelector("#logoutButton").addEventListener("click", async () => {
  try {
    await apiRequest("/api/admin/logout", { method: "POST", body: "{}" });
    setDashboardVisible(false);
  } catch (error) {
    window.alert(error.message);
  }
});

apiRequest("/api/admin/session")
  .then(async session => {
    if (session.authenticated) {
      await refreshDashboard();
      setDashboardVisible(true);
    }
  })
  .catch(error => {
    document.querySelector("#loginStatus").textContent = error.message;
  });

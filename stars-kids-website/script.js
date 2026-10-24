const menuToggle = document.querySelector("#menuToggle");
const mainNav = document.querySelector("#mainNav");
const languageToggle = document.querySelector("#languageToggle");
let currentLanguage = "ar";
let allProducts = [];

const productText = (product, field) => product[`${field}_${currentLanguage}`] || "";

const categoryNames = {
  babywear: ["ملابس الرضع", "Babywear"],
  girlswear: ["ملابس البنات", "Girlswear"],
  boyswear: ["ملابس الأولاد", "Boyswear"],
  accessories: ["إكسسوارات", "Accessories"]
};

function renderProducts() {
  const productGrid = document.querySelector("#productGrid");
  if (!productGrid) return;
  productGrid.replaceChildren();
  for (const product of allProducts) {
    const card = document.createElement("article");
    card.className = "product-card";
    const imageLink = document.createElement("a");
    imageLink.href = `product.html?id=${encodeURIComponent(product.id)}`;
    const image = document.createElement("img");
    image.className = "product-image";
    image.src = product.image_url;
    image.alt = productText(product, "name");
    image.loading = "lazy";
    imageLink.append(image);

    const body = document.createElement("div");
    body.className = "product-body";
    const category = document.createElement("span");
    category.className = "product-category";
    category.textContent = categoryNames[product.category]?.[currentLanguage === "ar" ? 0 : 1] || product.category;
    const name = document.createElement("h3");
    const nameLink = document.createElement("a");
    nameLink.href = imageLink.href;
    nameLink.textContent = productText(product, "name");
    name.append(nameLink);
    const description = document.createElement("p");
    description.textContent = productText(product, "description");
    const meta = document.createElement("div");
    meta.className = "product-meta";
    const price = document.createElement("strong");
    price.textContent = `${Number(product.price).toLocaleString(currentLanguage === "ar" ? "ar-EG" : "en-US")} ${product.currency}`;
    const detailLink = document.createElement("a");
    detailLink.href = imageLink.href;
    detailLink.textContent = currentLanguage === "ar" ? "تفاصيل المنتج" : "Product details";
    meta.append(price, detailLink);
    const availability = document.createElement("small");
    availability.className = product.stock > 0 ? "product-stock" : "product-stock is-empty";
    availability.textContent = product.stock > 0
      ? (currentLanguage === "ar" ? `متاح: ${product.stock}` : `In stock: ${product.stock}`)
      : (currentLanguage === "ar" ? "غير متوفر حاليًا" : "Currently unavailable");
    body.append(category, name, description, meta, availability);
    if (product.is_sample) {
      const sample = document.createElement("small");
      sample.className = "sample-tag";
      sample.textContent = currentLanguage === "ar" ? "صورة وبيانات تجريبية" : "Sample image and details";
      body.append(sample);
    }
    card.append(imageLink, body);
    productGrid.append(card);
  }
}

async function loadProducts() {
  const productGrid = document.querySelector("#productGrid");
  if (!productGrid) return;
  try {
    const response = await fetch("/api/products");
    const products = await response.json();
    if (!response.ok) throw new Error(products.error || "Product list could not be loaded");
    allProducts = products;
    renderProducts();
  } catch {
    const message = document.createElement("p");
    message.className = "no-products";
    message.textContent = currentLanguage === "ar"
      ? "تعذر تحميل المنتجات. شغلوا الموقع باستخدام أمر npm start."
      : "Products could not be loaded. Start the website using npm start.";
    productGrid.replaceChildren(message);
  }
}

menuToggle.addEventListener("click", () => {
  const opened = mainNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(opened));
  menuToggle.textContent = opened ? "×" : "☰";
});

mainNav.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    mainNav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.textContent = "☰";
  });
});

languageToggle.addEventListener("click", () => {
  currentLanguage = currentLanguage === "ar" ? "en" : "ar";
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
  document.body.dir = document.documentElement.dir;
  document.querySelectorAll("[data-ar][data-en]").forEach(element => {
    element.textContent = element.dataset[currentLanguage];
  });
  document.querySelectorAll("[data-ar-placeholder][data-en-placeholder]").forEach(element => {
    element.placeholder = element.dataset[`${currentLanguage}Placeholder`];
  });
  renderProducts();
  languageToggle.textContent = currentLanguage === "ar" ? "EN" : "عربي";
  menuToggle.setAttribute("aria-label", currentLanguage === "ar" ? "فتح القائمة" : "Open menu");
});

document.querySelector("#year").textContent = new Date().getFullYear();
const customerForm = document.querySelector("#customerForm");

if (customerForm) {
  const requestedCategory = new URLSearchParams(window.location.search).get("category");
  const categoryField = document.querySelector("#customerCategory");
  if (requestedCategory && [...categoryField.options].some(option => option.value === requestedCategory)) {
    categoryField.value = requestedCategory;
  }

  customerForm.addEventListener("submit", async event => {
    event.preventDefault();
    const status = document.querySelector("#formStatus");
    const followup = document.querySelector("#whatsappFollowup");
    const name = document.querySelector("#customerName").value.trim();
    const phone = document.querySelector("#customerPhone").value.trim();
    const category = categoryField.value;
    const categoryLabel = categoryField.selectedOptions[0].textContent;
    const message = document.querySelector("#customerMessage").value.trim();
    status.textContent = currentLanguage === "ar" ? "جارٍ حفظ الاستفسار..." : "Saving your inquiry...";
    followup.hidden = true;

    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, category, message })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Inquiry could not be saved");
      const whatsappMessage = currentLanguage === "ar"
        ? `استفسار جديد من موقع Stars Kids\nالاسم: ${name}\nرقم الهاتف: ${phone}\nالتصنيف المطلوب: ${categoryLabel}\nالتفاصيل: ${message || "لا توجد"}`
        : `New inquiry from the Stars Kids website\nName: ${name}\nPhone: ${phone}\nCategory: ${categoryLabel}\nDetails: ${message || "None"}`;
      followup.href = `https://wa.me/201280027006?text=${encodeURIComponent(whatsappMessage)}`;
      followup.hidden = false;
      status.textContent = currentLanguage === "ar"
        ? "تم حفظ الاستفسار. اضغطوا على الزر لإكمال التواصل عبر واتساب."
        : "Your inquiry was saved. Use the button to continue on WhatsApp.";
      customerForm.reset();
      categoryField.value = category;
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

loadProducts();

const productLanguageToggle = document.querySelector("#languageToggle");
const productMenuToggle = document.querySelector("#menuToggle");
const productMainNav = document.querySelector("#mainNav");
let productLanguage = "ar";
let currentProduct = null;

productMenuToggle.addEventListener("click", () => {
  const opened = productMainNav.classList.toggle("open");
  productMenuToggle.setAttribute("aria-expanded", String(opened));
  productMenuToggle.textContent = opened ? "×" : "☰";
});
productMainNav.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    productMainNav.classList.remove("open");
    productMenuToggle.setAttribute("aria-expanded", "false");
    productMenuToggle.textContent = "☰";
  });
});

const productText = (product, key) => productLanguage === "ar" ? product[`${key}_ar`] : product[`${key}_en`];
const productCategory = category => {
  const labels = {
    babywear: ["ملابس الرضع", "Babywear"],
    girlswear: ["ملابس البنات", "Girlswear"],
    boyswear: ["ملابس الأولاد", "Boyswear"],
    accessories: ["إكسسوارات", "Accessories"]
  };
  return labels[category]?.[productLanguage === "ar" ? 0 : 1] || category;
};

function renderProductDetail() {
  const detail = document.querySelector("#productDetail");
  if (!currentProduct) return;
  detail.replaceChildren();

  const layout = document.createElement("article");
  layout.className = "product-detail-layout";
  const image = document.createElement("img");
  image.className = "product-detail-image";
  image.src = currentProduct.image_url;
  image.alt = productText(currentProduct, "name");
  image.onerror = () => image.removeAttribute("src");

  const copy = document.createElement("div");
  copy.className = "product-detail-copy";
  const category = document.createElement("span");
  category.className = "section-kicker";
  category.textContent = productCategory(currentProduct.category);
  const title = document.createElement("h1");
  title.textContent = productText(currentProduct, "name");
  const description = document.createElement("p");
  description.textContent = productText(currentProduct, "description");
  const price = document.createElement("strong");
  price.className = "product-detail-price";
  price.textContent = `${Number(currentProduct.price).toLocaleString(productLanguage === "ar" ? "ar-EG" : "en-US")} ${currentProduct.currency}`;
  const stock = document.createElement("p");
  stock.className = `stock-label${currentProduct.stock < 1 ? " is-empty" : ""}`;
  stock.textContent = currentProduct.stock > 0
    ? (productLanguage === "ar" ? `متاح: ${currentProduct.stock}` : `In stock: ${currentProduct.stock}`)
    : (productLanguage === "ar" ? "غير متوفر حاليًا" : "Currently unavailable");

  copy.append(category, title, description, price, stock);
  if (currentProduct.is_sample) {
    const warning = document.createElement("p");
    warning.className = "sample-warning";
    warning.textContent = productLanguage === "ar"
      ? "هذا المنتج وبياناته وصورته تجريبية. تحققوا من السعر والتوفر مع المتجر قبل الطلب."
      : "This product, its details and image are samples. Confirm the price and availability with the store before ordering.";
    copy.append(warning);
  }

  const actions = document.createElement("div");
  actions.className = "product-detail-actions";
  const backLink = document.createElement("a");
  backLink.className = "button button-outline-dark";
  backLink.href = "index.html#catalog";
  backLink.textContent = productLanguage === "ar" ? "رجوع للمنتجات" : "Back to products";
  actions.append(backLink);
  if (currentProduct.stock > 0) {
    const orderLink = document.createElement("a");
    orderLink.className = "button button-gold";
    orderLink.href = `https://wa.me/201280027006?text=${encodeURIComponent(`${productLanguage === "ar" ? "استفسار عن المنتج" : "Product inquiry"}: ${productText(currentProduct, "name")} (${currentProduct.id})`)}`;
    orderLink.target = "_blank";
    orderLink.rel = "noopener noreferrer";
    orderLink.textContent = productLanguage === "ar" ? "اسأل عبر واتساب" : "Ask on WhatsApp";
    actions.append(orderLink);
  }
  copy.append(actions);
  layout.append(image, copy);
  detail.append(layout);
  document.title = `${productText(currentProduct, "name")} | Stars Kids`;
}

productLanguageToggle.addEventListener("click", () => {
  productLanguage = productLanguage === "ar" ? "en" : "ar";
  document.documentElement.lang = productLanguage;
  document.documentElement.dir = productLanguage === "ar" ? "rtl" : "ltr";
  document.body.dir = document.documentElement.dir;
  document.querySelectorAll("[data-ar][data-en]").forEach(element => {
    element.textContent = element.dataset[productLanguage];
  });
  productLanguageToggle.textContent = productLanguage === "ar" ? "EN" : "عربي";
  if (currentProduct) renderProductDetail();
});

document.querySelector("#year").textContent = new Date().getFullYear();
const productId = new URLSearchParams(window.location.search).get("id");
if (!productId) {
  document.querySelector("#productDetail").innerHTML = '<p class="product-detail-error">لم يتم تحديد المنتج. <a href="index.html#catalog">تصفح المنتجات</a></p>';
} else {
  fetch(`/api/products/${encodeURIComponent(productId)}`)
    .then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Product not found");
      return result;
    })
    .then(product => {
      currentProduct = product;
      renderProductDetail();
    })
    .catch(() => {
      const detail = document.querySelector("#productDetail");
      detail.innerHTML = '<p class="product-detail-error">المنتج غير موجود أو تعذر تحميله. <a href="index.html#catalog">العودة للمنتجات</a></p>';
    });
}

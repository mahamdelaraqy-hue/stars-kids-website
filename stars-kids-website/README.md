# Stars Kids

Arabic-first children's clothing website with a Node.js server and a persistent SQLite catalog/inquiry database.

## Run locally (Windows PowerShell)
1. Install Node.js 24 or newer.
2. Open PowerShell in this project directory.
3. Set a private admin password and start the server:

   ```powershell
   $env:ADMIN_PASSWORD = "choose-a-private-password-of-12-or-more-characters"
   npm.cmd start
   ```

4. Open `http://localhost:3000`.
5. Manage products and inquiries at `http://localhost:3000/admin.html`.

The password is only set for the current PowerShell window. Do not publish it or commit it to the project. The admin login is protected by a password, HTTP-only same-site session cookie, same-origin write checks, and login throttling.

## Database and features
- SQLite is created automatically at `data/stars-kids.sqlite` on first start. The `data/` folder is ignored by Git and contains the live product and customer inquiry records.
- The first run imports the eight illustrative items from `products.json`. Their prices, images, descriptions, and stock are samples; sample products are clearly marked. Replace or edit them in the admin panel before treating them as real inventory.
- `/admin.html` lets the administrator add, edit, and delete products, update prices/currency and stock, and review up to 500 saved customer inquiries.
- `product.html?id=PRODUCT_ID` displays a product detail page using current database values.
- The contact form saves the inquiry to SQLite after consent and then provides a WhatsApp follow-up link.

## Production hosting
This is no longer a static-only site: deploy it to a host that runs Node.js 24+ and provides persistent disk storage. Set `ADMIN_PASSWORD` as a private environment variable and mount/persist the project's `data/` directory. Use HTTPS in production and back up `data/stars-kids.sqlite` regularly. A static-only host such as a plain file upload will not run the API or save inquiries.

## Files
- `server.js` — HTTP server, SQLite schema/seed, public product API, inquiry form endpoint, and authenticated admin API
- `products.json` — initial sample catalog used once to seed the database
- `admin.html`, `admin.js`, `admin.css` — authenticated product, inventory, price, and inquiry management
- `product.html`, `product-page.js`, `product.css` — product details page
- `index.html`, `script.js`, `styles.css`, `catalog.css` — storefront and product catalog
- `contact.html`, `contact.css` — contact links and inquiry form

## Notes
- Current product images use external Unsplash URLs as visual samples. Replace them with product photos you own or have permission to use.
- This project does not process payments or reserve stock. Orders are inquiries via WhatsApp.
- Customer phone numbers and messages are personal data. Restrict access to the admin page and set a retention/deletion policy before collecting real customer details.

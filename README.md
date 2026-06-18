# DairyDesk — Dairy Delivery & Billing Manager

A complete dairy delivery management web app: customers, deliveries, billing,
reports, and analytics — all in one place.

## Login
- Username: `admin`
- Password: `dairy123`

## Two ways to run this

### Option 1 — Single file (easiest)
Open `dairydesk_single_file.html` directly in any browser (Chrome, Firefox, Edge).
Everything — HTML, CSS, and JS — is bundled into this one file. No server needed.
Just double-click it.

### Option 2 — Multi-file source (for editing / hosting)
Open `index.html` in a browser, or upload this whole folder to any static host
(Netlify, Vercel, GitHub Pages). The files are:

- `index.html` — page structure
- `style.css` — all styling, including dark mode
- `data.js` — pricing config, persistence (localStorage), 60-day seed dataset
- `charts.js` — all Chart.js visualizations
- `customers.js` — customer CRUD, search, filters, pagination
- `deliveries.js` — delivery recording, multi-product rows, filters, pagination
- `billing.js` — monthly bill generation + PDF download
- `reports.js` — daily/weekly/monthly/revenue/product/buyers reports + Excel/PDF export
- `settings.js` — pricing editor, backup export, data reset
- `app.js` — auth, navigation, theme, dashboard

If you edit the multi-file version and want a single-file copy again, just
ask and it can be re-bundled.

## Pricing (editable in Settings page)
- Milk: ₹50 / litre
- Curd: ₹60 / 500g unit
- Buttermilk: ₹30 / litre
- Ghee: ₹1800 / kg

## Data
All data is stored in the browser's localStorage under keys prefixed `dd_`.
10 demo customers with ~60 days of delivery history are seeded automatically
on first load so every chart and report has real data immediately.

To wipe and reseed: Settings → Reset All Data.
To back up your data: Settings → Export Full Backup (downloads a JSON file).

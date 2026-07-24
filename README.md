# SaveQart

A full-stack web app for **real grocery search intel**. Search a product, match it against **Open Food Facts**, surface **Open Prices** observations when they exist, classify the user’s location from **Nominatim**, and open real search results on quick-commerce platforms like Blinkit, Zepto, BigBasket Now, Flipkart Minutes, Amazon Fresh, and StarQuik. Logged-in users get searchable history they can review and delete.

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + React Router + Lucide icons.
- **Backend:** Node.js + Express + SQLite (`better-sqlite3`) + JWT auth + bcrypt + express-validator + rate limiting.
- **Maps & geocoding:** Leaflet + React Leaflet on the client, OpenStreetMap Nominatim via a backend proxy/cache.
- **External data:** Open Food Facts product catalog, Open Prices community price observations.
- **Provider layer:** A lightweight deep-link adapter list for each platform’s live search URL.

## What the app does now

SaveQart now follows a hybrid, honest-data approach:

1. **Products:** search Open Food Facts for real products, brands, images, quantities, and ingredients.
2. **Prices:** fetch recent Open Prices observations for the matched barcode when available.
3. **Location type:** reverse-geocode the saved pin with Nominatim and expose `addresstype`, `settlementType`, and `place_rank` derived classification.
4. **Platform comparison:** do not fabricate platform prices, ETAs, or availability. Each provider card is status-based:
   `matched` (real integrated first-result preview), `not_found` (integrated but no result), or `not_integrated` (no authorized API wired).

This keeps the app useful without inventing numbers the backend cannot verify.

## Features

- **Auth**: signup, login, JWT-protected routes, bcrypt-hashed passwords, rate-limited auth + search endpoints.
- **Location-first UX**: a user must set a delivery location before searching. If they try without one, the server returns `412 LOCATION_REQUIRED` and the UI re-opens the modal. Geolocation (browser GPS) supported, plus city presets and free text.
- **Real product match**: product card comes from Open Food Facts when a catalog hit is found.
- **Observed price intel**: Open Prices entries show date, currency, location label, and proof/source links when available.
- **Provider cards**: every platform card opens that provider’s live search results page; integrated providers can additionally show first-result preview + price.
- **Search history**: list, re-run, delete individual entries, or clear all.
- **Error handling**: input validation, 401/412/404/500 mapped to friendly messages, external lookup warnings, loading skeletons, rate-limit safe defaults.

## Run locally

```bash
# 1) Backend
cd backend
cp .env.example .env       # then edit JWT_SECRET
npm install
npm run dev                # http://localhost:4000

# 2) Frontend (new terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173
```

The frontend dev server proxies `/api/*` to the backend at `http://localhost:4000`.

The external services above do not need API keys. If you want to point at your own endpoints or mirrors, set:

```bash
OPEN_FOOD_FACTS_BASE=https://world.openfoodfacts.org
OPEN_PRICES_BASE=https://prices.openfoodfacts.org
NOMINATIM_BASE=https://nominatim.openstreetmap.org

```

## API quick reference

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST   | `/api/auth/signup` | — | Create account (name, email, password ≥ 6). |
| POST   | `/api/auth/login` | — | Returns `{ token, user }`. |
| GET    | `/api/auth/me` | ✓ | Current user. |
| PUT    | `/api/auth/location` | ✓ | Save delivery location `{ label, lat?, lng? }`. |
| GET    | `/api/search?q=milk` | ✓ | Returns product match, observed price intel, and provider cards with `matched`/`not_found`/`not_integrated` statuses. `412 LOCATION_REQUIRED` if no location is set. |
| GET    | `/api/history` | ✓ | Past searches. |
| DELETE | `/api/history/:id` | ✓ | Delete one entry. |
| DELETE | `/api/history` | ✓ | Clear all entries. |
| GET    | `/api/providers` | — | List of supported providers. |

## External lookup flow

- `backend/src/services/openFoodFacts.js` does the product search and maps the best match.
- `backend/src/services/openPrices.js` fetches recent community price observations for the matched product code.
- `backend/src/services/locationIntel.js` proxies and classifies Nominatim responses with caching.
- `backend/src/providers/index.js` now orchestrates provider status cards and optional first-result integrations.

If you later obtain legitimate affiliate or partner feeds, the provider layer is the right place to augment the deep-link cards with provider-specific real metadata.

## Security & hardening notes (production)

- Set a strong `JWT_SECRET` and rotate periodically.
- Put the API behind HTTPS and a reverse proxy.
- Increase rate-limits per your traffic and add per-IP+per-user keys.
- Move SQLite to Postgres for multi-instance deployments.
- Add email verification + password reset (skeleton-ready: just add two routes + a mailer).
- Log to a structured logger (pino/winston) instead of `morgan` for prod.
- Respect upstream API usage policies for Nominatim and Open Food Facts, or self-host mirrors if your traffic grows.

## Project structure

```
saveqart/
├── backend/
│   ├── src/
│   │   ├── index.js              # express bootstrap
│   │   ├── db.js                 # sqlite schema
│   │   ├── middleware/auth.js    # JWT guard
│   │   ├── providers/index.js    # provider deep links + orchestration
│   │   ├── services/             # Open Food Facts / Open Prices / Nominatim clients
│   │   └── routes/{auth,search,history}.js
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx, main.jsx, api.js, index.css
    │   ├── context/AuthContext.jsx
    │   ├── components/{Navbar,LocationModal,ProductCard}.jsx
    │   └── pages/{Login,Signup,Home,History}.jsx
    └── package.json
```

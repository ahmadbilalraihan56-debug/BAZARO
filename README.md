# BAZARO Global Marketplace — Starter v1

English-first global marketplace starter with:
- User registration and login
- Sellers submit products with image, price, currency, category, country, region/state/province, city, contact and description
- New product listings stay **pending** until an administrator approves them
- Public search shows approved listings only
- Admin dashboard to approve/reject pending products
- SQLite database for users, sessions, and listings
- Responsive layout for mobile and desktop

## Important
This is a runnable **starter project**, not yet a production-scale global service. It has not been deployed online and does not include payment processing, delivery integration, identity verification, automatic translation, country-specific legal/tax compliance, or a native Android/iPhone app. The country selector contains a practical list of common countries; users can type their region and city. Before launch, expand the country data and arrange hosting, backups, moderation, privacy/terms pages, and secure operational admin access.

## Run locally
1. Install Node.js 20 or newer.
2. Extract this ZIP and open a terminal in this folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and change `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

On first run, the admin account is created from the `.env` values. **Change the sample password before running on any public server.** The app uses SQLite; for a multi-server production deployment, use a managed database and shared session store.

## Admin
Sign in using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`, then open **Admin** in the navigation. Admin accounts are marked by email matching the configured `ADMIN_EMAIL`.

## Before public launch
- Deploy behind HTTPS on a reputable host.
- Set a long random `SESSION_SECRET` and strong admin password.
- Set `BASE_URL` to the public HTTPS URL.
- Configure persistent storage or external object storage for uploaded images.
- Add rate limiting, email verification, password reset, anti-spam, backups, privacy policy, terms, reporting and dispute procedures.
- Test currency formatting and local laws for every launch market.

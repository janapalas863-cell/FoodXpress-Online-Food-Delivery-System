# FoodXpress

A responsive food ordering app with an HTML/CSS/JavaScript frontend, an Express REST API, and a MySQL database.

## Screenshot

![FoodXpress homepage](./public/foodxpress-screenshot.png)

## Live Demo

[[▶ Play the FoodXpress demo]
(./public/%F0%9F%9A%80%20Live%20Demo%20%E2%80%94%20FoodXpress.mp4)](https://drive.google.com/file/d/1hy0IjL0Yzyr-_RYlJzdp7jgTwxWwMt2I/view?usp=drive_link)

## Features

- Browse the restaurant menu, search dishes, and filter by category.
- Add dishes to a shopping cart and adjust quantities.
- Pay for an order with Razorpay Checkout or Stripe Checkout using server-calculated totals.
- Verify successful payments with the payment provider before confirming an order.
- Record failed payments and cancel unpaid orders in MySQL.

## Requirements

- Node.js 18 or later
- MySQL 8 or later

## Run locally

1. Make sure the MySQL service is running and the database and tables have been created by running `db/schema.sql` in MySQL.
2. Copy `.env.example` to `.env` and enter your MySQL connection details.
3. Set up the payment providers you want to accept. Add Razorpay test API keys as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, and/or Stripe test keys as `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Set `APP_URL` to the public base URL of the app (use `http://localhost:3000` locally). Keep all secret keys on the server; never expose or commit them.
4. Open a terminal in this project folder and install dependencies. In Windows PowerShell, use `npm.cmd install`; in Command Prompt or macOS/Linux, use `npm install`.
5. Start the app. In Windows PowerShell, use `npm.cmd start`; in Command Prompt or macOS/Linux, use `npm start`. For Node's watch mode, use `npm.cmd run dev` in PowerShell or `npm run dev` in other terminals.
6. Open [http://localhost:3000](http://localhost:3000) in your browser. Do not open `public/index.html` directly; the frontend needs the Express server for its API requests.

For an existing database, run this once before starting the updated app:

```sql
ALTER TABLE orders
	ADD COLUMN payment_status ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
	ADD COLUMN payment_provider ENUM('razorpay', 'stripe') NOT NULL DEFAULT 'razorpay',
	ADD COLUMN razorpay_order_id VARCHAR(50) NULL,
	ADD COLUMN razorpay_payment_id VARCHAR(50) NULL,
	ADD COLUMN stripe_session_id VARCHAR(255) NULL,
	ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL,
	ADD COLUMN stripe_cancel_token_hash CHAR(64) NULL;
```

If you already applied the earlier Razorpay migration, do not add the existing payment columns a second time; run only:

```sql
ALTER TABLE orders
	ADD COLUMN payment_provider ENUM('razorpay', 'stripe') NOT NULL DEFAULT 'razorpay',
	ADD COLUMN stripe_session_id VARCHAR(255) NULL,
	ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL,
	ADD COLUMN stripe_cancel_token_hash CHAR(64) NULL;
```

If the app does not start, check the terminal output. A PowerShell error mentioning that scripts are disabled means you should use the `npm.cmd` commands above. A database connection error usually means MySQL is stopped or the credentials in `.env` do not match your MySQL account.

The menu is seeded by the schema script. The API is served from the same origin as the frontend:

- `GET /api/menu` — list menu items; optionally filter with `?category=Pizza` or `?search=pasta`.
- `GET /api/payment-methods` — reports which providers are configured without exposing credentials.
- `POST /api/orders` — create a pending MySQL order and provider checkout. Send `customerName`, `phone`, `address`, an `items` array of `{ "menuItemId": 1, "quantity": 2 }`, and optionally `paymentGateway` (`razorpay` or `stripe`; defaults to `razorpay`).
- `POST /api/payments/razorpay/verify` — verify the Checkout signature and captured payment with Razorpay, then mark the order paid and confirmed.
- `POST /api/payments/razorpay/fail` — confirm a failed Razorpay payment with the provider, then mark the order failed and cancelled.
- `GET /api/payments/stripe/sessions/:sessionId` — retrieve Stripe Checkout status and confirm the order after the customer returns.
- `POST /api/payments/stripe/cancel` — expire an unpaid Stripe Checkout session using its one-time cancellation token, then mark its order failed and cancelled.
- `POST /api/payments/stripe/webhook` — verify Stripe webhook signatures and update order state for completed, expired, or asynchronously failed Checkout sessions.
- `GET /api/orders/:id` — retrieve an order, payment state, and its items.

The browser opens Razorpay Checkout or redirects to Stripe Checkout based on the selected payment method. Razorpay success is confirmed by validating the Checkout signature and fetching the captured payment; Stripe success is confirmed by retrieving the Checkout session and by signed webhooks. Configure Stripe to send `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired` events to `/api/payments/stripe/webhook`. Configure Razorpay to automatically capture payments, since orders are confirmed only after capture. Orders are confirmed only after a successful payment; verified failed or cancelled payments set both payment and order statuses to `failed` and `cancelled`. Test both gateways in test mode before switching to live keys.

## Database configuration

The application reads `APP_URL`, provider keys, and `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` from `.env`. It does not create databases automatically; initialize the schema first. Do not commit `.env` or real credentials.

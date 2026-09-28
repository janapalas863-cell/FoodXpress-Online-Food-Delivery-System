# FoodXpress

A responsive food ordering app with an HTML/CSS/JavaScript frontend, an Express REST API, and a MySQL database.

## Screenshot

![FoodXpress homepage](./public/foodxpress-screenshot.png)

## Features

- Browse the restaurant menu, search dishes, and filter by category.
- Add dishes to a shopping cart and adjust quantities.
- Place an order with contact and delivery details.
- Store orders and order items in MySQL; the server calculates totals from trusted menu prices.

## Requirements

- Node.js 18 or later
- MySQL 8 or later

## Run locally

1. Create the database and tables by running `db/schema.sql` in MySQL.
2. Copy `.env.example` to `.env` and enter your MySQL connection details.
3. Install dependencies with `npm install`.
4. Start the app with `npm start` (or `npm run dev` for Node's watch mode).
5. Open [http://localhost:3000](http://localhost:3000).

The menu is seeded by the schema script. The API is served from the same origin as the frontend:

- `GET /api/menu` — list menu items; optionally filter with `?category=Pizza` or `?search=pasta`.
- `POST /api/orders` — create an order. Send `customerName`, `phone`, `address`, and an `items` array of `{ "menuItemId": 1, "quantity": 2 }`.
- `GET /api/orders/:id` — retrieve an order and its items.

## Database configuration

The application reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` from `.env`. It does not create databases automatically; initialize the schema first. Do not commit `.env` or real credentials.

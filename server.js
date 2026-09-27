require('dotenv').config();

const express = require('express');
const path = require('node:path');
const mysql = require('mysql2/promise');

const app = express();
const port = Number(process.env.PORT) || 3000;
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'foodxpress',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/menu', async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const filters = ['is_available = TRUE'];
    const values = [];

    if (typeof category === 'string' && category !== 'All') {
      filters.push('category = ?');
      values.push(category);
    }

    if (typeof search === 'string' && search.trim()) {
      filters.push('(name LIKE ? OR description LIKE ? OR category LIKE ?)');
      const term = `%${search.trim()}%`;
      values.push(term, term, term);
    }

    const [items] = await pool.execute(
      `SELECT id, name, description, category, price, image_url AS imageUrl, rating, prep_time AS prepTime
       FROM menu_items WHERE ${filters.join(' AND ')} ORDER BY id`,
      values
    );

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

app.post('/api/orders', async (req, res, next) => {
  const { customerName, phone, address, items } = req.body || {};
  const name = typeof customerName === 'string' ? customerName.trim() : '';
  const customerPhone = typeof phone === 'string' ? phone.trim() : '';
  const deliveryAddress = typeof address === 'string' ? address.trim() : '';

  if (name.length < 2 || name.length > 120) {
    return res.status(400).json({ error: 'Enter a name between 2 and 120 characters.' });
  }
  if (!/^[+()\d\s.-]{7,30}$/.test(customerPhone)) {
    return res.status(400).json({ error: 'Enter a valid phone number.' });
  }
  if (deliveryAddress.length < 8 || deliveryAddress.length > 500) {
    return res.status(400).json({ error: 'Enter a delivery address between 8 and 500 characters.' });
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return res.status(400).json({ error: 'Your order must contain between 1 and 50 different items.' });
  }

  const quantities = new Map();
  for (const item of items) {
    const id = Number(item && item.menuItemId);
    const quantity = Number(item && item.quantity);
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) {
      return res.status(400).json({ error: 'Each item needs a valid menu ID and a quantity between 1 and 20.' });
    }
    quantities.set(id, (quantities.get(id) || 0) + quantity);
    if (quantities.get(id) > 20) {
      return res.status(400).json({ error: 'An item quantity cannot exceed 20.' });
    }
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const ids = [...quantities.keys()];
    const [menuItems] = await connection.execute(
      `SELECT id, name, price FROM menu_items WHERE is_available = TRUE AND id IN (${ids.map(() => '?').join(', ')})`,
      ids
    );

    if (menuItems.length !== ids.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'One or more selected dishes are no longer available. Please refresh your menu.' });
    }

    const orderItems = menuItems.map((item) => ({
      menuItemId: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: quantities.get(item.id)
    }));
    const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const [orderResult] = await connection.execute(
      'INSERT INTO orders (customer_name, phone, address, total) VALUES (?, ?, ?, ?)',
      [name, customerPhone, deliveryAddress, total]
    );

    for (const item of orderItems) {
      await connection.execute(
        'INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)',
        [orderResult.insertId, item.menuItemId, item.name, item.price, item.quantity]
      );
    }

    await connection.commit();
    res.status(201).json({
      order: {
        id: orderResult.insertId,
        customerName: name,
        total,
        status: 'pending',
        items: orderItems
      }
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/orders/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Enter a valid order number.' });
  }

  try {
    const [orders] = await pool.execute(
      'SELECT id, customer_name AS customerName, total, status, created_at AS createdAt FROM orders WHERE id = ?',
      [id]
    );
    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const [items] = await pool.execute(
      'SELECT item_name AS name, unit_price AS price, quantity FROM order_items WHERE order_id = ? ORDER BY id',
      [id]
    );
    res.json({ order: { ...orders[0], items } });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error('Request failed:', error);
  res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
});

const server = app.listen(port, () => {
  console.log(`FoodXpress is running at http://localhost:${port}`);
});

async function shutDown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);

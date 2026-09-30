require('dotenv').config();

const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const Razorpay = require('razorpay');
const Stripe = require('stripe');

const app = express();
const port = Number(process.env.PORT) || 3000;
const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/+$/, '');
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
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

async function updateStripeOrder(session, outcome) {
  const [orders] = await pool.execute(
    "SELECT id, total, payment_status AS paymentStatus FROM orders WHERE stripe_session_id = ? AND payment_provider = 'stripe'",
    [session.id]
  );
  const order = orders[0];
  if (!order || session.metadata?.orderId !== String(order.id)) {
    return null;
  }

  const expectedAmount = Math.round(Number(order.total) * 100);
  if (session.mode !== 'payment' || session.currency !== 'inr' || session.amount_total !== expectedAmount) {
    throw new Error('Stripe payment details do not match the order.');
  }

  if (outcome === 'paid') {
    if (session.payment_status !== 'paid') {
      return { id: order.id, paymentStatus: order.paymentStatus };
    }
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null;
    const [result] = await pool.execute(
      "UPDATE orders SET payment_status = 'paid', stripe_payment_intent_id = ?, stripe_cancel_token_hash = NULL, status = 'confirmed' WHERE id = ? AND payment_status = 'pending'",
      [paymentIntentId, order.id]
    );
    if (result.affectedRows === 1 || order.paymentStatus === 'paid') {
      return { id: order.id, paymentStatus: 'paid' };
    }
    const [currentOrders] = await pool.execute('SELECT payment_status AS paymentStatus FROM orders WHERE id = ?', [order.id]);
    return { id: order.id, paymentStatus: currentOrders[0]?.paymentStatus || order.paymentStatus };
  }

  if (session.payment_status === 'paid') {
    return { id: order.id, paymentStatus: order.paymentStatus };
  }
  await pool.execute(
    "UPDATE orders SET payment_status = 'failed', stripe_cancel_token_hash = NULL, status = 'cancelled' WHERE id = ? AND payment_status = 'pending'",
    [order.id]
  );
  const [currentOrders] = await pool.execute('SELECT payment_status AS paymentStatus FROM orders WHERE id = ?', [order.id]);
  return { id: order.id, paymentStatus: currentOrders[0]?.paymentStatus || order.paymentStatus };
}

app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Stripe webhooks are not configured.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error.message);
    return res.status(400).json({ error: 'Stripe webhook signature could not be verified.' });
  }

  try {
    const session = event.data.object;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await updateStripeOrder(session, 'paid');
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      await updateStripeOrder(session, 'failed');
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed:', error);
    res.status(500).json({ error: 'Stripe webhook could not be processed.' });
  }
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

app.get('/api/payment-methods', (_req, res) => {
  res.json({
    razorpay: Boolean(razorpay),
    stripe: Boolean(stripe && process.env.STRIPE_WEBHOOK_SECRET)
  });
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
  const { customerName, phone, address, items, paymentGateway = 'razorpay' } = req.body || {};
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
  if (paymentGateway !== 'razorpay' && paymentGateway !== 'stripe') {
    return res.status(400).json({ error: 'Choose a supported payment method.' });
  }
  if (paymentGateway === 'razorpay' && !razorpay) {
    return res.status(503).json({ error: 'Razorpay payments are not configured yet.' });
  }
  if (paymentGateway === 'stripe' && (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(503).json({ error: 'Stripe payments and webhooks are not configured yet.' });
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
  let order;
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
    const totalPaise = orderItems.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
    const total = totalPaise / 100;

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
    order = { id: orderResult.insertId, customerName: name, total, totalPaise, items: orderItems };
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }

  try {
    let payment;
    if (paymentGateway === 'razorpay') {
      const paymentOrder = await razorpay.orders.create({
        amount: order.totalPaise,
        currency: 'INR',
        receipt: `foodxpress_${order.id}`
      });
      await pool.execute(
        "UPDATE orders SET payment_provider = 'razorpay', razorpay_order_id = ? WHERE id = ?",
        [paymentOrder.id, order.id]
      );
      payment = {
        gateway: 'razorpay',
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: paymentOrder.id,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency
      };
    } else {
      const cancelToken = crypto.randomBytes(32).toString('hex');
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: String(order.id),
        metadata: { orderId: String(order.id) },
        line_items: order.items.map((item) => ({
          price_data: {
            currency: 'inr',
            product_data: { name: item.name },
            unit_amount: Math.round(item.price * 100)
          },
          quantity: item.quantity
        })),
        success_url: `${appUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/?payment=cancelled&cancel_token=${cancelToken}`
      });
      await pool.execute(
        "UPDATE orders SET payment_provider = 'stripe', stripe_session_id = ?, stripe_cancel_token_hash = ? WHERE id = ?",
        [session.id, crypto.createHash('sha256').update(cancelToken).digest('hex'), order.id]
      );
      payment = { gateway: 'stripe', url: session.url };
    }
    res.status(201).json({
      order: {
        id: order.id,
        customerName: order.customerName,
        total: order.total,
        status: 'pending',
        paymentStatus: 'pending',
        items: order.items
      },
      payment
    });
  } catch (error) {
    await pool.execute(
      "UPDATE orders SET payment_status = 'failed', status = 'cancelled' WHERE id = ? AND payment_status = 'pending'",
      [order.id]
    );
    console.error(`${paymentGateway} checkout creation failed:`, error);
    res.status(502).json({ error: 'Secure checkout could not be started. Please try again.' });
  }
});

app.post('/api/payments/razorpay/verify', async (req, res, next) => {
  const { orderId, razorpay_order_id: gatewayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  const id = Number(orderId);
  if (!Number.isSafeInteger(id) || id < 1 || typeof gatewayOrderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Payment verification details are invalid.' });
  }
  if (!razorpay) {
    return res.status(503).json({ error: 'Online payments are not configured yet.' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${gatewayOrderId}|${paymentId}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const receivedBuffer = /^[a-f\d]{64}$/i.test(signature) ? Buffer.from(signature, 'hex') : Buffer.alloc(0);
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return res.status(400).json({ error: 'Payment signature could not be verified.' });
  }

  try {
    const [orders] = await pool.execute(
      'SELECT id, total, payment_status AS paymentStatus, razorpay_order_id AS razorpayOrderId, razorpay_payment_id AS razorpayPaymentId FROM orders WHERE id = ?',
      [id]
    );
    const order = orders[0];
    if (!order || order.razorpayOrderId !== gatewayOrderId) {
      return res.status(404).json({ error: 'The payment does not match an order.' });
    }

    const payment = await razorpay.payments.fetch(paymentId);
    const expectedAmount = Math.round(Number(order.total) * 100);
    if (payment.order_id !== gatewayOrderId || payment.amount !== expectedAmount || payment.currency !== 'INR') {
      return res.status(400).json({ error: 'Payment details do not match this order.' });
    }
    if (payment.status !== 'captured') {
      return res.status(409).json({ error: 'Payment has not been captured yet. Please try again shortly.' });
    }

    if (order.paymentStatus === 'paid') {
      if (order.razorpayPaymentId !== paymentId) {
        return res.status(409).json({ error: 'This order has already been paid with a different payment.' });
      }
      return res.json({ success: true, orderId: id, status: 'confirmed' });
    }

    const [updateResult] = await pool.execute(
      "UPDATE orders SET payment_status = 'paid', razorpay_payment_id = ?, status = 'confirmed' WHERE id = ? AND razorpay_order_id = ? AND payment_status IN ('pending', 'failed')",
      [paymentId, id, gatewayOrderId]
    );
    if (updateResult.affectedRows !== 1) {
      return res.status(409).json({ error: 'This order could not be confirmed. Please contact support.' });
    }
    res.json({ success: true, orderId: id, status: 'confirmed' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/payments/razorpay/fail', async (req, res, next) => {
  const { orderId, razorpay_payment_id: paymentId } = req.body || {};
  const id = Number(orderId);
  if (!Number.isSafeInteger(id) || id < 1 || typeof paymentId !== 'string' || !paymentId) {
    return res.status(400).json({ error: 'Payment failure details are invalid.' });
  }
  if (!razorpay) {
    return res.status(503).json({ error: 'Razorpay payments are not configured yet.' });
  }

  try {
    const [orders] = await pool.execute(
      "SELECT total, payment_status AS paymentStatus, razorpay_order_id AS razorpayOrderId FROM orders WHERE id = ? AND payment_provider = 'razorpay'",
      [id]
    );
    const order = orders[0];
    if (!order) {
      return res.status(404).json({ error: 'The payment does not match an order.' });
    }
    const payment = await razorpay.payments.fetch(paymentId);
    if (
      payment.order_id !== order.razorpayOrderId
      || payment.amount !== Math.round(Number(order.total) * 100)
      || payment.currency !== 'INR'
      || payment.status !== 'failed'
    ) {
      return res.status(400).json({ error: 'Payment failure could not be verified.' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(409).json({ error: 'This order has already been paid.' });
    }
    await pool.execute(
      "UPDATE orders SET payment_status = 'failed', status = 'cancelled' WHERE id = ? AND payment_status = 'pending'",
      [id]
    );
    res.json({ success: true, orderId: id, status: 'cancelled', paymentStatus: 'failed' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/payments/stripe/sessions/:sessionId', async (req, res, next) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe payments are not configured yet.' });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const result = await updateStripeOrder(session, session.status === 'expired' ? 'failed' : 'paid');
    if (!result) {
      return res.status(404).json({ error: 'The payment does not match an order.' });
    }
    res.json({
      success: result.paymentStatus === 'paid',
      orderId: result.id,
      status: result.paymentStatus === 'paid' ? 'confirmed' : result.paymentStatus === 'failed' ? 'cancelled' : 'pending',
      paymentStatus: result.paymentStatus
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/payments/stripe/cancel', async (req, res, next) => {
  const cancelToken = req.body?.cancelToken;
  if (typeof cancelToken !== 'string' || !/^[a-f\d]{64}$/i.test(cancelToken)) {
    return res.status(400).json({ error: 'Payment cancellation details are invalid.' });
  }
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe payments are not configured yet.' });
  }
  try {
    const [orders] = await pool.execute(
      "SELECT id, stripe_session_id AS sessionId FROM orders WHERE stripe_cancel_token_hash = ? AND payment_provider = 'stripe'",
      [crypto.createHash('sha256').update(cancelToken).digest('hex')]
    );
    if (!orders[0]?.sessionId) {
      return res.status(404).json({ error: 'The payment does not match an order.' });
    }
    let session = await stripe.checkout.sessions.retrieve(orders[0].sessionId);
    if (session.status === 'open') {
      session = await stripe.checkout.sessions.expire(session.id);
    }
    const result = await updateStripeOrder(session, session.status === 'expired' ? 'failed' : 'paid');
    if (!result) {
      return res.status(404).json({ error: 'The payment does not match an order.' });
    }
    res.json({
      orderId: result.id,
      status: result.paymentStatus === 'paid' ? 'confirmed' : result.paymentStatus === 'failed' ? 'cancelled' : 'pending',
      paymentStatus: result.paymentStatus
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/orders/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Enter a valid order number.' });
  }

  try {
    const [orders] = await pool.execute(
      'SELECT id, customer_name AS customerName, total, status, payment_status AS paymentStatus, payment_provider AS paymentProvider, created_at AS createdAt FROM orders WHERE id = ?',
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

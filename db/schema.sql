CREATE DATABASE IF NOT EXISTS foodxpress
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE foodxpress;

CREATE TABLE IF NOT EXISTS menu_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL,
  category VARCHAR(50) NOT NULL,
  price DECIMAL(10, 2) UNSIGNED NOT NULL,
  image_url VARCHAR(1000) NOT NULL,
  rating DECIMAL(2, 1) UNSIGNED NOT NULL DEFAULT 4.5,
  prep_time VARCHAR(30) NOT NULL DEFAULT '20-30 min',
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_menu_category_available (category, is_available)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address VARCHAR(500) NOT NULL,
  total DECIMAL(10, 2) UNSIGNED NOT NULL,
  status ENUM('pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')
    NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_orders_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  menu_item_id INT UNSIGNED NULL,
  item_name VARCHAR(120) NOT NULL,
  unit_price DECIMAL(10, 2) UNSIGNED NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_menu
    FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO menu_items (name, description, category, price, image_url, rating, prep_time)
SELECT seed.name, seed.description, seed.category, seed.price, seed.image_url, seed.rating, seed.prep_time
FROM (
  SELECT 'Margherita Pizza' AS name, 'Stone-baked crust, ripe tomato, creamy mozzarella and fresh basil.' AS description, 'Pizza' AS category, 349.00 AS price, 'https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=900&q=85' AS image_url, 4.8 AS rating, '20-25 min' AS prep_time
  UNION ALL SELECT 'Pepperoni Feast', 'Loaded with smoky pepperoni, mozzarella and our signature tomato sauce.', 'Pizza', 449.00, 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=900&q=85', 4.9, '25-30 min'
  UNION ALL SELECT 'Garden Veggie Pizza', 'Roasted peppers, olives, onion and mushrooms on a golden crust.', 'Pizza', 399.00, 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=900&q=85', 4.7, '20-25 min'
  UNION ALL SELECT 'Classic Smash Burger', 'Juicy double smash patty, cheddar, pickles and our house burger sauce.', 'Burgers', 289.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85', 4.9, '15-20 min'
  UNION ALL SELECT 'Crispy Chicken Burger', 'Buttermilk-crisp chicken, crunchy slaw and spicy mayo in a toasted bun.', 'Burgers', 319.00, 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=900&q=85', 4.8, '15-20 min'
  UNION ALL SELECT 'Creamy Alfredo Pasta', 'Silky parmesan cream sauce, fettuccine and a touch of cracked pepper.', 'Pasta', 329.00, 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?auto=format&fit=crop&w=900&q=85', 4.7, '20-25 min'
  UNION ALL SELECT 'Spicy Arrabbiata', 'Penne tossed in slow-cooked tomato, garlic and a lively chilli kick.', 'Pasta', 299.00, 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=85', 4.6, '20-25 min'
  UNION ALL SELECT 'Crispy Golden Fries', 'Golden-cut potatoes, crisp on the outside and fluffy in the middle.', 'Sides', 129.00, 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=85', 4.7, '10-15 min'
  UNION ALL SELECT 'Chocolate Lava Cake', 'Warm chocolate cake with a molten centre. Best enjoyed right away.', 'Desserts', 179.00, 'https://images.unsplash.com/photo-1624353365286-3f8d62a9f4e8?auto=format&fit=crop&w=900&q=85', 4.9, '15-20 min'
  UNION ALL SELECT 'Fresh Lemon Cooler', 'Freshly squeezed lemon, sparkling water and a hint of mint.', 'Drinks', 99.00, 'https://images.unsplash.com/photo-1513558161293-cdaf765edfd7?auto=format&fit=crop&w=900&q=85', 4.6, '5-10 min'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM menu_items LIMIT 1);

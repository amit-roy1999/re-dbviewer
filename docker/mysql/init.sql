-- Seed data for local MySQL testing (re-dbviewer)
USE re_dbviewer;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_users_email ON users (email);

INSERT INTO users (name, email, active) VALUES
  ('Ada Lovelace', 'ada@example.com', 1),
  ('Alan Turing', 'alan@example.com', 1),
  ('Grace Hopper', 'grace@example.com', 1),
  ('Inactive User', 'gone@example.com', 0);

INSERT INTO orders (user_id, total, status) VALUES
  (1, 19.99, 'paid'),
  (1, 5.50, 'pending'),
  (2, 100.00, 'paid'),
  (3, 42.00, 'cancelled');

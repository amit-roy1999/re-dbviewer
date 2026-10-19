-- Laravel Eloquent relationship demo schema + seed data
-- Target: local MySQL (docker compose service `mysql`)
-- Run: ./scripts/seed-eloquent-mysql.sh

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP DATABASE IF EXISTS eloquent_demo;
CREATE DATABASE eloquent_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE eloquent_demo;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Core: users, countries (country hasMany users)
-- ---------------------------------------------------------------------------
CREATE TABLE countries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code CHAR(2) NOT NULL UNIQUE,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL
);

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  country_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_users_country FOREIGN KEY (country_id) REFERENCES countries (id)
);

-- ---------------------------------------------------------------------------
-- hasOne / belongsTo  — User hasOne Phone ; Phone belongsTo User
-- ---------------------------------------------------------------------------
CREATE TABLE phones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  number VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_phones_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- hasMany / belongsTo  — User hasMany Posts ; Post belongsTo User
-- ---------------------------------------------------------------------------
CREATE TABLE posts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- belongsToMany  — User belongsToMany Roles (role_user pivot)
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL
);

CREATE TABLE role_user (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_role_user_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_user_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- hasManyThrough  — Country hasManyThrough Posts (via users)
-- ---------------------------------------------------------------------------
-- (uses countries → users → posts already defined)

-- ---------------------------------------------------------------------------
-- hasOneThrough  — Supplier hasOneThrough User (via accounts)
-- ---------------------------------------------------------------------------
CREATE TABLE suppliers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL
);

CREATE TABLE accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id BIGINT UNSIGNED NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  account_number VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_accounts_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
  CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Self / nested  — Category hasMany children ; belongsTo parent
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parent_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- hasOne ofMany / hasMany  — Order hasMany Payments ; hasOne latestPayment
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  number VARCHAR(40) NOT NULL UNIQUE,
  total DECIMAL(12, 2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  method VARCHAR(32) NOT NULL,
  paid_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- morphOne  — User/Post morphOne Image (imageable)
-- ---------------------------------------------------------------------------
CREATE TABLE images (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  url VARCHAR(255) NOT NULL,
  imageable_type VARCHAR(120) NOT NULL,
  imageable_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  INDEX idx_images_morph (imageable_type, imageable_id)
);

-- ---------------------------------------------------------------------------
-- morphMany  — Post/Video morphMany Comments (commentable)
-- ---------------------------------------------------------------------------
CREATE TABLE videos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  url VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_videos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE comments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  body TEXT NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  commentable_type VARCHAR(120) NOT NULL,
  commentable_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  INDEX idx_comments_morph (commentable_type, commentable_id),
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- morphToMany / morphedByMany  — Post/Video morphToMany Tag (taggables)
-- ---------------------------------------------------------------------------
CREATE TABLE tags (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL
);

CREATE TABLE taggables (
  tag_id BIGINT UNSIGNED NOT NULL,
  taggable_type VARCHAR(120) NOT NULL,
  taggable_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (tag_id, taggable_type, taggable_id),
  CONSTRAINT fk_taggables_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- classic belongsToMany (non-morph)  — Post belongsToMany Tag via post_tag
-- (same Tag model; Laravel often uses one or the other — both shown)
-- ---------------------------------------------------------------------------
CREATE TABLE post_tag (
  post_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  CONSTRAINT fk_post_tag_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_post_tag_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
);

-- ===========================================================================
-- SEED DATA
-- ===========================================================================

INSERT INTO countries (id, name, code, created_at, updated_at) VALUES
  (1, 'United States', 'US', NOW(), NOW()),
  (2, 'United Kingdom', 'GB', NOW(), NOW()),
  (3, 'India', 'IN', NOW(), NOW());

INSERT INTO users (id, country_id, name, email, created_at, updated_at) VALUES
  (1, 1, 'Ada Lovelace', 'ada@example.com', NOW(), NOW()),
  (2, 1, 'Alan Turing', 'alan@example.com', NOW(), NOW()),
  (3, 2, 'Grace Hopper', 'grace@example.com', NOW(), NOW()),
  (4, 3, 'Venkat Subramaniam', 'venkat@example.com', NOW(), NOW()),
  (5, 2, 'Supplier Contact', 'supplier.contact@example.com', NOW(), NOW());

-- hasOne
INSERT INTO phones (user_id, number, created_at, updated_at) VALUES
  (1, '+1-555-0101', NOW(), NOW()),
  (2, '+1-555-0102', NOW(), NOW()),
  (3, '+44-20-7946-0003', NOW(), NOW());

-- hasMany
INSERT INTO posts (id, user_id, title, body, published_at, created_at, updated_at) VALUES
  (1, 1, 'Analytical Engine notes', 'Early computing thoughts.', NOW(), NOW(), NOW()),
  (2, 1, 'On Bernoulli numbers', 'Math memoir.', NOW(), NOW(), NOW()),
  (3, 2, 'Computing machinery', 'Imitation game draft.', NOW(), NOW(), NOW()),
  (4, 3, 'COBOL in practice', 'Ship code that compiles.', NOW(), NOW(), NOW()),
  (5, 4, 'Concurrency patterns', 'Actors and messages.', NOW(), NOW(), NOW());

-- belongsToMany roles
INSERT INTO roles (id, name, created_at, updated_at) VALUES
  (1, 'admin', NOW(), NOW()),
  (2, 'editor', NOW(), NOW()),
  (3, 'viewer', NOW(), NOW());

INSERT INTO role_user (user_id, role_id, assigned_at) VALUES
  (1, 1, NOW()),
  (1, 2, NOW()),
  (2, 2, NOW()),
  (3, 1, NOW()),
  (3, 3, NOW()),
  (4, 3, NOW());

-- hasOneThrough: Supplier → Account → User
INSERT INTO suppliers (id, name, created_at, updated_at) VALUES
  (1, 'Acme Parts Co', NOW(), NOW()),
  (2, 'Binary Widgets Ltd', NOW(), NOW());

INSERT INTO accounts (supplier_id, user_id, account_number, created_at, updated_at) VALUES
  (1, 5, 'ACME-1001', NOW(), NOW()),
  (2, 2, 'BIN-2002', NOW(), NOW());

-- nested categories
INSERT INTO categories (id, parent_id, name, created_at, updated_at) VALUES
  (1, NULL, 'Programming', NOW(), NOW()),
  (2, 1, 'Databases', NOW(), NOW()),
  (3, 1, 'Languages', NOW(), NOW()),
  (4, 2, 'MySQL', NOW(), NOW()),
  (5, 2, 'PostgreSQL', NOW(), NOW()),
  (6, 3, 'PHP', NOW(), NOW()),
  (7, 3, 'Rust', NOW(), NOW());

-- orders + payments (hasMany / latestOfMany)
INSERT INTO orders (id, user_id, number, total, status, created_at, updated_at) VALUES
  (1, 1, 'ORD-1001', 120.00, 'paid', NOW(), NOW()),
  (2, 1, 'ORD-1002', 45.50, 'pending', NOW(), NOW()),
  (3, 3, 'ORD-2001', 89.00, 'paid', NOW(), NOW());

INSERT INTO payments (order_id, amount, method, paid_at, created_at, updated_at) VALUES
  (1, 50.00, 'card', DATE_SUB(NOW(), INTERVAL 3 DAY), NOW(), NOW()),
  (1, 70.00, 'card', DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), NOW()),
  (3, 89.00, 'bank', NOW(), NOW(), NOW());

-- morphOne images
INSERT INTO images (url, imageable_type, imageable_id, created_at, updated_at) VALUES
  ('https://cdn.example.com/avatars/ada.jpg', 'App\\Models\\User', 1, NOW(), NOW()),
  ('https://cdn.example.com/avatars/alan.jpg', 'App\\Models\\User', 2, NOW(), NOW()),
  ('https://cdn.example.com/posts/engine-cover.jpg', 'App\\Models\\Post', 1, NOW(), NOW()),
  ('https://cdn.example.com/posts/cobol.jpg', 'App\\Models\\Post', 4, NOW(), NOW());

-- videos + morphMany comments
INSERT INTO videos (id, user_id, title, url, created_at, updated_at) VALUES
  (1, 2, 'Turing talk', 'https://video.example.com/turing', NOW(), NOW()),
  (2, 3, 'COBOL workshop', 'https://video.example.com/cobol', NOW(), NOW());

INSERT INTO comments (body, user_id, commentable_type, commentable_id, created_at, updated_at) VALUES
  ('Great post on the Engine.', 2, 'App\\Models\\Post', 1, NOW(), NOW()),
  ('Need more Bernoulli examples.', 3, 'App\\Models\\Post', 1, NOW(), NOW()),
  ('Solid COBOL tips.', 1, 'App\\Models\\Post', 4, NOW(), NOW()),
  ('Loved this talk.', 1, 'App\\Models\\Video', 1, NOW(), NOW()),
  ('When is part 2?', 4, 'App\\Models\\Video', 1, NOW(), NOW()),
  ('Workshop was excellent.', 2, 'App\\Models\\Video', 2, NOW(), NOW());

-- tags + morphToMany (taggables) + classic post_tag
INSERT INTO tags (id, name, created_at, updated_at) VALUES
  (1, 'history', NOW(), NOW()),
  (2, 'math', NOW(), NOW()),
  (3, 'databases', NOW(), NOW()),
  (4, 'php', NOW(), NOW()),
  (5, 'video', NOW(), NOW());

INSERT INTO taggables (tag_id, taggable_type, taggable_id) VALUES
  (1, 'App\\Models\\Post', 1),
  (2, 'App\\Models\\Post', 1),
  (2, 'App\\Models\\Post', 2),
  (4, 'App\\Models\\Post', 4),
  (1, 'App\\Models\\Video', 1),
  (5, 'App\\Models\\Video', 1),
  (5, 'App\\Models\\Video', 2),
  (4, 'App\\Models\\Video', 2);

INSERT INTO post_tag (post_id, tag_id) VALUES
  (1, 1),
  (1, 2),
  (2, 2),
  (3, 1),
  (4, 4),
  (5, 3);

-- Convenience views that mirror Eloquent relation shapes (optional browse aids)
CREATE OR REPLACE VIEW v_user_phones AS
SELECT u.id AS user_id, u.name, p.number AS phone
FROM users u
LEFT JOIN phones p ON p.user_id = u.id;

CREATE OR REPLACE VIEW v_country_posts_through AS
SELECT c.name AS country, u.name AS author, p.title AS post_title
FROM countries c
JOIN users u ON u.country_id = c.id
JOIN posts p ON p.user_id = u.id;

CREATE OR REPLACE VIEW v_supplier_user_through AS
SELECT s.name AS supplier, a.account_number, u.name AS contact_user, u.email
FROM suppliers s
JOIN accounts a ON a.supplier_id = s.id
JOIN users u ON u.id = a.user_id;

CREATE OR REPLACE VIEW v_post_comments AS
SELECT p.title AS post_title, c.body AS comment, u.name AS commenter
FROM posts p
JOIN comments c ON c.commentable_type = 'App\\Models\\Post' AND c.commentable_id = p.id
JOIN users u ON u.id = c.user_id;

CREATE OR REPLACE VIEW v_video_comments AS
SELECT v.title AS video_title, c.body AS comment, u.name AS commenter
FROM videos v
JOIN comments c ON c.commentable_type = 'App\\Models\\Video' AND c.commentable_id = v.id
JOIN users u ON u.id = c.user_id;

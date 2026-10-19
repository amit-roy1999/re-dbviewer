-- Complex multi-join demo against eloquent_demo
-- Paste into a query tab, or:
--   docker exec -i re-dbviewer-mysql mysql -uroot -predev eloquent_demo < scripts/demo-complex-joins.sql
USE eloquent_demo;

CREATE OR REPLACE VIEW v_complex_activity AS
SELECT
  c.name AS country,
  c.code AS country_code,
  u.id AS user_id,
  u.name AS user_name,
  u.email,
  ph.number AS phone,
  GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS roles,
  p.id AS post_id,
  p.title AS post_title,
  GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ', ') AS post_tags_pivot,
  GROUP_CONCAT(DISTINCT mt.name ORDER BY mt.name SEPARATOR ', ') AS post_tags_morph,
  img.url AS post_image,
  cm.id AS comment_id,
  cm.body AS comment_body,
  cu.name AS commenter,
  v.id AS video_id,
  v.title AS video_title,
  GROUP_CONCAT(DISTINCT vt.name ORDER BY vt.name SEPARATOR ', ') AS video_tags,
  o.number AS order_number,
  o.total AS order_total,
  o.status AS order_status,
  pay.amount AS payment_amount,
  pay.method AS payment_method,
  s.name AS supplier,
  a.account_number
FROM countries c
JOIN users u
  ON u.country_id = c.id
LEFT JOIN phones ph
  ON ph.user_id = u.id
LEFT JOIN role_user ru
  ON ru.user_id = u.id
LEFT JOIN roles r
  ON r.id = ru.role_id
LEFT JOIN posts p
  ON p.user_id = u.id
LEFT JOIN post_tag pt
  ON pt.post_id = p.id
LEFT JOIN tags t
  ON t.id = pt.tag_id
LEFT JOIN taggables tg
  ON tg.taggable_type = 'App\\Models\\Post'
 AND tg.taggable_id = p.id
LEFT JOIN tags mt
  ON mt.id = tg.tag_id
LEFT JOIN images img
  ON img.imageable_type = 'App\\Models\\Post'
 AND img.imageable_id = p.id
LEFT JOIN comments cm
  ON cm.commentable_type = 'App\\Models\\Post'
 AND cm.commentable_id = p.id
LEFT JOIN users cu
  ON cu.id = cm.user_id
LEFT JOIN videos v
  ON v.user_id = u.id
LEFT JOIN taggables vtg
  ON vtg.taggable_type = 'App\\Models\\Video'
 AND vtg.taggable_id = v.id
LEFT JOIN tags vt
  ON vt.id = vtg.tag_id
LEFT JOIN orders o
  ON o.user_id = u.id
LEFT JOIN payments pay
  ON pay.order_id = o.id
LEFT JOIN accounts a
  ON a.user_id = u.id
LEFT JOIN suppliers s
  ON s.id = a.supplier_id
GROUP BY
  c.id, c.name, c.code,
  u.id, u.name, u.email,
  ph.number,
  p.id, p.title,
  img.url,
  cm.id, cm.body,
  cu.name,
  v.id, v.title,
  o.number, o.total, o.status,
  pay.amount, pay.method,
  s.name, a.account_number;

-- Run this in the app (or: SELECT * FROM v_complex_activity ORDER BY country, user_name, post_id;)
SELECT *
FROM v_complex_activity
ORDER BY country, user_name, post_id, comment_id, order_number, payment_amount;

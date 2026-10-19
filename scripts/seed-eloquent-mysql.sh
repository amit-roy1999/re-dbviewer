#!/usr/bin/env bash
# Seed Laravel Eloquent-style relation demo into local MySQL.
# Requires: docker compose MySQL (container re-dbviewer-mysql) running.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/scripts/seed-eloquent-mysql.sql"
CONTAINER="${MYSQL_CONTAINER:-re-dbviewer-mysql}"
ROOT_PASS="${MYSQL_ROOT_PASSWORD:-redev}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "MySQL container '$CONTAINER' is not running."
  echo "Start it with: docker compose up -d"
  exit 1
fi

docker exec -i "$CONTAINER" mysql -uroot -p"$ROOT_PASS" < "$SQL"

echo "Seeded database: eloquent_demo"
echo "Connect: mysql://root:${ROOT_PASS}@127.0.0.1:3306/eloquent_demo"
echo
echo "Relation cheat-sheet:"
echo "  hasOne / belongsTo     users ↔ phones"
echo "  hasMany / belongsTo    users → posts"
echo "  belongsToMany          users ↔ roles (role_user)"
echo "  belongsToMany          posts ↔ tags (post_tag)"
echo "  hasManyThrough         countries → users → posts"
echo "  hasOneThrough          suppliers → accounts → users"
echo "  nested                 categories.parent_id"
echo "  hasMany / ofMany       orders → payments"
echo "  morphOne               images (User|Post)"
echo "  morphMany              comments (Post|Video)"
echo "  morphToMany            taggables (Post|Video ↔ tags)"

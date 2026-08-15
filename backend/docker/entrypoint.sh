#!/bin/sh
set -e

ROLE="${1:-app}"

mkdir -p \
  storage/framework/cache/data \
  storage/framework/sessions \
  storage/framework/views \
  storage/framework/testing \
  storage/logs \
  storage/app/public \
  storage/app/private \
  bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
chmod -R ug+rwx storage bootstrap/cache

echo "==> [backend] waiting for postgres (${DB_HOST:-postgres}:${DB_PORT:-5432})"
i=0
until php -r '
$host = getenv("DB_HOST") ?: "postgres";
$port = getenv("DB_PORT") ?: "5432";
$db   = getenv("DB_DATABASE") ?: "vekta_ai";
$user = getenv("DB_USERNAME") ?: "postgres";
$pass = getenv("DB_PASSWORD") ?: "";
try {
  new PDO("pgsql:host={$host};port={$port};dbname={$db}", $user, $pass, [
    PDO::ATTR_TIMEOUT => 2,
  ]);
  exit(0);
} catch (Throwable $e) {
  exit(1);
}
'; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "==> [backend] postgres unreachable after 60s" >&2
    exit 1
  fi
  sleep 1
done

if [ "$ROLE" = "queue" ]; then
  echo "==> [backend] queue worker"
  php artisan config:cache
  exec php artisan queue:work --timeout=21600 --tries=1 --sleep=1 --max-time=3600
fi

if [ "$ROLE" = "scheduler" ]; then
  echo "==> [backend] scheduler"
  php artisan config:cache
  exec php artisan schedule:work
fi

echo "==> [backend] migrate + cache"
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache 2>/dev/null || true

echo "==> [backend] php-fpm + nginx"
php-fpm -D
exec nginx -g 'daemon off;'

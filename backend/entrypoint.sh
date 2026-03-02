#!/bin/bash
set -e

echo "Waiting for PostgreSQL..."
while ! python -c "import socket; s=socket.socket(); s.settimeout(2); s.connect(('${DB_HOST:-db}', ${DB_PORT:-5432})); s.close()" 2>/dev/null; do
    sleep 1
done
echo "PostgreSQL ready."

echo "Running migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput 2>/dev/null || true

exec "$@"

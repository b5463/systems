#!/bin/sh
set -e
echo "[startup] Running Prisma migrations..."
npx prisma migrate deploy
echo "[startup] Migrations applied. Starting API..."
exec node src/index.js

#!/bin/bash

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "==> Deploying boiteMail..."

# ── Backend ──────────────────────────────────────────────────────────────────
echo ""
echo "[1/4] Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install --omit=dev

echo "[2/4] Starting backend with PM2..."
pm2 delete emailapp-backend 2>/dev/null || true
pm2 start src/index.js \
  --name emailapp-backend \
  --cwd "$BACKEND_DIR" \
  --env production
pm2 save

# ── Frontend ─────────────────────────────────────────────────────────────────
echo ""
echo "[3/4] Installing frontend dependencies & building..."
cd "$FRONTEND_DIR"
npm install
npm run build

echo "[4/4] Serving frontend build with PM2 (via serve)..."
# Requires `serve` globally: npm install -g serve
pm2 delete emailapp-frontend 2>/dev/null || true
pm2 serve dist 4200 \
  --name emailapp-frontend \
  --spa
pm2 save

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "==> Deploy complete."
pm2 list

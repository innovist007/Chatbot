#!/bin/bash
# =============================================================
# dev.sh — Local development launcher
#   Starts backend (uvicorn) + frontend (Vite dev server)
#
# Usage:
#   ./dev.sh             # start both
#   ./dev.sh --backend   # backend only
#   ./dev.sh --frontend  # frontend only
#
# Prerequisites:
#   - pip install -r requirements.txt  (or use .venv)
#   - cd frontend && npm install
#   - Docker Redis: docker run -d -p 6379:6379 --name redis redis:alpine
# =============================================================

set -euo pipefail

RUN_BACKEND=true
RUN_FRONTEND=true

if [[ "${1:-}" == "--backend" ]];  then RUN_FRONTEND=false; fi
if [[ "${1:-}" == "--frontend" ]]; then RUN_BACKEND=false;  fi

# ── Load local env ────────────────────────────────────────────
ENV_FILE=".env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌  $ENV_FILE not found."
  echo "    Copy .env.example to .env.local and fill in your local secrets."
  exit 1
fi

set -a
[[ -f ".env" ]] && source ".env"
source "$ENV_FILE"
set +a

echo "✅  Loaded environment from $ENV_FILE (APP_ENV=local)"
export APP_ENV=local

# ── Start backend ─────────────────────────────────────────────
if [[ "$RUN_BACKEND" == "true" ]]; then
  echo "🐍  Starting backend on http://localhost:${APP_PORT:-8000}"
  uvicorn app.main:app --host "${APP_HOST:-0.0.0.0}" --port "${APP_PORT:-8000}" --reload &
  BACKEND_PID=$!
  echo "    Backend PID: $BACKEND_PID"
fi

# ── Start frontend ────────────────────────────────────────────
if [[ "$RUN_FRONTEND" == "true" ]]; then
  echo "⚛️   Starting frontend on http://localhost:5173"
  cd frontend
  npm run dev &
  FRONTEND_PID=$!
  echo "    Frontend PID: $FRONTEND_PID"
  cd ..
fi

# ── Wait / cleanup on Ctrl+C ──────────────────────────────────
trap 'echo ""; echo "Shutting down..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT TERM

echo ""
echo "🟢  Dev servers running. Press Ctrl+C to stop."
wait

#!/bin/bash
# =============================================================
# deploy.sh — Full production deployment
#   1. Builds & pushes backend Docker image
#   2. Deploys backend to Cloud Run (with production env vars)
#   3. Builds frontend (production mode)
#   4. Deploys frontend to Firebase Hosting
#
# Usage:
#   ./deploy.sh              # deploy both backend + frontend
#   ./deploy.sh --backend    # backend only
#   ./deploy.sh --frontend   # frontend only
# =============================================================

set -euo pipefail

# ── Parse flags ───────────────────────────────────────────────
DEPLOY_BACKEND=true
DEPLOY_FRONTEND=true

if [[ "${1:-}" == "--backend" ]]; then
  DEPLOY_FRONTEND=false
elif [[ "${1:-}" == "--frontend" ]]; then
  DEPLOY_BACKEND=false
fi

# ── Load production env ───────────────────────────────────────
ENV_FILE=".env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌  $ENV_FILE not found. Copy .env.example and fill in production secrets."
  exit 1
fi

# Load base .env first, then .env.production overrides
set -a
[[ -f ".env" ]] && source ".env"
source "$ENV_FILE"
set +a

echo "✅  Loaded environment from $ENV_FILE"

# ── Config ────────────────────────────────────────────────────
PROJECT_ID="dashboard-analytics-495006"
REGION="asia-south1"
IMAGE="asia-south1-docker.pkg.dev/${PROJECT_ID}/dashboard-images/dashboard-backend:latest"
SERVICE="dashboard-backend"
SERVICE_URL="https://${SERVICE}-894092456703.${REGION}.run.app"

# AI summary cron schedule — change this single line to shift the time.
# Cron is in UTC. 10:00 AM IST (UTC+5:30) = 04:30 UTC.
# Current: daily at 10:00 AM IST
SUMMARY_CRON_SCHEDULE="${SUMMARY_CRON_SCHEDULE:-30 9 * * *}"

# ── Backend ───────────────────────────────────────────────────
if [[ "$DEPLOY_BACKEND" == "true" ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🐳  Building backend Docker image"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  docker buildx build --platform linux/amd64 -t "$IMAGE" .

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  📦  Pushing image to Artifact Registry"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  docker push "$IMAGE"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🚀  Deploying backend to Cloud Run"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  gcloud run deploy "$SERVICE" \
    --image="$IMAGE" \
    --region="$REGION" \
    --platform=managed \
    --service-account=dashboard-app-sa@${PROJECT_ID}.iam.gserviceaccount.com \
    --allow-unauthenticated \
    --port=8080 \
    --memory=1Gi \
    --cpu=1 \
    --timeout=300 \
    --min-instances=0 \
    --max-instances=10 \
    --set-env-vars="\
APP_ENV=production,\
GCP_PROJECT_ID=${GCP_PROJECT_ID},\
GCP_LOCATION=${GCP_LOCATION},\
AGENT_ID=${AGENT_ID},\
BILLING_PROJECT_ID=${BILLING_PROJECT_ID},\
APP_HOST=0.0.0.0,\
APP_PORT=8080,\
LOG_LEVEL=${LOG_LEVEL},\
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},\
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET},\
JWT_SECRET_KEY=${JWT_SECRET_KEY},\
JWT_ALGORITHM=${JWT_ALGORITHM},\
JWT_EXPIRE_HOURS=${JWT_EXPIRE_HOURS},\
ALLOWED_EMAIL_DOMAIN=${ALLOWED_EMAIL_DOMAIN},\
SMTP_HOST=${SMTP_HOST},\
SMTP_PORT=${SMTP_PORT},\
SMTP_USER=${SMTP_USER},\
SMTP_PASSWORD=${SMTP_PASSWORD},\
SMTP_FROM_NAME=${SMTP_FROM_NAME},\
OTP_LENGTH=${OTP_LENGTH},\
OTP_EXPIRE_MINUTES=${OTP_EXPIRE_MINUTES},\
OTP_MAX_ATTEMPTS=${OTP_MAX_ATTEMPTS},\
REDIS_HOST=${REDIS_HOST},\
REDIS_PORT=${REDIS_PORT},\
REDIS_DB=${REDIS_DB},\
REDIS_PASSWORD=${REDIS_PASSWORD},\
CACHE_VERSION=${CACHE_VERSION:-v5},\
CRON_SECRET_KEY=${CRON_SECRET_KEY}"

  echo "✅  Backend deployed: https://${SERVICE}-894092456703.${REGION}.run.app"

  # ── Redis eviction policy ─────────────────────────────────────
  # allkeys-lru: when memory is full, evict the least-recently-used
  # keys across ALL keys. Analytics cache keys all have a 24h TTL so
  # they'll naturally age out, but LRU ensures hot date-ranges stay
  # warm and cold ones are dropped first under memory pressure.
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🔴  Configuring Redis eviction policy"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  gcloud redis instances update dashboard-cache \
    --region="${REGION}" \
    --update-redis-config maxmemory-policy=allkeys-lru \
    --project="${PROJECT_ID}" || echo "⚠️  Redis update skipped (instance may not exist yet)"
  echo "✅  Redis eviction policy: allkeys-lru"

  # ── Cloud Scheduler — AI summary pre-generation ──────────────
  # Runs at SUMMARY_CRON_SCHEDULE (default: 10:00 AM IST = 04:30 UTC)
  # To change time: set SUMMARY_CRON_SCHEDULE before running deploy.sh
  # e.g.  SUMMARY_CRON_SCHEDULE="0 3 * * *" ./deploy.sh
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🕙  Configuring AI summary cron"
  echo "      Schedule: ${SUMMARY_CRON_SCHEDULE} UTC"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  _CRON_ARGS=(
    --schedule="${SUMMARY_CRON_SCHEDULE}"
    --uri="${SERVICE_URL}/internal/warm-summaries"
    --http-method=GET
    --headers="X-Cron-Key=${CRON_SECRET_KEY}"
    --time-zone="Asia/Kolkata"
    --location="${REGION}"
    --project="${PROJECT_ID}"
  )
  if gcloud scheduler jobs describe warm-ai-summaries \
       --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
    gcloud scheduler jobs update http warm-ai-summaries "${_CRON_ARGS[@]}"
  else
    gcloud scheduler jobs create http warm-ai-summaries "${_CRON_ARGS[@]}"
  fi
  echo "✅  AI summary cron: ${SUMMARY_CRON_SCHEDULE} (Asia/Kolkata)"
fi

# ── Frontend ──────────────────────────────────────────────────
if [[ "$DEPLOY_FRONTEND" == "true" ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ⚛️   Building frontend (production)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cd frontend
  npm run build          # Vite auto-loads .env + .env.production
  cd ..

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🔥  Deploying frontend to Firebase"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  firebase deploy --only hosting

  echo "✅  Frontend deployed to Firebase Hosting"
fi

echo ""
echo "🎉  Deployment complete!"

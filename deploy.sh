#!/bin/bash
# Load env variables from .env
set -a
source .env
set +a

# Deploy to Cloud Run
gcloud run deploy dashboard-backend \
  --image=asia-south1-docker.pkg.dev/dashboard-analytics-495006/dashboard-images/dashboard-backend:latest \
  --region=asia-south1 \
  --platform=managed \
  --service-account=dashboard-app-sa@dashboard-analytics-495006.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300 \
  --min-instances=0 \
  --max-instances=10 \
  --set-env-vars="GCP_PROJECT_ID=$GCP_PROJECT_ID,GCP_LOCATION=$GCP_LOCATION,AGENT_ID=$AGENT_ID,BILLING_PROJECT_ID=$BILLING_PROJECT_ID,APP_HOST=0.0.0.0,APP_PORT=8080,LOG_LEVEL=info,JWT_ALGORITHM=$JWT_ALGORITHM,JWT_EXPIRE_HOURS=$JWT_EXPIRE_HOURS,ALLOWED_EMAIL_DOMAIN=$ALLOWED_EMAIL_DOMAIN,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,JWT_SECRET_KEY=$JWT_SECRET_KEY"

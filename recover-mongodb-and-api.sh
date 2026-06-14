#!/bin/bash
set -e

echo "=============================================="
echo "Millo MongoDB Recovery"
echo "=============================================="

# Create infra namespace if missing
kubectl get ns infra >/dev/null 2>&1 || kubectl create ns infra

# Deploy MongoDB
cat <<MONGO | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongodb
  namespace: infra
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mongodb
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
      - name: mongodb
        image: mongo:7
        ports:
        - containerPort: 27017
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb
  namespace: infra
spec:
  selector:
    app: mongodb
  ports:
  - port: 27017
    targetPort: 27017
MONGO

echo
echo "Waiting for MongoDB..."
kubectl rollout status deployment/mongodb -n infra --timeout=300s

echo
echo "Updating Millo secret..."

JWT_SECRET=$(kubectl get secret millo-secrets -n millo -o jsonpath='{.data.JWT_SECRET}' | base64 -d 2>/dev/null || true)
SESSION_SECRET=$(kubectl get secret millo-secrets -n millo -o jsonpath='{.data.SESSION_SECRET}' | base64 -d 2>/dev/null || true)
API_KEY=$(kubectl get secret millo-secrets -n millo -o jsonpath='{.data.API_KEY}' | base64 -d 2>/dev/null || true)
INGEST=$(kubectl get secret millo-secrets -n millo -o jsonpath='{.data.INGEST_WEBHOOK_SECRET}' | base64 -d 2>/dev/null || true)
REDIS=$(kubectl get secret millo-secrets -n millo -o jsonpath='{.data.REDIS_URL}' | base64 -d 2>/dev/null || true)
STRIPE=$(kubectl get secret millo-secrets -n millo -o jsonpath='{.data.STRIPE_SECRET_KEY}' | base64 -d 2>/dev/null || true)
STRIPEPUB=$(kubectl get secret millo-secrets -n millo -o jsonpath='{.data.STRIPE_PUBLISHABLE_KEY}' | base64 -d 2>/dev/null || true)
STRIPEWH=$(kubectl get secret millo-secrets -n millo -o jsonpath='{.data.STRIPE_WEBHOOK_SECRET}' | base64 -d 2>/dev/null || true)

kubectl create secret generic millo-secrets \
-n millo \
--dry-run=client -o yaml \
--from-literal=JWT_SECRET="$JWT_SECRET" \
--from-literal=SESSION_SECRET="$SESSION_SECRET" \
--from-literal=API_KEY="$API_KEY" \
--from-literal=INGEST_WEBHOOK_SECRET="$INGEST" \
--from-literal=MONGODB_URI='mongodb://mongodb.infra.svc.cluster.local:27017/millo' \
--from-literal=REDIS_URL="$REDIS" \
--from-literal=STRIPE_SECRET_KEY="$STRIPE" \
--from-literal=STRIPE_PUBLISHABLE_KEY="$STRIPEPUB" \
--from-literal=STRIPE_WEBHOOK_SECRET="$STRIPEWH" \
| kubectl apply -f -

echo
echo "Restarting API..."
kubectl rollout restart deployment/millo-api -n millo

echo
echo "Waiting for API..."
sleep 30

kubectl get pods -n millo -l app=millo-api -o wide

echo
echo "Newest pod logs:"
NEWEST=$(kubectl get pods -n millo -l app=millo-api \
--sort-by=.metadata.creationTimestamp \
-o jsonpath='{.items[-1].metadata.name}')

kubectl logs -n millo "$NEWEST" --tail=200

echo
echo "MongoDB service:"
kubectl get svc -n infra mongodb

echo
echo "MongoDB pod:"
kubectl get pods -n infra

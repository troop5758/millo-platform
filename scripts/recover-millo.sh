#!/bin/bash
set -e

echo "===================================="
echo "Millo Production Recovery"
echo "===================================="

cd /opt/millo

echo "[1/12] Ensuring namespace exists..."
kubectl create namespace millo \
  --dry-run=client -o yaml | kubectl apply -f -

echo "[2/12] Patching image names..."

sed -i \
's|millo/web:latest|docker.io/library/millo-frontend-production:latest|g' \
infra/k8s/web.yaml || true

sed -i \
's|millo/api:latest|docker.io/library/millo-api-gateway:latest|g' \
infra/k8s/api.yaml || true

sed -i \
's|millo/janus:latest|docker.io/library/millo-janus:latest|g' \
infra/k8s/deployment-janus.yaml || true

echo "[3/12] Remove duplicate API resources..."
kubectl delete deployment millo-api -n millo --ignore-not-found
kubectl delete service millo-api -n millo --ignore-not-found
kubectl delete hpa millo-api-hpa -n millo --ignore-not-found

echo "[4/12] Deploy Redis..."
kubectl apply -f infra/k8s/service-redis.yaml
kubectl apply -f infra/k8s/redis-statefulset.yaml

echo "[5/12] Deploy API..."
kubectl apply -f infra/k8s/api.yaml

echo "[6/12] Deploy Frontend..."
kubectl apply -f infra/k8s/web.yaml

echo "[7/12] Deploy Janus..."
kubectl apply -f infra/k8s/deployment-janus.yaml

echo "[8/12] Deploy Streaming..."
kubectl apply -f infra/k8s/deployment-streaming.yaml

echo "[9/12] Deploy Workers..."
kubectl apply -f infra/k8s/deployment-workers.yaml || true

echo "[10/12] Deploy Ingress..."
kubectl apply -f infra/k8s/ingress.yaml

echo "[11/12] Waiting for rollouts..."

kubectl rollout status deployment/millo-api -n millo --timeout=300s || true
kubectl rollout status deployment/millo-web -n millo --timeout=300s || true
kubectl rollout status deployment/janus -n millo --timeout=300s || true

echo "[12/12] Cluster Status"

kubectl get deploy -n millo
echo
kubectl get pods -n millo -o wide
echo
kubectl get svc -n millo
echo
kubectl get ingress -n millo

echo
echo "Recovery Complete"

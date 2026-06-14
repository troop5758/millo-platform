#!/bin/bash

set +e

NS=millo
OUT=/opt/millo/diagnostics/$(date +%Y%m%d-%H%M%S)

mkdir -p "$OUT"

echo "==================================="
echo "Millo Auto Recovery + Diagnostics"
echo "==================================="

echo "[1] Force local image usage..."

kubectl patch deployment millo-api -n $NS --type merge \
-p '{"spec":{"template":{"spec":{"containers":[{"name":"api","imagePullPolicy":"IfNotPresent"}]}}}}'

kubectl patch deployment millo-workers -n $NS --type merge \
-p '{"spec":{"template":{"spec":{"containers":[{"name":"workers","imagePullPolicy":"IfNotPresent"}]}}}}'

kubectl patch deployment janus -n $NS --type merge \
-p '{"spec":{"template":{"spec":{"containers":[{"name":"janus","imagePullPolicy":"IfNotPresent"}]}}}}'

echo "[2] Remove Janus bad args..."

kubectl get deployment janus -n $NS -o json \
| jq 'del(.spec.template.spec.containers[0].args)' \
| kubectl replace -f -

echo "[3] Restart workloads..."

kubectl rollout restart deployment/millo-api -n $NS
kubectl rollout restart deployment/millo-workers -n $NS
kubectl rollout restart deployment/janus -n $NS
kubectl rollout restart deployment/millo-nginx-rtmp -n $NS

sleep 20

echo "[4] Inventory..."

kubectl get deploy -n $NS -o wide \
> "$OUT/deployments.txt"

kubectl get pods -n $NS -o wide \
> "$OUT/pods.txt"

kubectl get svc -n $NS \
> "$OUT/services.txt"

kubectl get ingress -n $NS \
> "$OUT/ingress.txt"

echo "[5] Events..."

kubectl get events -n $NS \
--sort-by=.lastTimestamp \
> "$OUT/events.txt"

echo "[6] API logs..."

kubectl logs deployment/millo-api \
-n $NS \
--tail=300 \
> "$OUT/api.log" 2>&1

echo "[7] Worker logs..."

kubectl logs deployment/millo-workers \
-n $NS \
--tail=300 \
> "$OUT/workers.log" 2>&1

echo "[8] Janus logs..."

kubectl logs deployment/janus \
-n $NS \
--tail=300 \
> "$OUT/janus.log" 2>&1

echo "[9] Streaming logs..."

kubectl logs deployment/millo-nginx-rtmp \
-n $NS \
--tail=300 \
> "$OUT/streaming.log" 2>&1

echo "[10] Inspect rebuilt API image..."

docker run --rm \
docker.io/library/millo-api-gateway:latest \
sh -c '
echo "===== API IMAGE ====="
find /app -maxdepth 3 -type d | sort | head -100
echo
echo "===== PACKAGE ====="
cat /app/package.json 2>/dev/null || true
echo
echo "===== API ENTRY ====="
find /app -name index.js | grep packages/api
' > "$OUT/api-image.txt" 2>&1

echo "[11] Inspect rebuilt Worker image..."

docker run --rm \
docker.io/millo/workers:latest \
sh -c '
echo "===== WORKER ENTRY ====="
find /app -name index.js | grep workers
echo
echo "===== SHARED ====="
find /app -path "*shared*" | head -50
' > "$OUT/worker-image.txt" 2>&1

echo
echo "==================================="
echo "Diagnostics saved:"
echo "$OUT"
echo "==================================="

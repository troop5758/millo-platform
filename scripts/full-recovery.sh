#!/bin/bash
set -e

NS=millo

echo "===================================="
echo "Millo Automated Recovery"
echo "===================================="

cd /opt/millo

echo "[1] Create ConfigMap"
kubectl create configmap millo-config \
-n $NS \
--from-literal=NODE_ENV=production \
--dry-run=client -o yaml | kubectl apply -f -

echo "[2] Create Secret"
kubectl create secret generic millo-secrets \
-n $NS \
--from-literal=JWT_SECRET=recovery-secret \
--from-literal=SESSION_SECRET=recovery-secret \
--from-literal=API_KEY=recovery-key \
--from-literal=INGEST_WEBHOOK_SECRET=recovery-secret \
--dry-run=client -o yaml | kubectl apply -f -

echo "[3] Fix Janus Paths"

sed -i 's|/usr/lib/janus/plugins|/usr/lib/x86_64-linux-gnu/janus/plugins|g' infra/janus/janus.jcfg || true
sed -i 's|/usr/lib/janus/transports|/usr/lib/x86_64-linux-gnu/janus/transports|g' infra/janus/janus.jcfg || true
sed -i 's|/usr/lib/janus/events|/usr/lib/x86_64-linux-gnu/janus/events|g' infra/janus/janus.jcfg || true

echo "[4] Rebuild Janus"

docker build \
-t docker.io/library/millo-janus:latest \
infra/janus

echo "[5] Disable Lua Blocks"

cp infra/streaming/nginx.conf \
infra/streaming/nginx.conf.bak.$(date +%s)

sed -i '/content_by_lua_block/,/}/d' \
infra/streaming/nginx.conf || true

echo "[6] Rebuild Streaming"

docker build \
-f infra/streaming/Dockerfile.nginx-rtmp \
-t millo/nginx-rtmp:latest \
infra/streaming

echo "[7] Force Local Images"

kubectl set image deployment/janus \
janus=docker.io/library/millo-janus:latest \
-n $NS || true

kubectl set image deployment/millo-nginx-rtmp \
nginx-rtmp=millo/nginx-rtmp:latest \
-n $NS || true

kubectl patch deployment janus \
-n $NS \
-p '{"spec":{"template":{"spec":{"containers":[{"name":"janus","imagePullPolicy":"IfNotPresent"}]}}}}' || true

kubectl patch deployment millo-nginx-rtmp \
-n $NS \
-p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx-rtmp","imagePullPolicy":"IfNotPresent"}]}}}}' || true

echo "[8] Scale Down To Safe Recovery Size"

kubectl scale deployment janus --replicas=1 -n $NS || true
kubectl scale deployment millo-nginx-rtmp --replicas=1 -n $NS || true
kubectl scale deployment millo-api --replicas=1 -n $NS || true
kubectl scale deployment millo-workers --replicas=1 -n $NS || true
kubectl scale deployment millo-web --replicas=1 -n $NS || true

echo "[9] Restart"

kubectl rollout restart deployment/janus -n $NS || true
kubectl rollout restart deployment/millo-nginx-rtmp -n $NS || true
kubectl rollout restart deployment/millo-api -n $NS || true
kubectl rollout restart deployment/millo-workers -n $NS || true
kubectl rollout restart deployment/millo-web -n $NS || true

sleep 20

echo "[10] Status"

kubectl get pods -n $NS -o wide
echo
kubectl get deploy -n $NS
echo
kubectl get svc -n $NS

echo
echo "===================================="
echo "IMPORTANT"
echo "===================================="
echo "Janus should now start."
echo "Streaming should now start."
echo
echo "API and Workers are still expected to fail."
echo "Their Dockerfiles are empty and must be rebuilt."
echo "===================================="


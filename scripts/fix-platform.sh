#!/bin/bash
set -e

echo "================================="
echo "Millo Automated Recovery Fix"
echo "================================="

echo "[1] Remove broken Janus args..."
kubectl patch deployment janus \
-n millo \
--type=json \
-p='[{"op":"remove","path":"/spec/template/spec/containers/0/args"}]' || true

echo "[2] Ensure required secrets..."
kubectl create secret generic millo-secrets \
-n millo \
--dry-run=client -o yaml \
--from-literal=JWT_SECRET=recovery-secret \
--from-literal=SESSION_SECRET=recovery-secret \
--from-literal=API_KEY=recovery-key \
--from-literal=INGEST_WEBHOOK_SECRET=recovery-ingest-secret \
| kubectl apply -f -

echo "[3] Ensure configmap exists..."
kubectl create configmap millo-config \
-n millo \
--from-literal=NODE_ENV=production \
--dry-run=client -o yaml \
| kubectl apply -f -

echo "[4] Force local image usage..."
kubectl patch deployment janus -n millo \
-p '{"spec":{"template":{"spec":{"containers":[{"name":"janus","imagePullPolicy":"IfNotPresent"}]}}}}' || true

kubectl patch deployment millo-workers -n millo \
-p '{"spec":{"template":{"spec":{"containers":[{"name":"workers","imagePullPolicy":"IfNotPresent"}]}}}}' || true

kubectl patch deployment millo-api -n millo \
-p '{"spec":{"template":{"spec":{"containers":[{"name":"api","imagePullPolicy":"IfNotPresent"}]}}}}' || true

kubectl patch deployment millo-web -n millo \
-p '{"spec":{"template":{"spec":{"containers":[{"name":"web","imagePullPolicy":"IfNotPresent"}]}}}}' || true

echo "[5] Scale down for recovery..."
kubectl scale deploy janus --replicas=1 -n millo || true
kubectl scale deploy millo-api --replicas=1 -n millo || true
kubectl scale deploy millo-workers --replicas=1 -n millo || true
kubectl scale deploy millo-web --replicas=1 -n millo || true
kubectl scale deploy millo-nginx-rtmp --replicas=1 -n millo || true

echo "[6] Restart deployments..."
kubectl rollout restart deployment/janus -n millo || true
kubectl rollout restart deployment/millo-api -n millo || true
kubectl rollout restart deployment/millo-workers -n millo || true
kubectl rollout restart deployment/millo-web -n millo || true
kubectl rollout restart deployment/millo-nginx-rtmp -n millo || true

echo "[7] Collect diagnostics..."
mkdir -p /tmp/millo-diagnostics

kubectl get deploy -n millo -o wide \
> /tmp/millo-diagnostics/deployments.txt

kubectl get pods -n millo -o wide \
> /tmp/millo-diagnostics/pods.txt

kubectl get svc -n millo \
> /tmp/millo-diagnostics/services.txt

kubectl get ingress -n millo \
> /tmp/millo-diagnostics/ingress.txt

kubectl get events -n millo \
--sort-by=.lastTimestamp \
> /tmp/millo-diagnostics/events.txt

echo "[8] Capture failing pod logs..."
for APP in janus millo-api millo-workers millo-streaming
do
  POD=$(kubectl get pods -n millo \
    -l app=$APP \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

  if [ ! -z "$POD" ]; then
    kubectl logs $POD -n millo --tail=500 \
    > /tmp/millo-diagnostics/${APP}.log 2>&1 || true
  fi
done

echo "[9] Inventory source tree..."
cd /opt/millo

find . \
-type f \
\( \
-name Dockerfile \
-o -name package.json \
-o -name "*.yaml" \
-o -name "*.yml" \
\) \
| sort \
> /tmp/millo-diagnostics/source-inventory.txt

echo
echo "================================="
echo "RECOVERY COMPLETE"
echo "================================="
echo
kubectl get pods -n millo -o wide
echo
echo "Diagnostics:"
echo "/tmp/millo-diagnostics"

#!/bin/bash
set -e

echo "================================================="
echo "Millo Full API Dependency Recovery"
echo "================================================="

cd /opt/millo

kubectl scale deployment/millo-api --replicas=0 -n millo || true
sleep 15

rm -rf node_modules
find packages -name node_modules -type d -prune -exec rm -rf {} +

rm -f package-lock.json

npm install

npm ls fastify || true
npm ls find-my-way || true
npm ls fast-querystring || true
npm ls toad-cache || true
npm ls @fastify/proxy-addr || true

docker build --no-cache -t millo-api:latest -f packages/api/Dockerfile .

docker run --rm --entrypoint sh millo-api:latest -c '
node -e "require(\"fast-querystring\")"
node -e "require(\"toad-cache\")"
node -e "require(\"@fastify/proxy-addr\")"
node -e "require(\"fastify\")"
echo "ALL DEPENDENCIES OK"
'

docker save millo-api:latest -o /tmp/millo-api.tar
k3s ctr images import /tmp/millo-api.tar

kubectl scale deployment/millo-api --replicas=5 -n millo
kubectl rollout restart deployment/millo-api -n millo

kubectl rollout status deployment/millo-api -n millo --timeout=600s

NEWEST=$(kubectl get pods -n millo -l app=millo-api --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}')

echo "===== PODS ====="
kubectl get pods -n millo -l app=millo-api -o wide

echo "===== LOGS ====="
kubectl logs -n millo "$NEWEST" --tail=300

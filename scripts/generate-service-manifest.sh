#!/bin/bash

SERVICE=$1
IMAGE=$2
PORT=$3

cat <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE}
  namespace: millo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${SERVICE}
  template:
    metadata:
      labels:
        app: ${SERVICE}
    spec:
      containers:
      - name: ${SERVICE}
        image: ${IMAGE}
        imagePullPolicy: Never
        ports:
        - containerPort: ${PORT}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE}
  namespace: millo
spec:
  selector:
    app: ${SERVICE}
  ports:
  - port: ${PORT}
    targetPort: ${PORT}
EOF

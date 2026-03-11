#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

info "=== KEDA Demo Teardown ==="

info "Removing KEDA ScaledObjects..."
oc delete scaledobject --all -n keda-demo 2>/dev/null || true

info "Removing demo applications..."
oc delete -f demo-1-kafka/producer/deployment.yaml 2>/dev/null || true
oc delete -f demo-1-kafka/consumer/deployment.yaml 2>/dev/null || true
oc delete -f demo-2-postgresql/web-api/deployment.yaml 2>/dev/null || true
oc delete -f demo-2-postgresql/worker/deployment.yaml 2>/dev/null || true

info "Removing Kafka Console..."
oc delete console kafka-console -n keda-demo 2>/dev/null || true

info "Removing Kafka cluster..."
oc delete kafka my-cluster -n keda-demo 2>/dev/null || true
oc delete kafkatopic orders -n keda-demo 2>/dev/null || true

info "Removing PostgreSQL..."
oc delete -f infrastructure/postgresql/deployment.yaml 2>/dev/null || true

info "Removing KEDA controller..."
oc delete -f infrastructure/keda/keda-controller.yaml 2>/dev/null || true

info "Removing build configs..."
oc delete bc kafka-producer kafka-consumer job-api job-worker -n keda-demo 2>/dev/null || true

info "Removing namespace..."
oc delete namespace keda-demo 2>/dev/null || true

warn "Note: Operators (Streams for Apache Kafka, Kafka Console, Custom Metrics Autoscaler) are NOT removed."
warn "Remove them manually from OperatorHub if needed."

info "=== Teardown Complete ==="

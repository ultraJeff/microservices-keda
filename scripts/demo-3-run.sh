#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

NAMESPACE="keda-demo"

info() { echo -e "${GREEN}[DEMO]${NC} $1"; }
step() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"; }
pause() { echo -e "${YELLOW}Press Enter to continue...${NC}"; read -r; }

BFF_URL=$(oc get route notification-bff -n $NAMESPACE -o jsonpath='{.spec.host}')
MFE_URL=$(oc get route notification-frontend -n $NAMESPACE -o jsonpath='{.spec.host}')
RABBITMQ_URL=$(oc get route rabbitmq-management -n $NAMESPACE -o jsonpath='{.spec.host}')

step "Demo 3: RabbitMQ Notification Service — Micro-Frontend + BFF + KEDA"

info "Architecture: Notification MFE → BFF → RabbitMQ → Worker"
info "  MFE (micro-frontend):  https://$MFE_URL"
info "  BFF (backend-for-frontend): https://$BFF_URL"
info "  RabbitMQ Management:   https://$RABBITMQ_URL"
echo ""
pause

step "Step 1: Show current state — 0 worker pods"
oc get pods -n $NAMESPACE -l app=notification-worker
echo ""
oc get scaledobject notification-worker-scaler -n $NAMESPACE
pause

step "Step 2: Show the KEDA ScaledObject for RabbitMQ"
oc get scaledobject notification-worker-scaler -n $NAMESPACE -o yaml | grep -A 15 'triggers:'
pause

step "Step 3: Show the micro-frontend is a separate deployment"
info "The notification UI is deployed independently from the dashboard:"
echo ""
oc get deployment notification-frontend -n $NAMESPACE
oc get route notification-frontend -n $NAMESPACE
echo ""
info "The dashboard loads this micro-frontend via an iframe — separate deploy, separate route"
pause

step "Step 4: Send 30 notifications via the BFF"
info "Sending POST to https://$BFF_URL/api/notify"
curl -sk -X POST "https://$BFF_URL/api/notify" -H 'Content-Type: application/json' -d '{"count": 30, "type": "email"}' | python3 -m json.tool
pause

step "Step 5: Watch worker pods scaling up"
info "Watching pods (Ctrl+C to stop watching, then press Enter)..."
timeout 120 oc get pods -n $NAMESPACE -l app=notification-worker -w || true
pause

step "Step 6: Check RabbitMQ queue stats via the BFF"
curl -sk "https://$BFF_URL/api/queue-stats" | python3 -m json.tool
pause

step "Step 7: Watch workers scale back to zero"
info "Waiting for queue to drain and cooldown..."
info "Watching pods (Ctrl+C to stop watching)..."
timeout 300 oc get pods -n $NAMESPACE -l app=notification-worker -w || true

step "Demo 3 Complete!"
info "Workers scaled from 0 → N → 0 based on RabbitMQ queue depth"
info ""
info "Key architectural patterns demonstrated:"
info "  1. Micro-Frontend: Notification UI is a separate deployment with its own route"
info "  2. Backend-for-Frontend (BFF): Notification BFF aggregates queue + notification data"
info "  3. KEDA RabbitMQ Scaler: Third scaler type (after Kafka and PostgreSQL)"

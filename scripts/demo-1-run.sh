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

PRODUCER_URL=$(oc get route kafka-producer -n $NAMESPACE -o jsonpath='{.spec.host}')

step "Demo 1: Kafka Consumer Autoscaling with KEDA"

step "Step 1: Show current state — 0 consumer pods"
oc get pods -n $NAMESPACE -l app=kafka-consumer
echo ""
oc get scaledobject kafka-consumer-scaler -n $NAMESPACE
pause

step "Step 2: Show the KEDA ScaledObject configuration"
oc get scaledobject kafka-consumer-scaler -n $NAMESPACE -o yaml | grep -A 20 'triggers:'
pause

step "Step 3: Produce 500 messages to Kafka"
info "Sending burst to http://$PRODUCER_URL/burst/500"
curl -s "http://$PRODUCER_URL/burst/500" | python3 -m json.tool
pause

step "Step 4: Watch consumer pods scaling up"
info "Watching pods (Ctrl+C to stop watching, then press Enter)..."
timeout 120 oc get pods -n $NAMESPACE -l app=kafka-consumer -w || true
pause

step "Step 5: Check the HPA created by KEDA"
oc get hpa -n $NAMESPACE
pause

step "Step 6: Watch pods scale back to zero"
info "Waiting for messages to drain and cooldown..."
info "Watching pods (Ctrl+C to stop watching)..."
timeout 180 oc get pods -n $NAMESPACE -l app=kafka-consumer -w || true

step "Demo 1 Complete!"
info "Consumer scaled from 0 → N → 0 based on Kafka consumer group lag"

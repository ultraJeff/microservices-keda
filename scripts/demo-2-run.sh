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

API_URL=$(oc get route job-api -n $NAMESPACE -o jsonpath='{.spec.host}')

step "Demo 2: PostgreSQL Job Queue Autoscaling with KEDA"

step "Step 1: Show current state — 0 worker pods"
oc get pods -n $NAMESPACE -l app=job-worker
echo ""
oc get scaledobject job-worker-scaler -n $NAMESPACE
pause

step "Step 2: Show the KEDA ScaledObject configuration"
oc get scaledobject job-worker-scaler -n $NAMESPACE -o yaml | grep -A 20 'triggers:'
pause

step "Step 3: Insert 50 pending jobs"
info "Sending POST to http://$API_URL/jobs"
curl -s -X POST "http://$API_URL/jobs" -H 'Content-Type: application/json' -d '{"count": 50}' | python3 -m json.tool
pause

step "Step 4: Watch worker pods scaling up"
info "Watching pods (Ctrl+C to stop watching, then press Enter)..."
timeout 120 oc get pods -n $NAMESPACE -l app=job-worker -w || true
pause

step "Step 5: Check job status"
curl -s "http://$API_URL/jobs/status" | python3 -m json.tool
pause

step "Step 6: Watch workers scale back to zero"
info "Waiting for jobs to complete and cooldown..."
info "Watching pods (Ctrl+C to stop watching)..."
timeout 300 oc get pods -n $NAMESPACE -l app=job-worker -w || true

step "Demo 2 Complete!"
info "Workers scaled from 0 → N → 0 based on pending job count in PostgreSQL"

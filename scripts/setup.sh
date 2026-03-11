#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

NAMESPACE="keda-demo"

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

wait_for_operator() {
  local name=$1
  local namespace=$2
  info "Waiting for operator $name to be ready..."
  local retries=60
  while [ $retries -gt 0 ]; do
    if oc get csv -n "$namespace" 2>/dev/null | grep -q "$name.*Succeeded"; then
      info "Operator $name is ready"
      return 0
    fi
    retries=$((retries - 1))
    sleep 5
  done
  error "Timed out waiting for operator $name"
}

wait_for_pod() {
  local label=$1
  local namespace=$2
  info "Waiting for pods with label $label..."
  oc wait --for=condition=Ready pod -l "$label" -n "$namespace" --timeout=300s
}

wait_for_kafka() {
  info "Waiting for Kafka cluster to be ready..."
  local retries=60
  while [ $retries -gt 0 ]; do
    if oc get kafka my-cluster -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null | grep -q "True"; then
      info "Kafka cluster is ready"
      return 0
    fi
    retries=$((retries - 1))
    sleep 10
  done
  error "Timed out waiting for Kafka cluster"
}

info "=== KEDA Demo Setup ==="

# Step 1: Create namespace
info "Step 1: Creating namespace $NAMESPACE"
oc apply -f infrastructure/namespace.yaml

# Step 2: Install operators
info "Step 2: Installing operators"
oc apply -f infrastructure/kafka/subscription.yaml
oc apply -f infrastructure/kafka/console-subscription.yaml
oc apply -f infrastructure/keda/subscription.yaml

# Step 3: Wait for operators
info "Step 3: Waiting for operators to install..."
wait_for_operator "amqstreams" "openshift-operators"
wait_for_operator "amq-streams-console" "openshift-operators"
wait_for_operator "custom-metrics-autoscaler" "openshift-operators"

# Step 4: Deploy Kafka
info "Step 4: Deploying Kafka cluster"
oc apply -f infrastructure/kafka/kafka-cluster.yaml
wait_for_kafka
oc apply -f infrastructure/kafka/kafka-topic.yaml
info "Kafka topic 'orders' created"

# Step 5: Deploy Kafka Console
info "Step 5: Deploying Kafka Console"
CLUSTER_DOMAIN=$(oc get ingresses.config/cluster -o jsonpath='{.spec.domain}')
cat <<EOF | oc apply -f -
apiVersion: console.streamshub.github.com/v1alpha1
kind: Console
metadata:
  name: kafka-console
  namespace: $NAMESPACE
spec:
  hostname: kafka-console.${CLUSTER_DOMAIN}
  kafkaClusters:
    - name: my-cluster
      namespace: $NAMESPACE
      listener: plain
EOF
info "Kafka Console deploying at kafka-console.${CLUSTER_DOMAIN}"

# Step 6: Deploy PostgreSQL
info "Step 6: Deploying PostgreSQL"
oc apply -f infrastructure/postgresql/deployment.yaml
wait_for_pod "app=postgresql" "$NAMESPACE"
info "PostgreSQL is ready"

# Step 7: Deploy KEDA controller
info "Step 7: Deploying KEDA controller"
oc create namespace openshift-keda 2>/dev/null || true
oc apply -f infrastructure/keda/keda-controller.yaml
sleep 10
info "KEDA controller deployed"

# Step 8: Build demo app images
info "Step 8: Building demo app images"

info "Building kafka-producer..."
oc new-build --name=kafka-producer --binary --strategy=docker -n "$NAMESPACE" --to='kafka-producer:latest' 2>/dev/null || true
oc start-build kafka-producer --from-dir=demo-1-kafka/producer --follow -n "$NAMESPACE"

info "Building kafka-consumer..."
oc new-build --name=kafka-consumer --binary --strategy=docker -n "$NAMESPACE" --to='kafka-consumer:latest' 2>/dev/null || true
oc start-build kafka-consumer --from-dir=demo-1-kafka/consumer --follow -n "$NAMESPACE"

info "Building job-api..."
oc new-build --name=job-api --binary --strategy=docker -n "$NAMESPACE" --to='job-api:latest' 2>/dev/null || true
oc start-build job-api --from-dir=demo-2-postgresql/web-api --follow -n "$NAMESPACE"

info "Building job-worker..."
oc new-build --name=job-worker --binary --strategy=docker -n "$NAMESPACE" --to='job-worker:latest' 2>/dev/null || true
oc start-build job-worker --from-dir=demo-2-postgresql/worker --follow -n "$NAMESPACE"

info "Building dashboard..."
oc new-build --name=dashboard --binary --strategy=docker -n "$NAMESPACE" --to='dashboard:latest' 2>/dev/null || true
oc start-build dashboard --from-dir=dashboard --follow -n "$NAMESPACE"

# Step 9: Deploy applications
info "Step 9: Deploying applications"
oc apply -f demo-1-kafka/producer/deployment.yaml
oc apply -f demo-1-kafka/consumer/deployment.yaml
oc apply -f demo-2-postgresql/web-api/deployment.yaml
oc apply -f demo-2-postgresql/worker/deployment.yaml
oc apply -f dashboard/deployment.yaml

# Step 10: Wait for non-scaled apps to be ready
wait_for_pod "app=kafka-producer" "$NAMESPACE"
wait_for_pod "app=job-api" "$NAMESPACE"
wait_for_pod "app=dashboard" "$NAMESPACE"

# Step 11: Apply KEDA ScaledObjects
info "Step 11: Applying KEDA ScaledObjects"
oc apply -f demo-2-postgresql/keda/trigger-auth.yaml
oc apply -f demo-1-kafka/keda/scaled-object.yaml
oc apply -f demo-1-kafka/keda/trigger-auth.yaml
oc apply -f demo-2-postgresql/keda/scaled-object.yaml

info "=== Setup Complete ==="
info ""
info "Producer URL:  http://$(oc get route kafka-producer -n $NAMESPACE -o jsonpath='{.spec.host}' 2>/dev/null || echo 'pending...')"
info "Job API URL:   http://$(oc get route job-api -n $NAMESPACE -o jsonpath='{.spec.host}' 2>/dev/null || echo 'pending...')"
info "Kafka Console: https://kafka-console.${CLUSTER_DOMAIN:-$(oc get ingresses.config/cluster -o jsonpath='{.spec.domain}')}"
info "Dashboard:     http://$(oc get route dashboard -n $NAMESPACE -o jsonpath='{.spec.host}' 2>/dev/null || echo 'pending...')"
info ""
info "Run ./scripts/demo-1-run.sh for the Kafka demo"
info "Run ./scripts/demo-2-run.sh for the PostgreSQL demo"

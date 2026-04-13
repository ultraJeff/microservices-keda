# CLAUDE.md

## What this project is

Demo repo for the talk "From CPU to Queue Depth: Event-Driven Autoscaling with KEDA on OpenShift." Contains three demos (Kafka, PostgreSQL, RabbitMQ) plus a dashboard, all deployed to OpenShift with KEDA autoscaling.

## Prerequisites

- OpenShift 4.12+ cluster with **cluster-admin** access
- `oc` CLI installed and authenticated (`oc login`)
- OperatorHub available (for AMQ Streams, Kafka Console, Custom Metrics Autoscaler)

## Deploying

```bash
chmod +x scripts/*.sh
./scripts/setup.sh
```

`setup.sh` is idempotent-ish (uses `2>/dev/null || true` on `oc new-build`) and takes ~7-8 minutes. It:

1. Creates namespace `keda-demo`
2. Installs three operators via OLM subscriptions (AMQ Streams, AMQ Streams Console, Custom Metrics Autoscaler)
3. Waits for each operator CSV to reach `Succeeded`
4. Deploys Kafka cluster (Strimzi CR) + `orders` topic (10 partitions)
5. Deploys Kafka Console (StreamsHub CR, derives hostname from cluster ingress domain)
6. Deploys RabbitMQ (Deployment + Service + Route)
7. Deploys PostgreSQL (Deployment + PVC + ConfigMap with init SQL + Service)
8. Creates `openshift-keda` namespace and deploys `KedaController` CR
9. Builds 8 container images via `oc new-build --binary --strategy=docker` + `oc start-build --from-dir`
10. Deploys all applications (Deployments + Services + Routes)
11. Resolves the notification-frontend Route URL and injects it into the dashboard Deployment via `sed`
12. Applies KEDA ScaledObjects and TriggerAuthentications for all three demos

## Tearing down

```bash
./scripts/teardown.sh
```

Removes all demo resources, builds, and the `keda-demo` namespace. Does **not** uninstall operators — remove those manually from OperatorHub if needed.

## Running the demos

```bash
./scripts/demo-1-run.sh   # Kafka consumer autoscaling (lag-based)
./scripts/demo-2-run.sh   # PostgreSQL job worker autoscaling (SQL query)
./scripts/demo-3-run.sh   # RabbitMQ notification worker autoscaling (queue depth)
```

Each script is an interactive walkthrough with pauses — press Enter to advance through steps.

## Project layout

```
infrastructure/          Namespace + operator subscriptions + infra deployments
  namespace.yaml         keda-demo namespace
  kafka/                 AMQ Streams subscription, Kafka cluster CR, topic CR, console subscription
  keda/                  Custom Metrics Autoscaler subscription, KedaController CR
  postgresql/            PostgreSQL Deployment + PVC + init ConfigMap + Service
  rabbitmq/              RabbitMQ Deployment + Service + Management Route
  kustomization.yaml     Groups infra resources (not used by setup.sh, but available)

demo-1-kafka/            Kafka consumer scaling demo
  producer/              Node.js HTTP app, POST /burst/:count sends messages to Kafka
  consumer/              Node.js Kafka consumer (group: order-processors), KEDA scales 0→10
  keda/                  ScaledObject (kafka scaler, lag threshold 10) + TriggerAuth

demo-2-postgresql/       PostgreSQL job queue demo
  web-api/               Node.js REST API, POST /jobs to insert pending jobs
  worker/                Node.js worker polling for pending jobs, KEDA scales 0→5
  db/init.sql            Jobs table schema
  keda/                  ScaledObject (postgresql scaler, pending count > 5) + TriggerAuth

demo-3-rabbitmq/         RabbitMQ notification demo
  bff/                   Backend-for-frontend, POST /notify enqueues to RabbitMQ
  worker/                Node.js consumer, KEDA scales on queue depth
  frontend/              Notification micro-frontend (embedded in dashboard via iframe)
  keda/                  ScaledObject (rabbitmq scaler) + TriggerAuth

dashboard/               Aggregator UI showing pods/deployments + links to all demos
                         Uses a ServiceAccount with RBAC to list pods/deployments in keda-demo

scripts/
  setup.sh               Full deploy (operators + infra + builds + apps + KEDA)
  teardown.sh             Full cleanup
  demo-{1,2,3}-run.sh    Interactive demo walkthroughs
```

## Key details for AI assistants

- This is **OpenShift-only** — uses `oc` CLI, Routes, OpenShift binary builds, OLM subscriptions. Not portable to vanilla Kubernetes without changes.
- Container images are built **on-cluster** using `oc new-build --binary --strategy=docker`. There is no external registry or CI pipeline.
- Image references in deployment YAMLs point to the internal registry: `image-registry.openshift-image-registry.svc:5000/keda-demo/<name>:latest`
- The dashboard deployment.yaml contains `PLACEHOLDER` for the `NOTIFICATION_MFE_URL` env var — `setup.sh` uses `sed` to replace it with the resolved Route URL at deploy time.
- KEDA-scaled workloads (kafka-consumer, job-worker, notification-worker) start at 0 replicas and won't have running pods until load is generated.
- The README documents only demos 1 and 2; demo 3 (RabbitMQ), the dashboard, and RabbitMQ infra are fully implemented but only referenced in `setup.sh` and the demo-3 script.
- All app code is Node.js (Express or plain scripts) with Alpine-based Dockerfiles.

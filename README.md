# Event-Driven Autoscaling with KEDA on OpenShift

Demo code and infrastructure for the talk **"From CPU to Queue Depth: Event-Driven Autoscaling with KEDA on OpenShift"**.

This repository contains two complete demos showing how to use KEDA (Kubernetes Event-Driven Autoscaling) — available on OpenShift as the **Custom Metrics Autoscaler** operator — to scale workloads based on real demand rather than CPU/Memory.

## Architecture

### Demo 1: Kafka Consumer Scaling

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Producer    │────▶│  Kafka          │────▶│  Consumer        │
│  (Node.js)   │     │  (Topic: orders │     │  (Node.js)       │
│  POST /burst │     │   10 partitions)│     │  group: order-   │
│              │     │                 │     │  processors      │
└──────────────┘     └─────────────────┘     └──────────────────┘
                                                      ▲
                                              ┌───────┴────────┐
                                              │  KEDA          │
                                              │  ScaledObject  │
                                              │  lag > 10 →    │
                                              │  scale 0→10    │
                                              └────────────────┘
```

KEDA monitors Kafka consumer group lag and scales consumer pods from 0 to 10.

### Demo 2: PostgreSQL Job Queue

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Job API     │────▶│  PostgreSQL     │────▶│  Worker          │
│  (Node.js)   │     │  (jobs table)   │     │  (Node.js)       │
│  POST /jobs  │     │                 │     │  polls pending   │
│              │     │                 │     │  jobs             │
└──────────────┘     └─────────────────┘     └──────────────────┘
                                                      ▲
                                              ┌───────┴────────┐
                                              │  KEDA          │
                                              │  ScaledObject  │
                                              │  pending > 5 → │
                                              │  scale 0→5     │
                                              └────────────────┘
```

KEDA runs a SQL query to count pending jobs and scales worker pods from 0 to 5.

## Prerequisites

- OpenShift 4.12+ cluster with cluster-admin access
- `oc` CLI installed and logged in
- Access to OperatorHub (for AMQ Streams and Custom Metrics Autoscaler operators)

## Quick Start

```bash
# 1. Clone the repo
git clone <repo-url>
cd microservices-keda

# 2. Run the setup script (installs operators, deploys infrastructure)
chmod +x scripts/*.sh
./scripts/setup.sh

# 3. Wait for all pods to be ready
oc get pods -n keda-demo -w

# 4. Run Demo 1 (Kafka)
./scripts/demo-1-run.sh

# 5. Run Demo 2 (PostgreSQL)
./scripts/demo-2-run.sh

# 6. Teardown
./scripts/teardown.sh
```

## Demo 1: Kafka Consumer Scaling

### What it demonstrates
- Scale-to-zero: Consumer starts at 0 replicas
- Burst response: Produce 500 messages → consumers scale up based on lag
- Scale-down: Messages drain → consumers scale back to 0

### Manual walkthrough

```bash
# Get the producer route
PRODUCER_URL=$(oc get route kafka-producer -n keda-demo -o jsonpath='{.spec.host}')

# Produce a burst of 500 messages
curl http://$PRODUCER_URL/burst/500

# Watch consumer pods scale
oc get pods -n keda-demo -l app=kafka-consumer -w

# Check the HPA KEDA created
oc get hpa -n keda-demo

# Watch pods scale back to 0 after processing
```

## Demo 2: PostgreSQL Job Queue

### What it demonstrates
- KEDA can scale on any queryable metric (not just message queues)
- SQL-based trigger: `SELECT COUNT(*) FROM jobs WHERE status = 'pending'`
- Same scale-to-zero pattern as Demo 1

### Manual walkthrough

```bash
# Get the API route
API_URL=$(oc get route job-api -n keda-demo -o jsonpath='{.spec.host}')

# Insert 50 pending jobs
curl -X POST http://$API_URL/jobs -H 'Content-Type: application/json' -d '{"count": 50}'

# Watch worker pods scale
oc get pods -n keda-demo -l app=job-worker -w

# Check job status
curl http://$API_URL/jobs/status

# Watch pods scale back to 0 after processing
```

## Project Structure

```
microservices-keda/
├── README.md
├── slides/
│   └── outline.md                    # Slide-by-slide outline
├── demo-1-kafka/
│   ├── producer/                     # Kafka message producer (Node.js)
│   │   ├── index.js
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── deployment.yaml
│   ├── consumer/                     # Kafka message consumer (Node.js)
│   │   ├── index.js
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── deployment.yaml
│   └── keda/
│       ├── scaled-object.yaml        # KEDA ScaledObject (Kafka trigger)
│       └── trigger-auth.yaml
├── demo-2-postgresql/
│   ├── web-api/                      # REST API for job submission (Node.js)
│   │   ├── index.js
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── deployment.yaml
│   ├── worker/                       # Background job worker (Node.js)
│   │   ├── index.js
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── deployment.yaml
│   ├── db/
│   │   └── init.sql                  # Database schema
│   └── keda/
│       ├── scaled-object.yaml        # KEDA ScaledObject (PostgreSQL trigger)
│       └── trigger-auth.yaml
├── infrastructure/
│   ├── namespace.yaml
│   ├── kafka/
│   │   ├── subscription.yaml         # AMQ Streams operator
│   │   ├── kafka-cluster.yaml        # Kafka cluster CR
│   │   └── kafka-topic.yaml          # orders topic
│   ├── postgresql/
│   │   └── deployment.yaml           # PostgreSQL + init SQL
│   └── keda/
│       ├── subscription.yaml         # Custom Metrics Autoscaler operator
│       └── keda-controller.yaml      # KedaController CR
└── scripts/
    ├── setup.sh                      # Full environment setup
    ├── teardown.sh                   # Clean everything up
    ├── demo-1-run.sh                 # Demo 1 walkthrough
    └── demo-2-run.sh                 # Demo 2 walkthrough
```

## Key KEDA Concepts Demonstrated

| Concept | Demo 1 (Kafka) | Demo 2 (PostgreSQL) |
|---------|----------------|---------------------|
| Scaler type | `kafka` | `postgresql` |
| Metric | Consumer group lag | SQL query result |
| Scale-to-zero | ✅ | ✅ |
| Max replicas | 10 | 5 |
| Trigger auth | Plaintext (demo) | Secret reference |

## Resources

- [KEDA Documentation](https://keda.sh)
- [KEDA Scalers List](https://keda.sh/docs/scalers/)
- [OpenShift Custom Metrics Autoscaler](https://docs.openshift.com/container-platform/latest/nodes/cma/nodes-cma-autoscaling-custom.html)
- [AMQ Streams (Strimzi) on OpenShift](https://access.redhat.com/documentation/en-us/red_hat_amq_streams/)

## License

MIT

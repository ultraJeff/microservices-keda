# Event-Driven Microservices on OpenShift: Scaling on What Matters with KEDA

## Slide Deck Outline — 45 Minutes (35 min content + 10 min Q&A)

---

### SECTION 1: Opening & The Problem (4 min)

#### Slide 1 — Title Slide
- **Title:** Event-Driven Microservices on OpenShift: Scaling on What Matters with KEDA
- **Subtitle:** Smart endpoints, dumb pipes, and the autoscaler that ties them together
- **Visual:** Clean title with KEDA + OpenShift logos

#### Slide 2 — About Me
- [Your name, title, social handles]
- Brief background

#### Slide 3 — What Are Event-Driven Microservices?
- **Key point:** Services that communicate through events — not synchronous HTTP chains
- **Bullets:**
  - Instead of Service A calling Service B calling Service C in a blocking chain...
  - ...Service A publishes an event. Services B and C react independently.
  - The "pipes" are Kafka topics, message queues, database tables — simple, dumb transport
  - The "endpoints" are your services — smart, independent, deployable on their own schedule
  - This is Fowler's "smart endpoints, dumb pipes" in practice
- **Visual:** Two diagrams side by side — synchronous chain (fragile) vs. event-driven (resilient)
- **Speaker notes:** "Event-driven microservices flip the communication model. Instead of a fragile chain of synchronous calls where one slow service blocks everything upstream, services publish events and consumers react independently. The pipes — Kafka, RabbitMQ, even a database table — are simple transport. Your services are the smart endpoints. This decoupling is what makes microservices actually work at scale. But it creates a new problem..."

---

### SECTION 2: The Scaling Gap (3 min)

#### Slide 4 — The Problem with Event-Driven Scaling
- **Key point:** You built event-driven microservices. Now your scaling model is broken.
- **Bullets:**
  - Queue has 10,000 messages backed up, but consumer CPU is at 20% (I/O-bound)
  - HPA says "Everything is fine!" while processing latency grows from seconds to minutes
  - CPU is a *symptom* of load. Queue depth is the *cause*.
  - HPA was designed for request-based workloads — not event-driven ones
  - **Bursty queues**, **I/O-bound workers**, and **idle waste** are the norm, not the exception
- **Visual:** Split screen — left: "CPU: 20% ✅" / right: "Queue depth: 10,000 🔥"
- **Speaker notes:** "You built event-driven microservices — great. But now your scaling model is broken. CPU-based HPA was designed for HTTP request traffic. It assumes CPU correlates with demand. But for a Kafka consumer doing network I/O, CPU never spikes — even when you're drowning in backlog. The cause of load is messages in a queue, not CPU utilization. We need to scale on the cause, not the symptom."

---

### SECTION 3: KEDA — The Missing Piece (5 min)

#### Slide 5 — Enter KEDA
- **Key point:** KEDA makes event-driven microservices operationally viable
- **Bullets:**
  - CNCF Graduated project (same level as Kubernetes, Prometheus, Envoy)
  - Extends HPA — doesn't replace it. Feeds external metrics into the HPA machinery.
  - 60+ built-in scalers: Kafka, RabbitMQ, PostgreSQL, Prometheus, SQS, Cron, and more
  - Scale to zero and back — HPA can't do this alone
  - Available on OpenShift as "Custom Metrics Autoscaler" operator
- **Visual:** Grid of scaler logos alongside the KEDA logo
- **Speaker notes:** "This is the missing piece. KEDA — Kubernetes Event-Driven Autoscaling. It's a CNCF Graduated project that extends HPA to scale on external metrics. Your Kafka consumer lag, your RabbitMQ queue depth, a SQL query against your database — KEDA can scale on any of them. It's what makes event-driven microservices operationally viable."

#### Slide 6 — How KEDA Works
- **Key point:** KEDA bridges your event sources and Kubernetes scaling
- **Visual:** Architecture diagram: External System → KEDA Scaler → Metrics Adapter → HPA → Deployment
- **Bullets:**
  - KEDA Operator watches ScaledObject CRDs, creates and manages HPA automatically
  - Metrics Adapter registers as an external metrics provider
  - KEDA handles the 0→1 and 1→0 transitions (HPA can't)
  - HPA handles 1→N scaling using the metrics KEDA provides
- **Speaker notes:** "KEDA handles two things HPA can't: connecting to external metric sources, and scaling from/to zero. For the 1-to-N scaling, it leverages the battle-tested HPA algorithm. Best of both worlds."

#### Slide 7 — ScaledObject Deep Dive
- **Key point:** The main CRD you'll work with
- **Visual:** Annotated YAML:
```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: kafka-consumer-scaler
spec:
  scaleTargetRef:
    name: kafka-consumer          # What to scale
  pollingInterval: 5              # How often to check (seconds)
  cooldownPeriod: 30              # Wait before scaling down
  minReplicaCount: 0              # Enable scale-to-zero
  maxReplicaCount: 10             # Safety cap
  triggers:
    - type: kafka                 # Which scaler to use
      metadata:
        consumerGroup: my-group
        topic: orders
        lagThreshold: "10"        # Scale when lag > 10 per partition
```
- **Speaker notes:** "scaleTargetRef points to the Deployment you want to scale. pollingInterval controls how frequently KEDA checks. cooldownPeriod prevents flapping. And triggers define what metric to scale on — this is where you connect to your event source. Let me show you this in action with three different event-driven microservice patterns."

---

### SECTION 4: Demo 1 — Event Streaming with Kafka (7 min)

#### Slide 8 — Demo 1: Order Processing Pipeline
- **Key point:** An event-driven order service — producer publishes, consumers react
- **Visual:** Architecture diagram:
  - Producer (Node.js) → Kafka topic "orders" (10 partitions) → Consumer (Node.js)
  - KEDA watches consumer group lag
  - Arrow showing: lag > threshold → scale consumers 0→10
- **Bullets:**
  - Pattern: Event streaming — producers and consumers decoupled through a Kafka topic
  - Producer: HTTP API sends burst of 500 order events
  - Consumer: Independently processes orders with 500ms simulated work
  - KEDA: Scales consumers 0→10 based on consumer group lag
- **Speaker notes:** "Our first event-driven microservice: an order processing pipeline. A producer publishes order events to Kafka. Consumers process them independently — they don't know or care about the producer. KEDA watches the consumer group lag and scales the consumers to match demand."

#### Slide 9 — LIVE DEMO: Kafka
- **Demo steps:**
  1. Show the dashboard — 0 consumer pods (scale to zero)
  2. Show the ScaledObject configuration
  3. Send 500 order events via the producer
  4. Watch consumer pods scale up in real time
  5. Show `oc get hpa` — KEDA created the HPA automatically
  6. Messages drain → pods scale back to 0
- **Speaker notes:** "Zero consumer pods — no events, no compute. Now I send 500 orders... [demo]. KEDA detected lag within 5 seconds, activated the deployment, HPA scaled up. Backlog drains, we're back to zero. This is what scaling event-driven microservices looks like."

---

### SECTION 5: Scale to Zero (2 min)

#### Slide 10 — Scale to Zero & The Cold Start Trade-off
- **Key point:** KEDA's signature feature — but understand the cost
- **Bullets:**
  - Set `minReplicaCount: 0` — KEDA polls the external metric even with 0 pods
  - When activation threshold is crossed → 0→1 → HPA takes over for 1→N
  - **Trade-off:** first event waits for container pull + startup (2s for Node.js, 10-30s for Spring)
  - Mitigations: `minReplicaCount: 1` for critical paths, cron triggers for business-hours baseline, lightweight images
- **Visual:** State diagram: Idle (0 pods) → Activation → Active (HPA manages) → Cooldown → Idle
- **Speaker notes:** "Scale to zero means your event-driven microservices cost nothing when there's no work. But the first event will wait for cold start. For Node.js, about 2 seconds. For Spring Boot, maybe 20. You decide per-service whether that's acceptable."

---

### SECTION 6: Demo 2 — Job Queue with PostgreSQL (5 min)

#### Slide 11 — Demo 2: Background Job Processing
- **Key point:** Event-driven doesn't always mean message queues — a database table works too
- **Visual:** Architecture diagram:
  - Web API (Node.js) → PostgreSQL (jobs table) → Worker (Node.js)
  - KEDA runs: `SELECT COUNT(*) FROM jobs WHERE status = 'pending'`
  - Arrow showing: count > threshold → scale workers 0→5
- **Speaker notes:** "Second event-driven pattern: a job queue backed by PostgreSQL. Events are rows in a table. A web API inserts pending jobs, workers poll and process them. KEDA runs a SQL query every 5 seconds — if you can query it, you can scale on it."

#### Slide 12 — LIVE DEMO: PostgreSQL
- **Demo steps:**
  1. Show 0 worker pods
  2. Show the PostgreSQL ScaledObject — highlight the SQL query trigger
  3. Insert 50 jobs via the API
  4. Watch workers scale up, process jobs, scale back to 0
- **Speaker notes:** "Same scaling pattern, different event source. Let's insert 50 jobs... [demo]. Workers scale up, process the queue, scale back to zero. The microservice doesn't know KEDA exists — it just processes work."

---

### SECTION 7: Demo 3 — Notification Fan-Out with RabbitMQ (5 min)

#### Slide 13 — Demo 3: Notification Service (Micro-Frontend + BFF)
- **Key point:** A complete event-driven microservice with its own frontend, API, and workers
- **Visual:** Architecture diagram:
  - Dashboard (Shell App) → iframe → Notification Micro-Frontend (separate deployment + route)
  - Notification MFE → Notification BFF → RabbitMQ queue → Worker
  - KEDA watches RabbitMQ queue depth → scale workers 0→8
- **Bullets:**
  - Micro-frontend: Notification UI is a standalone app, separately deployed, loaded via iframe
  - Backend-for-Frontend: BFF aggregates notification submission + queue stats for the MFE
  - Third KEDA scaler: RabbitMQ queue length (after Kafka lag and PostgreSQL row count)
- **Speaker notes:** "Our third demo is a full event-driven microservice with its own UI, API, and workers. The notification micro-frontend is deployed separately and loaded into the dashboard shell. It talks to a dedicated BFF that pushes notifications into RabbitMQ. Workers consume and deliver them. KEDA scales on queue depth — our third scaler type."

#### Slide 14 — LIVE DEMO: RabbitMQ
- **Demo steps:**
  1. Show the dashboard with all three panels — point out the micro-frontend iframe
  2. Open the notification micro-frontend in its own tab to prove independent deployment
  3. Send 30 notifications → watch workers scale up → drain → scale to 0
- **Speaker notes:** "Notice the 'Separate Deploy' badge — this UI is loaded from a completely different deployment. I can open it in its own tab. Send 30 notifications... same KEDA pattern, third event source."

---

### SECTION 8: Best Practices & Production Readiness (5 min)

#### Slide 15 — Three Event-Driven Patterns, One Scaling Model
- **Key point:** The beauty of KEDA is that the pattern is always the same
- **Visual:** Three-column comparison
  - **Demo 1:** Kafka consumer lag → Scale consumers | Event streaming pattern
  - **Demo 2:** PostgreSQL pending rows → Scale workers | Job queue pattern
  - **Demo 3:** RabbitMQ queue depth → Scale workers | Notification fan-out + micro-frontend
- **Speaker notes:** "Three event-driven microservice patterns, three different event sources — but the KEDA scaling model is identical every time. Define the metric that represents demand, set a threshold, scale on the cause. The microservices don't know about KEDA. KEDA doesn't know about your business logic. Each concern is isolated — exactly how microservices should work."

#### Slide 16 — Microservices Best Practices (Fowler & Lewis)
- **Key point:** What you just saw maps directly to Fowler & Lewis's characteristics of microservice architectures (2014)
- **Bullets:**
  1. **Smart endpoints, dumb pipes** — our services are the smart endpoints. Kafka, RabbitMQ, and PostgreSQL are the dumb pipes. KEDA scales the endpoints when the pipes fill up.
  2. **Organized around business capabilities** — order processing, job execution, notification delivery. Not "database access layer."
  3. **Decentralized data management** — each service owns its data store
  4. **Design for failure** — scale to zero means graceful degradation is built in
  5. **Infrastructure automation** — operators, containers, KEDA. Every piece is declarative.
- **Attribution:** Martin Fowler & James Lewis, "Microservices" (2014) — martinfowler.com/articles/microservices.html
- **Speaker notes:** "Everything you just watched maps to Fowler and Lewis's microservice characteristics. 'Smart endpoints, dumb pipes' — that's the thesis of this entire talk. Our services are the smart endpoints. Kafka and RabbitMQ are the dumb pipes. And KEDA is what scales the endpoints when the pipes fill up. That's event-driven microservices in practice."

#### Slide 17 — Production Readiness
- **Key point:** Getting event-driven microservices right on OpenShift
- **Bullets:**
  - **Setup:** Install "Custom Metrics Autoscaler" from OperatorHub → create KedaController CR
  - **Security:** Use `TriggerAuthentication` to reference Secrets — never inline credentials
  - **Guardrails:** Always set `maxReplicaCount`, tune `cooldownPeriod` (30-300s), configure `fallback` behavior
  - **Observability:** KEDA exports Prometheus metrics — dashboard `keda_scaler_metrics_value`, alert on `keda_scaled_object_errors`
- **Speaker notes:** "A few things to get right before production. The most common mistake is not setting maxReplicaCount — a burst could create hundreds of replicas. Use TriggerAuthentication for credentials. And dashboard KEDA's Prometheus metrics so you know when a scaler can't reach its event source."

---

### SECTION 9: Closing (2 min)

#### Slide 18 — The Shift
- **Key point:** Event-driven microservices need event-driven scaling
- **Visual:** Before/After comparison
  - **Before:** CPU → HPA → Reactive → Waste during idle, slow during bursts
  - **After:** Queue depth → KEDA → Proactive → Zero waste, instant response
- **Speaker notes:** "Event-driven microservices are the architecture. KEDA is the operational layer that makes them viable. Scale on the cause — not the symptom. Faster response, zero waste, scaling that actually matches your workload."

#### Slide 19 — Resources
- **Bullets:**
  - KEDA docs: keda.sh
  - OpenShift Custom Metrics Autoscaler docs
  - Demo code: [your GitHub repo URL]
  - KEDA scalers list: keda.sh/docs/scalers/
- **Visual:** QR code linking to the GitHub repo

#### Slide 20 — Q&A
- **Title:** Questions?
- **Visual:** Your contact info, social handles, QR code to repo

# From CPU to Queue Depth: Event-Driven Autoscaling with KEDA on OpenShift

## Slide Deck Outline — 45 Minutes (40 min content + 5 min Q&A)

---

### SECTION 1: Opening, Microservices & The Problem (7 min)

#### Slide 1 — Title Slide
- **Title:** From CPU to Queue Depth: Event-Driven Autoscaling with KEDA on OpenShift
- **Subtitle:** Scaling on what matters
- **Visual:** Clean title with KEDA + OpenShift logos

#### Slide 2 — About Me
- [Your name, title, social handles]
- Brief background

#### Slide 3 — Why Microservices?
- **Key point:** AI can generate the code, but it can't decide how your system scales or where the service boundaries go. Microservices solve the coordination problems that emerge the moment you have real users, real traffic, and real teams.
- **Bullets:**
  - Vibe coding gets you from zero to app fast — but production means scaling, reliability, and team coordination
  - A monolith means every team deploys together — one broken feature blocks everyone
  - Independent deployment: ship your service (or micro frontend) without waiting on others
  - Technology flexibility: your team picks the right tool — React, Node.js, Go, whatever fits
  - Scales with your org: each team owns a service end-to-end (API, UI slice, data)
  - Front-end parallel: micro frontends apply the same principle to the UI layer (Fowler, "Micro Frontends" — martinfowler.com/articles/micro-frontends.html)
- **Visual:** Monolith vs. microservices diagram — single deploy pipeline on the left, independent team pipelines on the right
- **Speaker notes:** "We're in the vibe coding era. You can prompt an AI to generate a full-stack app in an afternoon. That's amazing — but it doesn't change the fundamentals. The moment that app has real users, you need to think about what happens when traffic spikes, when one service goes down, when three teams need to ship on different schedules. AI can write the code for a checkout service, but it can't decide that checkout should be a separate service, or that it needs to scale independently from the catalog. These are architectural decisions that still require human judgment — and microservices are one of the most battle-tested patterns for getting them right. Whether you're building a React app that talks to five backend APIs, or you're building one of those APIs — microservices affect how you ship code."

#### Slide 4 — Microservices Best Practices (Fowler & Lewis)
- **Key point:** Martin Fowler and James Lewis identified 9 characteristics of microservice architectures (2014). The ones that matter most day-to-day:
- **Bullets:**
  1. **Smart endpoints, dumb pipes** — services communicate via simple protocols (HTTP, AMQP, events), not heavyweight middleware
  2. **Organized around business capabilities** — a "checkout" service, not a "database access layer"
  3. **Decentralized data management** — each service owns its data; no shared database
  4. **Design for failure** — circuit breakers, retries, graceful degradation. Your React app needs a loading state because that API *will* go down.
  5. **Infrastructure automation** — CI/CD, containers, operators. If you can't deploy independently, you don't have microservices.
  6. **Evolutionary design** — start with what you need, split later. Fowler: "almost all successful microservice stories started with a monolith."
- **Visual:** The 9 characteristics listed, with the ones discussed highlighted
- **Attribution:** Martin Fowler & James Lewis, "Microservices" (2014) — martinfowler.com/articles/microservices.html
- **Speaker notes:** "Notice characteristic number one — smart endpoints and dumb pipes. Fowler was talking about rejecting heavyweight Enterprise Service Buses in favor of lightweight messaging. That's exactly what we're going to explore: event-driven architectures where services communicate through Kafka topics, message queues, and database tables. And when those message pipes fill up, we need to scale the endpoints — that's where KEDA comes in."

#### Slide 5 — The Cloud-Native Reality
- **Key point:** Modern apps are more than HTTP request/reply
- **Bullets:**
  - Message queues (Kafka, RabbitMQ)
  - Background job processors
  - Stream processing pipelines
  - Scheduled/cron workloads
- **Visual:** Architecture diagram showing a typical event-driven system: Web → API → Kafka → Consumer → Database
- **Speaker notes:** "When we think about scaling, we often default to thinking about web servers handling HTTP requests. But in a real production system, the majority of your compute might be downstream — consumers, workers, processors. These are the workloads we need to think about scaling differently."

#### Slide 6 — The Scaling Mismatch
- **Key point:** CPU/Memory metrics don't reflect actual demand for async workloads
- **Bullets:**
  - Queue has 10,000 messages backed up
  - Consumer CPU is at 20% (it's I/O bound, waiting on network/disk)
  - HPA says: "Everything is fine!"
  - Meanwhile, processing latency grows from seconds to minutes
- **Visual:** Split screen — left side shows "CPU: 20% ✅" and right side shows "Queue depth: 10,000 🔥"
- **Speaker notes:** "This is the fundamental mismatch. CPU utilization is a symptom of work happening, not a measure of work waiting. For I/O-bound consumers, CPU might never spike even when you're drowning in backlog."

#### Slide 7 — Symptom vs. Cause
- **Key point:** CPU is a symptom of load. Queue depth is the cause.
- **Bullets:**
  - Reactive scaling: Wait for CPU to spike → scale up → hope it's not too late
  - Proactive scaling: See messages arriving → scale up → ready before saturation
  - "Scale on the cause of load, not the symptom"
- **Visual:** Two timelines side by side showing reactive (late response) vs proactive (early response) scaling
- **Speaker notes:** "This is the thesis of this talk. We need to stop scaling on symptoms and start scaling on causes. The cause of your consumer's work isn't CPU — it's messages in a queue, rows in a database, events in a stream."

---

### SECTION 2: The Scaling Paradigm Shift (5 min)

#### Slide 8 — Traditional HPA Recap
- **Key point:** How the Horizontal Pod Autoscaler works today
- **Bullets:**
  - metrics-server collects CPU/Memory from kubelets
  - HPA controller checks metrics every 15s (default)
  - Compares current vs target utilization
  - Scales replicas up/down
- **Visual:** Simple flow diagram: kubelet → metrics-server → HPA → Deployment
- **Speaker notes:** "Let's quickly recap how HPA works. It's elegant for request-based workloads — more HTTP requests mean more CPU, which triggers more replicas. But this model assumes a direct correlation between resource usage and demand."

#### Slide 9 — Where HPA Falls Short
- **Key point:** Three scenarios where CPU/Memory-based HPA fails
- **Bullets:**
  1. **Bursty queue traffic:** 1000 messages arrive at once. CPU ramps slowly, HPA reacts late, messages pile up.
  2. **I/O-bound workers:** Network calls, database writes — CPU stays low even under heavy load.
  3. **Idle waste:** Min replicas running 24/7 consuming resources even when queue is empty at 3am.
- **Speaker notes:** "These aren't edge cases — they're the norm for event-driven architectures. If your consumer spends most of its time waiting on I/O, CPU will never be a reliable scaling signal."

#### Slide 10 — Event-Driven Thinking
- **Key point:** Scale on what matters to YOUR workload
- **Bullets:**
  - Kafka consumer lag (messages behind)
  - Database query result (pending rows)
  - Prometheus metric (custom business metric)
  - Cron schedule (time-based pre-scaling)
  - HTTP request rate (for web workloads — HPA still works here!)
- **Visual:** Table showing "Workload Type → Best Scaling Metric"
- **Speaker notes:** "The insight is simple: every workload has a natural metric that represents its demand. For a Kafka consumer, it's consumer group lag. For a job worker, it's pending jobs in the database. The right metric depends on the workload."

#### Slide 11 — Proactive vs. Reactive
- **Key point:** Side-by-side comparison
- **Visual:** Two-column comparison
  - **Reactive (CPU-based):** Load arrives → CPU increases → HPA detects → Scale up → Process backlog
  - **Proactive (Event-based):** Messages arrive → KEDA detects lag → Scale up → Process immediately
- **Speaker notes:** "Notice the difference in timing. With event-based scaling, we know about the work before it causes resource pressure. We can scale proactively — scaling on the cause rather than waiting for the symptom."

---

### SECTION 3: KEDA Core Concepts (7 min)

#### Slide 12 — What is KEDA?
- **Key point:** Kubernetes Event-Driven Autoscaling
- **Bullets:**
  - CNCF Graduated project (same level as Kubernetes, Prometheus, Envoy)
  - Lightweight, single-purpose component
  - Extends Kubernetes HPA — doesn't replace it
  - 60+ built-in scalers for event sources
  - Available on OpenShift as "Custom Metrics Autoscaler" operator
- **Speaker notes:** "KEDA is a CNCF Graduated project, which means it's production-ready and battle-tested. It's not a replacement for HPA — it's an extension. KEDA feeds external metrics into the HPA machinery that Kubernetes already has."

#### Slide 13 — KEDA Architecture
- **Key point:** How the pieces fit together
- **Visual:** Architecture diagram showing:
  - KEDA Operator (watches ScaledObjects)
  - Metrics Adapter (serves external metrics to HPA)
  - Scalers (connect to external systems)
  - HPA (created/managed by KEDA)
  - ScaledObject/ScaledJob CRDs
- **Speaker notes:** "KEDA has three main components. The Operator watches for ScaledObject custom resources. When it finds one, it creates an HPA and configures it to use external metrics. The Metrics Adapter is registered as an external metrics provider, and the Scalers are plugins that know how to talk to specific systems like Kafka, PostgreSQL, Prometheus, etc."

#### Slide 14 — Scalers
- **Key point:** 60+ event sources out of the box
- **Bullets:**
  - **Messaging:** Kafka, RabbitMQ, AWS SQS, Azure Service Bus, NATS
  - **Databases:** PostgreSQL, MySQL, MongoDB, Redis
  - **Monitoring:** Prometheus, Datadog, New Relic
  - **Cloud:** AWS CloudWatch, Azure Monitor, GCP Pub/Sub
  - **Other:** Cron, HTTP, Metrics API, External Push
- **Visual:** Grid of scaler logos/icons
- **Speaker notes:** "This is one of KEDA's biggest strengths — the ecosystem. Whatever your event source is, there's probably already a scaler for it. And if there isn't, you can write a custom one using the external scaler gRPC interface."

#### Slide 15 — ScaledObject Deep Dive
- **Key point:** The main CRD you'll work with
- **Visual:** Annotated YAML showing key fields:
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
- **Speaker notes:** "This is the ScaledObject — KEDA's primary custom resource. Let me walk through the key fields. scaleTargetRef points to the Deployment you want to scale. pollingInterval controls how frequently KEDA checks the external metric. cooldownPeriod prevents flapping by waiting before scaling down. And triggers define what metric to scale on."

#### Slide 16 — ScaledJob
- **Key point:** For batch/run-to-completion workloads
- **Bullets:**
  - Creates Kubernetes Jobs instead of scaling a Deployment
  - One Job per event (or per batch)
  - Jobs run to completion and are cleaned up
  - Good for: image processing, report generation, ETL
- **Speaker notes:** "ScaledObject scales Deployments — long-running processes. ScaledJob is for batch workloads where you want to spin up a Job, process work, and terminate. Think image processing or report generation."

#### Slide 17 — How KEDA Extends HPA
- **Key point:** KEDA doesn't replace HPA — it makes HPA smarter
- **Visual:** Diagram showing: External System → KEDA Scaler → Metrics Adapter → HPA → Deployment
- **Bullets:**
  - KEDA creates and manages HPA objects automatically
  - Registers as an external metrics API provider
  - Handles the 0→1 and 1→0 transitions (HPA can't do this)
  - HPA handles 1→N scaling using the metrics KEDA provides
- **Speaker notes:** "This is important to understand. KEDA handles two things HPA can't: connecting to external metric sources, and scaling from/to zero. For the 1-to-N scaling, it leverages the battle-tested HPA algorithm. You get the best of both worlds."

---

### SECTION 4: Demo 1 — Kafka Consumer Scaling (8 min)

#### Slide 18 — Demo Architecture
- **Key point:** What we're about to see
- **Visual:** Architecture diagram:
  - Producer (Node.js) → Kafka topic "orders" (10 partitions) → Consumer (Node.js)
  - KEDA watches consumer group lag
  - Arrow showing: lag > threshold → scale consumers
- **Bullets:**
  - Producer: HTTP API to send burst of messages
  - Consumer: Processes orders with 500ms delay (simulated work)
  - KEDA: Scales consumers 0→10 based on consumer group lag
- **Speaker notes:** "Here's what we're going to demo. We have a simple producer that publishes order messages to Kafka, and a consumer that processes them with a 500ms delay to simulate real work. KEDA is watching the consumer group lag — the number of unprocessed messages — and will scale our consumers from zero to up to 10 replicas."

#### Slide 19 — LIVE DEMO
- **Demo steps:**
  1. Show the OpenShift console — 0 consumer pods running
  2. Show the ScaledObject and explain the trigger configuration
  3. Hit the producer API: `curl $PRODUCER_URL/burst/500`
  4. Watch the OpenShift console — consumer pods scaling up
  5. Show `oc get hpa` — KEDA created the HPA automatically
  6. Watch consumer pods processing messages (logs)
  7. Messages drain — pods scale back down to 0
- **Speaker notes:** "Let's see this in action. [Switch to terminal/console]. Notice we have zero consumer pods. Now I'm going to produce 500 messages... and watch what happens."

#### Slide 20 — What Just Happened
- **Key point:** Recap the scaling timeline
- **Visual:** Timeline diagram:
  - T=0: 500 messages produced, 0 consumers
  - T=5s: KEDA detects lag, activates deployment (0→1)
  - T=10s: HPA scales to N consumers based on lag per partition
  - T=60s: Messages draining, lag decreasing
  - T=90s: All messages processed, cooldown begins
  - T=120s: Scale to zero
- **Speaker notes:** "Let's break down what happened. KEDA detected consumer lag within 5 seconds of the burst. It activated the deployment, and then HPA took over to scale to the right number of replicas. As the backlog drained, replicas scaled down, and after the cooldown period, we're back to zero. No wasted resources."

---

### SECTION 5: Scale to Zero & Cold Start (5 min)

#### Slide 21 — Scale to Zero Mechanics
- **Key point:** How KEDA achieves true zero-instance scaling
- **Bullets:**
  - Set `minReplicaCount: 0` in ScaledObject
  - KEDA controller watches external metrics even with 0 pods
  - When metric exceeds activation threshold → scale 0→1
  - HPA takes over for 1→N scaling
  - When metric drops → HPA scales to 1 → KEDA scales 1→0
- **Visual:** State diagram: Idle (0 pods) → Activation → Active (HPA manages) → Cooldown → Idle
- **Speaker notes:** "Scale to zero is KEDA's signature feature. HPA can't do this — it requires at least 1 replica. KEDA handles the 0-to-1 transition by continuously polling the external metric source. When the activation threshold is crossed, KEDA activates the deployment, and HPA takes over from there."

#### Slide 22 — The Cold Start Trade-off
- **Key point:** Scale-to-zero isn't free — understand the cost
- **Bullets:**
  - First message latency: container pull + startup time (5-30s typically)
  - Node.js apps start fast (~2s), Java/Spring can be 10-30s
  - Strategies to mitigate:
    - Keep `minReplicaCount: 1` for latency-critical paths
    - Use `activationTargetQueryValue` for early activation
    - Pre-warm with cron triggers during business hours
    - Use lightweight runtime images (Alpine, distroless)
- **Speaker notes:** "Scale to zero is powerful for cost savings, but there's a trade-off: cold start latency. The first message will wait while the container image is pulled and the app starts up. For our Node.js demo apps, that's about 2 seconds. For a Spring Boot app, it could be 15-30 seconds. You need to decide per-workload whether that latency is acceptable."

#### Slide 23 — Hybrid Scaling: Multiple Triggers
- **Key point:** Combine triggers for sophisticated scaling strategies
- **Visual:** Annotated YAML showing multiple triggers:
```yaml
triggers:
  - type: cron
    metadata:
      timezone: America/New_York
      start: 0 8 * * 1-5      # Weekdays 8am
      end: 0 18 * * 1-5        # Weekdays 6pm
      desiredReplicas: "2"      # Business hours baseline
  - type: kafka
    metadata:
      lagThreshold: "10"        # Burst handling on top
```
- **Speaker notes:** "You can combine multiple triggers in a single ScaledObject. KEDA uses the highest replica count from any trigger. So here, during business hours we always have at least 2 replicas (cron trigger), but if Kafka lag spikes, we can burst higher. Outside business hours, the cron trigger returns to 0 and we scale on Kafka lag alone — potentially to zero."

---

### SECTION 6: Demo 2 — PostgreSQL Job Queue (5 min)

#### Slide 24 — Demo Architecture
- **Key point:** KEDA isn't just for message queues
- **Visual:** Architecture diagram:
  - Web API (Node.js) → PostgreSQL (jobs table) → Worker (Node.js)
  - KEDA runs: `SELECT COUNT(*) FROM jobs WHERE status = 'pending'`
  - Arrow showing: count > threshold → scale workers
- **Bullets:**
  - Web API: REST endpoint to submit jobs
  - Worker: Polls for pending jobs, processes with 3s delay
  - KEDA: Scales workers 0→5 based on pending job count
  - Shows that ANY queryable metric can drive scaling
- **Speaker notes:** "Our second demo shows that KEDA isn't just for Kafka. Here we have a classic job queue pattern — a web API inserts rows into a PostgreSQL table, and workers poll for pending jobs. KEDA runs a SQL query every 5 seconds to count pending jobs and scales workers accordingly."

#### Slide 25 — LIVE DEMO
- **Demo steps:**
  1. Show 0 worker pods
  2. Show the PostgreSQL ScaledObject — highlight the SQL query trigger
  3. Hit the API: `curl -X POST $API_URL/jobs -d '{"count": 50}'`
  4. Watch workers scale up in OpenShift console
  5. Check job status: `curl $API_URL/jobs/status`
  6. Watch workers process jobs and scale back to 0
- **Speaker notes:** "Same pattern, different event source. Let's insert 50 jobs... and watch the workers come alive."

#### Slide 26 — Key Takeaway
- **Key point:** Any metric you can query can drive autoscaling
- **Bullets:**
  - Kafka consumer lag → scale consumers
  - PostgreSQL row count → scale workers
  - Prometheus metric → scale any workload
  - HTTP request rate → scale web servers
  - "If you can measure it, you can scale on it"
- **Speaker notes:** "The power of KEDA is its universality. The pattern is always the same: define a query or metric that represents demand, set a threshold, and KEDA handles the rest. Whether it's Kafka lag, a SQL query, a Prometheus gauge, or an HTTP endpoint — the pattern is identical."

---

### SECTION 7: Demo 3 — RabbitMQ, Micro-Frontends & BFF (5 min)

#### Slide 27 — Demo Architecture: Putting It All Together
- **Key point:** A third scaler type combined with micro-frontend and BFF patterns
- **Visual:** Architecture diagram:
  - Dashboard (Shell App) → iframe → Notification Micro-Frontend (separate deployment + route)
  - Notification MFE → Notification BFF (Express API) → RabbitMQ queue "notifications" → Worker
  - KEDA watches RabbitMQ queue depth
  - Arrow showing: depth > 5 → scale workers 0→8
- **Bullets:**
  - Micro-frontend: Notification UI is a standalone app, separately deployed, loaded into the dashboard via iframe
  - Backend-for-Frontend: BFF aggregates notification submission + queue stats for the MFE
  - Third KEDA scaler: RabbitMQ queue length (after Kafka consumer lag and PostgreSQL row count)
  - Workers: AMQP consumers that simulate email delivery with 2s delay
- **Speaker notes:** "Our third demo brings together architectural patterns we discussed earlier. The notification UI is a micro-frontend — a separate deployment with its own route, loaded into the dashboard shell via an iframe. It talks to a dedicated Backend-for-Frontend that handles notification submission and queue stats. Behind the BFF, RabbitMQ queues the work, and KEDA scales workers using a third scaler type — RabbitMQ queue length."

#### Slide 28 — LIVE DEMO
- **Demo steps:**
  1. Show the dashboard with all three panels — point out the micro-frontend iframe with "Separate Deploy" badge
  2. Open the notification micro-frontend in its own tab to show it's independently accessible
  3. Show the RabbitMQ ScaledObject — highlight the RabbitMQ trigger
  4. Send 30 notifications via the BFF
  5. Watch worker pods scale up in the dashboard
  6. Show RabbitMQ Management UI — queue draining
  7. Workers scale back down to 0
- **Speaker notes:** "Notice the third panel in the dashboard — that 'Separate Deploy' badge shows this UI is loaded from a different deployment. I can open it in its own tab [show]. Now let's send notifications... and you can see the same scaling pattern — just a different queue technology."

#### Slide 29 — Patterns Recap
- **Key point:** Three demos, three scalers, three architectural patterns
- **Visual:** Three-column comparison
  - **Demo 1:** Kafka consumer lag → Scale consumers | Event streaming pattern
  - **Demo 2:** PostgreSQL pending rows → Scale workers | Job queue pattern
  - **Demo 3:** RabbitMQ queue depth → Scale workers | Micro-frontend + BFF pattern
- **Bullets:**
  - Same KEDA pattern: define a metric, set a threshold, scale on the cause
  - Different event sources, same operational model
  - Architecture patterns (micro-frontends, BFF) compose naturally with event-driven scaling
- **Speaker notes:** "Three demos, three different event sources, three different architectural patterns — but the KEDA pattern is always the same. Define a metric that represents demand, set a threshold, and let KEDA handle the rest. The architectural patterns — micro-frontends, BFF, event streaming — all compose naturally. The micro-frontend doesn't know or care about scaling. The BFF doesn't know about KEDA. Each concern is isolated."

---

### SECTION 8: OpenShift Production Best Practices (4 min)

#### Slide 30 — Custom Metrics Autoscaler Operator
- **Key point:** Installing KEDA on OpenShift
- **Bullets:**
  - Available in OperatorHub as "Custom Metrics Autoscaler"
  - Supported by Red Hat
  - Install operator → Create KedaController CR → Ready
  - Operator manages KEDA lifecycle, upgrades, monitoring
- **Visual:** Screenshot of OperatorHub showing the Custom Metrics Autoscaler tile
- **Speaker notes:** "On OpenShift, KEDA is available as a supported operator called Custom Metrics Autoscaler. Install it from OperatorHub, create a KedaController custom resource, and you're ready to go. Red Hat supports it as part of your OpenShift subscription."

#### Slide 31 — Security: TriggerAuthentication
- **Key point:** Securely connect KEDA to your event sources
- **Bullets:**
  - `TriggerAuthentication` — namespace-scoped secrets
  - `ClusterTriggerAuthentication` — cluster-wide shared credentials
  - Supports: Kubernetes Secrets, environment variables, HashiCorp Vault, Azure Key Vault
  - Never put credentials directly in ScaledObject metadata
- **Visual:** YAML example showing TriggerAuthentication referencing a Secret
- **Speaker notes:** "In production, you need to securely provide credentials to KEDA scalers. TriggerAuthentication lets you reference Kubernetes Secrets, and ClusterTriggerAuthentication works across namespaces. Never put credentials directly in your ScaledObject manifests."

#### Slide 32 — Observability
- **Key point:** Monitoring KEDA in production
- **Bullets:**
  - KEDA exposes Prometheus metrics out of the box
  - Key metrics:
    - `keda_scaler_metrics_value` — current metric value per scaler
    - `keda_scaled_object_errors` — scaler errors (connection issues, query failures)
    - `keda_scaler_active` — whether a scaler is active (1) or idle (0)
  - Build Grafana dashboards for visibility
  - Set alerts on scaler errors and sustained high metrics
- **Speaker notes:** "KEDA exports Prometheus metrics that you should be dashboarding and alerting on. The most important one is keda_scaler_metrics_value — this shows you the current value of each external metric KEDA is tracking. If you see scaler errors, it means KEDA can't reach your event source, and your scaling will stop working."

#### Slide 33 — Production Checklist
- **Key point:** Things to get right before going live
- **Bullets:**
  - ✅ Set `maxReplicaCount` — always have a safety cap
  - ✅ Tune `pollingInterval` — balance responsiveness vs load on event source
  - ✅ Set `cooldownPeriod` — prevent scale-down flapping (30-300s typical)
  - ✅ Configure `fallback` — what to do when scaler can't reach the event source
  - ✅ Set resource requests/limits on scaled workloads — cluster autoscaler needs this
  - ✅ Test scale-to-zero cold start — measure and decide if acceptable
  - ✅ Monitor KEDA metrics — alert on scaler errors
- **Speaker notes:** "Before you go to production, here's your checklist. The most common mistake I see is not setting maxReplicaCount — without it, a burst could create hundreds of replicas and destabilize your cluster. Cooldown tuning prevents your replicas from flapping up and down. And always configure the fallback behavior for when KEDA can't reach your event source."

---

### SECTION 9: Closing (3 min)

#### Slide 34 — The Shift
- **Key point:** Summary of the paradigm shift
- **Visual:** Before/After comparison
  - **Before:** CPU → HPA → Reactive → Waste during idle, slow during bursts
  - **After:** Queue depth → KEDA → Proactive → Zero waste, instant response
- **Speaker notes:** "Let's recap. We've seen how to move from reactive, CPU-based scaling to proactive, event-driven scaling. KEDA bridges the gap between your external event sources and the Kubernetes scaling machinery. The result: faster response to demand, zero waste during idle periods, and scaling that actually matches your workload's needs."

#### Slide 35 — Resources
- **Bullets:**
  - KEDA docs: keda.sh
  - OpenShift Custom Metrics Autoscaler docs
  - Demo code: [your GitHub repo URL]
  - KEDA scalers list: keda.sh/docs/scalers/
- **Visual:** QR code linking to the GitHub repo

#### Slide 36 — Q&A
- **Title:** Questions?
- **Visual:** Your contact info, social handles, QR code to repo

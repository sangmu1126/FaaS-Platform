# 🚀 High-Performance FaaS Platform (Cost-Optimized HA)

> **A Custom Serverless Engine engineered on AWS EC2 & Docker, designed to overcome Cold Start latency and provide enterprise-grade reliability at minimal cost.**

```mermaid
graph TD
    %% 🎨 Style Definitions
    classDef client fill:#333,stroke:#fff,stroke-width:2px,color:#fff
    classDef control fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#0d47a1
    classDef worker fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#1b5e20
    classDef aws fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#e65100
    classDef storage fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#4a148c
    classDef ai fill:#fce4ec,stroke:#c2185b,stroke-width:2px,color:#880e4f
    classDef monitor fill:#e0f7fa,stroke:#006064,stroke-width:2px,color:#006064
    classDef empty width:0px,height:0px,stroke:none,fill:none,color:none

    %% 🌐 External World
    User[User / Client]:::client -->|HTTPS POST /run| ALB(ALB / Elastic IP):::aws
    AINode[AI Node / Ollama]:::ai
    
    %% ☁️ AWS VPC Boundary
    subgraph "AWS VPC (Zero NAT Architecture)"
        direction TB
        
        %% 1. Shared Managed Services
        subgraph "Shared Services<br>(VPC Endpoints & Gateway)"
            direction TB
            SQS[AWS SQS - Job Queue]:::aws
            Redis_Global[(Redis Cluster)]:::storage
            S3[(AWS S3)]:::storage
            DDB[(DynamoDB)]:::storage
        end
        
        %% 2. Monitoring Stack
        subgraph "Observability Stack"
            direction TB
            Prom[Prometheus]:::monitor
            CW[CloudWatch]:::monitor
        end

        %% 3. Control Plane
        subgraph "Public Subnet<br>(Control Plane)"
            direction TB
            Space1[ ]:::empty
            
            Controller[Controller Service]:::control
            
            %% Internal Logic
            RateLimit{Rate Limiter}:::control
            Auth{Auth Guard}:::control
            
            Space1 ~~~ Controller
            Controller --> Auth
            Auth -->|x-api-key Valid| RateLimit
            RateLimit -->|Token Bucket| Redis_Global
        end

        %% 4. Compute Plane
        subgraph "Private Subnet<br>(Worker Plane - Isolated)"
            direction TB
            Space2[ ]:::empty
            
            Agent[Worker Agent]:::worker
            
            %% Worker Internals
            subgraph "Worker Instance<br>(t3.micro / Spot)"
                direction TB
                Space3[ ]:::empty
                
                WarmPool[Warm Pool]:::worker
                Container[User Container]:::worker
                MetricCol[Metric Collector<br>(Cgroup v2)]:::worker
                
                Space3 ~~~ Agent
            end
            
            Space2 ~~~ Agent
        end
    end
    
    %% Connections (Logic Flow)
    %% Inbound
    ALB -- Port 8080 --> Controller
    Controller --> Auth
    Auth --> RateLimit
    RateLimit -->|Check| Redis_Global
    
    %% Job Dispatch (Ingress 500x)
    RateLimit -->|Async Dispatch| SQS
    Controller -->|Upload Code| S3
    
    %% Worker Execution
    Agent -->|1. Long Polling| SQS
    Agent -->|2. Acquire O(1)| WarmPool
    Agent -->|Download| S3
    WarmPool -->|3. Security Pipe<br>(docker cp)| Container
    Container -->|Inference| AINode
    
    %% Observability Flow (120,000x Speedup)
    MetricCol -->|Direct Read| Agent
    Container -.->|Resource Usage| MetricCol
    
    %% Monitoring & Logging
    Agent -.->|Metrics| Prom
    Agent -.->|Logs (Snapshot)| CW
    Controller -.->|Metrics| Prom
    
    %% Reporting
    Agent -->|Exec Logs| DDB
    Agent -->|Heartbeat| Controller
    Container -->|Result| Redis_Global
    Redis_Global -->|Sub| Controller
    Controller -->|SSE Response| User
```

---

## 📖 Overview

This project is a **Production-Grade FaaS (Function as a Service) platform** built from scratch to address common limitations of public cloud FaaS offerings. It decouples the Control Plane (Controller) from the Compute Plane (Worker) to achieve **independent scalability** and **zero-downtime deployments**.

**Key Achievements:**
- **📉 -66% Cost Reduction**: optimized architecture by replacing expensive managed components (NAT GW, ALB) with custom application logic and VPC Endpoints.
- **⚡ Zero Cold Start**: Implemented a "Heavy Warm Pool" scheduler, reducing function wakeup latency by **95% (sub-100ms)**.
- **🚀 120,000x Faster Monitoring**: Bypassed Docker API overhead by directly parsing **Linux Cgroups** ([📄 View Benchmark: 15.5µs Avg](./tests/worker/benchmark_simple.py)), reducing metric collection latency to microseconds.
- **🛡️ Enterprise Reliability**: Features Self-healing Workers, Rate Limiting (Redis Lua), and Autonomic Scaling based on SQS backlogs.

---

## 📁 Directory Structure

> **Note:** Each component is developed in its own repository and synchronized here via `git subtree`. Check the upstream links for the latest updates.

| Directory | Description | Upstream Repository |
|-----------|-------------|---------------------|
| `Infra-terraform` | Infrastructure-as-Code (VPC, EC2, SQS, VPC Endpoints) | <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" width="16"/> [Infra-terraform](https://github.com/sangmu1126/Infra-terraform) |
| `Infra-controller` | Controller Service (Node.js API Gateway) | <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" width="16"/> [Infra-controller](https://github.com/sangmu1126/Infra-controller) |
| `Infra-worker` | Worker Agent (Python, Docker Warm Pool) | <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" width="16"/> [Infra-worker](https://github.com/sangmu1126/Infra-worker) |
| `Infra-AInode` | AI Node integration (Ollama SDK) | <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" width="16"/> [Infra-AInode](https://github.com/sangmu1126/Infra-AInode) |
| `Infra-packer` | Packer scripts for Worker AMI | <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" width="16"/> [Infra-packer](https://github.com/sangmu1126/Infra-packer) |
| `application` | Frontend (React) & Backend Gateway | <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" width="16"/> [FaaS-Application](https://github.com/sangmu1126/FaaS-Application) |
| `tests` | Load testing (K6), E2E scripts | *(local only)* |

---

## 🏗️ Architecture Design

### 🔹 Core Components
1.  **Controller Service (Node.js/Express)**
    - Acts as the **API Gateway** & **Control Plane**.
    - Handles Authentication, Traffic Management, and Job Dispatching.
    - **Scalability**: Auto Scaling Group (min=1) with **Elastic IP Self-Healing**.
    - **Security**: Rate Limiting via Redis (Token Bucket) & Trusted Proxy configuration.

2.  **Worker Service (Python/Docker)**
    - The **Compute Plane** executing user code in isolated Docker environments.
    - **Networking**: Deployed in **Private Subnets** (No Internet Access) for security.
    - **Connectivity**: Uses **VPC Endpoints** (S3, DynamoDB, SQS) to access AWS services without NAT Gateway.
    - **Health Check**: Implements "Heartbeat Push" pattern to eliminate Load Balancer dependency.

3.  **Event Bus & State**
    - **SQS (Simple Queue Service)**: Decouples components. Controller pushes jobs; Workers pull them (Long Polling).
    - **Redis (ElastiCache)**: Stores Hot State (Task Results, Rate Limits) and facilitates Pub/Sub for real-time response.

### 🔹 Cost-Optimized Strategy
| Component | Standard Approach | **Our Optimized Approach** | Savings |
|-----------|-------------------|----------------------------|---------|
| **NAT Gateway** | $32/mo | **VPC Endpoints** | **Saved $32/mo** |
| **Load Balancer** | $20/mo (ALB) | **Heartbeat Push Logic** | **Saved $20/mo** |
| **Recovery** | Manual/expensive | **ASG Self-Healing + Pre-baked AMI** | **Included** |
| **Total** | ~$68/mo | **~$23/mo** | **📉 66%** |

> **⚠️ Architectural Trade-offs**
> * **No Outbound Internet:** By removing NAT Gateway for cost savings, Worker nodes cannot access public APIs directly (Solved via `Proxy Service` for specific whitelisted domains).
> * **Cold Start vs Cost:** Keeping a "Warm Pool" consumes memory even when idle. We optimized this by using a dynamic pool size based on daily traffic patterns.

---

## 🛠 Tech Stack

### Infrastructure
-   **Cloud**: AWS (EC2, VPC, S3, DynamoDB, SQS, ElastiCache, CloudWatch)
-   **Observability**: Prometheus (Metrics), CloudWatch (Logs), Grafana (Visualization)
-   **IaC**: Terraform (Modularized state management)
-   **OS**: Amazon Linux 2 (Custom Pre-baked AMI)

### Backend
-   **Runtime**: Node.js (Controller), Python (Worker)
-   **Containerization**: Docker (Runtime Isolation)
-   **Cache**: Redis (Lua Scripting for high-concurrency atomic operations)

### Testing
-   **Load Testing**: K6 (Local & Cloud Distributed Testing)
-   **Unit/Integration**: Jest, PyTest

---

## 📊 Performance & Verification

### 1. Load Testing (K6)
Validated against **200 concurrent Virtual Users** (Simulating traffic spike) on a single `t3.small` instance.
-   **Throughput**: **520 Req/sec** verified (Peak throughput).
-   **Stability**: **241 Req/sec** sustained with 0% error rate.
-   **Bottleneck**: Test environment CPU contention (Controller + K6 on same node).
-   **Rate Limiter**: Effectively blocked excess traffic (`429 Too Many Requests`) in `<150ms`.

### 2. Auto Scaling Strategy
Used **Target Tracking Scaling** based on `BacklogPerInstance` metric.
> *"We don't just scale on queue length. We scale on 'Work per Worker'. Processing 100 fast tasks doesn't need new servers, but 5 heavy tasks might."*

### 3. Security Hardening
-   **Isolation**: No direct internet access for compute nodes.
-   **Input Validation**: Strict schema validation for function uploads.
-   **Resource Limits**: Kernel-level Cgroup limits (CPU/Memory) enforced on every container.

### 4. Observability & Monitoring
-   **Metrics Pipeline**: Worker Agent pushes real-time metrics (CPU/Memory/Duration) to **Prometheus**.
-   **Log Aggregation**: All distributed logs are centralized in **AWS CloudWatch Logs**.
-   **Self-Healing Feedback**: "Smart Auto-Tuner" analyzes usage data to optimize resource allocation dynamically.

---

## 🧠 Engineering Deep Dive

### 1. Warm Pool Architecture (Cold Start Optimization)
-   **Problem**: Lambda Cold Start (~3s latency).
-   **Solution**: Implemented **Pre-warmed Pool** & **Fast Allocator (O(1))** algorithm.
-   **Result**: Reduced init latency to **~120ms (Native) / ~200ms (Interpreted)**, achieving **96% performance improvement**.

### 2. Kernel-Level Observability
-   **Problem**: Docker API overhead caused high latency (~2s) for metrics.
-   **Solution**: Built a pipeline to **directly parse Cgroup v2** files (`/sys/fs/cgroup/...`), bypassing the Daemon.
-   **Result**: Metric collection speedup **120,000x** (1994ms → 0.0155ms).

### 3. Security Pipe (Isolation Strategy)
-   **Trade-off**: Bind Mount (Fast but insecure) vs Docker CP (Slow but secure).
-   **Decision**: Prioritized isolation. Implemented **`docker cp` based one-way transfer** and **Non-root execution** policy.
-   **Result**: Verified security integrity against container breakout attacks, trading 110ms I/O overhead for safety.

### 4. Concurrency Control (Race Conditions)
-   **Challenge**: `t3.micro` (2 vCPU) + 200 VU load caused container allocation race conditions.
-   **Solution**: Replaced heavy Redis Locks with **Python `threading.Lock`** for minimal overhead.
-   **Result**: Zero allocation errors under max load without CPU spikes.

### 5. Resilience (Zombie Reaper)
-   **Challenge**: Infinite loops in user code causing resource leaks.
-   **Solution**: Implemented **Reaper Pattern** (SIGTERM → 10s Wait → SIGKILL) to force-release resources.
-   **Result**: **0MB Memory Leak** confirmed under malicious code tests.

---

## 🚀 Getting Started

### Prerequisites
-   AWS CLI configured with appropriate credentials
-   Terraform v1.0+ installed
-   Node.js 18+ & Python 3.9+ environments
-   Docker installed (for local testing)

### 1. Clone & Configure
```bash
# Clone the repository
git clone https://github.com/sangmu1126/FaaS-Platform.git
cd FaaS-Platform

# Create environment file
cp .env.example .env
# Edit .env with your AWS settings (BUCKET_NAME, REDIS_HOST, etc.)
```

### 2. Deploy Infrastructure (Terraform)
```bash
cd Infra-terraform
terraform init
terraform plan          # Review changes
terraform apply -auto-approve
```

### 3. Running Tests
```bash
# Health Check
node tests/test_health_aws.js

# Load Test (Cloud)
k6 run -e K6_BASE_URL=http://[YOUR_ELASTIC_IP]:8080/api tests/load_test_k6_cloud.js
```

### 4. Access the Dashboard
After deployment, access the management dashboard at:
```
http://[YOUR_ELASTIC_IP]:3000
```

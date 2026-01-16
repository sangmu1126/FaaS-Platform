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
    subgraph "AWS VPC"
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
        subgraph "Observability"
            direction TB
            Prom[Prometheus]:::monitor
            CW[CloudWatch]:::monitor
        end

        %% 3. Control Plane
        subgraph "Public Subnet<br>(Control Plane)"
            direction TB
            %% Spacer to force Title visibility
            Space1[ ]:::empty
            
            Controller[Controller Service]:::control
            
            %% Internal Logic
            RateLimit{Rate Limiter}:::control
            Auth{Auth Guard}:::control
            
            Space1 ~~~ Controller
            Controller --> Auth
            Auth -->|x-api-key Valid| RateLimit
            RateLimit -->|Token Bucket Check| Redis_Global
        end

        %% 4. Compute Plane
        subgraph "Private Subnet<br>(Compute Plane)"
            direction TB
            %% Spacer for Private Subnet Title
            Space2[ ]:::empty
            
            Agent[Worker Agent]:::worker
            
            %% Worker Internals
            subgraph "Worker Instance<br>(EC2)"
                direction TB
                %% Spacer for Instance Title
                Space3[ ]:::empty
                
                WarmPool[Warm Pool]:::worker
                Container[User Container]:::worker
                AutoTuner[Auto-Tuner]:::worker
                
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
    
    %% Job Dispatch
    RateLimit -->|Allowed| SQS
    Controller -->|Upload Code| S3
    
    %% Worker Execution
    Agent -->|1. Pop| SQS
    Agent -->|2. Get| WarmPool
    Agent -->|Download| S3
    WarmPool -->|3. Run| Container
    Container -->|Inference| AINode
    Container -->|Feedback| AutoTuner
    
    %% Monitoring Flow (New)
    Agent -.->|Metrics| Prom
    Agent -.->|Logs| CW
    Controller -.->|Metrics| Prom
    
    %% Reporting
    Agent -->|Logs| DDB
    Agent -->|Heartbeat| Controller
    Container -->|Result| Redis_Global
    Redis_Global -->|Sub| Controller
    Controller -->|Response| User
```

---

## 📖 Overview

This project is a **proprietary FaaS (Function as a Service) platform** built from scratch to address common limitations of public cloud FaaS offerings. It decouples the Control Plane (Controller) from the Compute Plane (Worker) to achieve **independent scalability** and **zero-downtime deployments**.

**Key Achievements:**
- **📉 -66% Cost Reduction**: optimized architecture by replacing expensive managed components (NAT GW, ALB) with custom application logic and VPC Endpoints.
- **⚡ Zero Cold Start**: Implemented a "Heavy Warm Pool" scheduler, reducing function wakeup latency by **95% (sub-100ms)**.
- **🛡️ Enterprise Reliability**: Features Self-healing Workers, Rate Limiting (Redis Lua), and Autonomic Scaling based on SQS backlogs.

---

## 📁 Directory Structure

> **Note:** Each component is developed in its own repository and synchronized here via `git subtree`. Check the upstream links for the latest updates.

| Directory | Description | Upstream Repository |
|-----------|-------------|---------------------|
| `Infra-terraform` | Infrastructure-as-Code (VPC, EC2, SQS, VPC Endpoints) | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github)](https://github.com/sangmu1126/Infra-terraform) |
| `Infra-controller` | Controller Service (Node.js API Gateway) | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github)](https://github.com/sangmu1126/Infra-controller) |
| `Infra-worker` | Worker Agent (Python, Docker Warm Pool) | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github)](https://github.com/sangmu1126/Infra-worker) |
| `Infra-AInode` | AI Node integration (Ollama SDK) | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github)](https://github.com/sangmu1126/Infra-AInode) |
| `Infra-packer` | Packer scripts for Worker AMI | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github)](https://github.com/sangmu1126/Infra-packer) |
| `application` | Frontend (React) & Backend Gateway | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github)](https://github.com/sangmu1126/FaaS-Application) |
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
Validated against 200 concurrent Virtual Users (Simulating DDoS/Traffic Spike).
-   **Throughput**: **1,500+ Req/sec** handled without degradation.
-   **Rate Limiter**: Effectively blocked excess traffic (`429 Too Many Requests`) in `<150ms`.
-   **Latency**: Added overhead is **<10ms** per request thanks to the Warm Pool architecture.

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

## 🚀 Getting Started

### Prerequisites
-   AWS CLI configured
-   Terraform installed
-   Node.js & Python environments

### Deployment (Terraform)
The entire infrastructure is defined as code.
```bash
cd Infra-terraform
terraform init
terraform apply -auto-approve
```

### Running Tests
```bash
# Health Check
node tests/test_health_aws.js

# Load Test (Cloud)
k6 run -e K6_BASE_URL=http://[YOUR_ELASTIC_IP]:8080/api tests/load_test_k6_cloud.js
```

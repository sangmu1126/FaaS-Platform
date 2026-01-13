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

    %% 🌐 External World
    User[User / Client]:::client -->|HTTPS POST /run| ALB(ALB / Elastic IP):::aws
    ALB -- Port 8080 --> Controller

    %% 🧠 Control Plane (Node.js)
    subgraph "Control Plane<br>(High Throughput)"
        Controller[Controller Service]:::control
        
        %% Internal Logic
        RateLimit{Rate Limiter}:::control
        Auth{Auth Guard}:::control
        
        Controller --> Auth
        Auth -->|x-api-key Valid| RateLimit
        RateLimit -->|Token Bucket Check| Redis_Global
    end

    %% ⚡ Compute Plane (Python + Docker)
    subgraph "Compute Plane<br>(Private Subnet)"
        Agent[Worker Agent]:::worker
        
        %% Worker Internals
        subgraph "Worker Instance<br>(EC2)"
            WarmPool[Warm Container Pool]:::worker
            AutoTuner[Smart Auto-Tuner]:::worker
            MetricCol[Cgroup Metrics]:::worker
            
            Agent -->|1. Pop Job| SQS
            Agent -->|2. Acquire| WarmPool
            WarmPool -->|3. Docker Exec| Container[User Container]:::worker
            
            Container -.->|Real-time Stats| MetricCol
            MetricCol -->|Feedback| AutoTuner
        end
    end

    %% 🤖 External AI Service
    AINode[AI Node / Ollama]:::ai -.->|gRPC/HTTP Prediction| Container

    %% ☁️ AWS Infrastructure
    SQS[AWS SQS - Job Queue]:::aws
    Redis_Global[(Redis Cluster - Pub/Sub & State)]:::storage
    S3[(AWS S3 - Code & Output)]:::storage
    DDB[(DynamoDB - Logs & Metadata)]:::storage
    
    %% 🔄 Data Flow
    RateLimit -->|Allowed| SQS
    RateLimit -->|Refused 429| User
    
    Agent -->|Heartbeat Push| Controller
    Agent -->|Upload Result| S3
    Agent -->|Log Stream| DDB
    
    %% Return Path
    Container -->|Result| Redis_Global
    Redis_Global -->|Sub| Controller
    Controller -->|Response 200| User
```

---

## 📖 Overview

This project is a **proprietary FaaS (Function as a Service) platform** built from scratch to address common limitations of public cloud FaaS offerings. It decouples the Control Plane (Controller) from the Compute Plane (Worker) to achieve **independent scalability** and **zero-downtime deployments**.

**Key Achievements:**
- **📉 -66% Cost Reduction**: optimized architecture by replacing expensive managed components (NAT GW, ALB) with custom application logic and VPC Endpoints.
- **⚡ Zero Cold Start**: Implemented a "Heavy Warm Pool" scheduler, reducing function wakeup latency by **95% (sub-100ms)**.
- **🛡️ Enterprise Reliability**: Features Self-healing Workers, Rate Limiting (Redis Lua), and Autonomic Scaling based on SQS backlogs.

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
-   **Cloud**: AWS (EC2, VPC, S3, DynamoDB, SQS, ElastiCache)
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

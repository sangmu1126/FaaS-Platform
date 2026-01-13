# System Architecture

## 1. Architectural Style: Event-Driven Microservices (MSA)
This project adopts an **Event-Driven Microservices Architecture**, decoupling the control plane from the compute plane to ensure high availability and independent scalability.

### Core Microservices
1.  **Gateway & Controller Service** (Node.js)
    *   **Role**: API Entry point, Authentication, Traffic Management (Rate Limiting).
    *   **Scaling**: Horizontally scalable behind ALB (Application Load Balancer).
2.  **Worker Service** (Python)
    *   **Role**: Pure Compute Unit. Executes user code in isolated environments.
    *   **Scaling**: Event-Driven Auto Scaling (SQS Backlog).

### Architecture Diagram
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

## 2. Component Design
- **Controller (Infra-controller)**: Node.js/Express. Handles HTTP requests, authentication, and dispatches jobs to SQS.
- **Worker (Infra-worker)**: Python-based. Consumes messages from SQS, executes code (Python/Node/C++), and reports results to Redis.
- **AI Node (Infra-AInode)**: Mock AI inference engine.

## 3. Scalability & Resilience Strategy (Core Philosophy)
This section outlines our defense against "Over-provisioning" and "Cold Starts".

### 3.1. Scaling Policy: Target Tracking (Smarter than Simple Scaling)
Instead of simple Step Scaling (e.g., "Add 1 instance if SQS > 100"), we employ **Target Tracking Scaling**.

*   **Metric**: `BacklogPerInstance` (ApproximateNumberOfMessagesVisible / InServiceInstances)
*   **Target**: 5.0 (Targeting 5 pending jobs per worker)
*   **Defense Logic**: 
    > "Even if SQS has 100 messages, if they are micro-tasks (0.01s duration), the `BacklogPerInstance` metric drops rapidly as they are processed. The Auto Scaling Group (ASG) detects this drop and triggers a **Scale-In** event immediately, preventing over-provisioning. We prioritize throughput per cost over raw queue length."

### 3.2. Shared Resources (Safety)
- **Redis Shared Subscriber**: The Controller uses a single Redis connection for all response subscriptions (Pattern: Singleton/PubSub). This prevents connection leaks under high concurrency (verified v2.4).
- **Rate Limiting**: Lua-based atomic counters in Redis prevent granular DDOS attacks ($O(1)$ complexity).

## 4. Infrastructure (AWS)
- **Compute**: EC2 Auto Scaling Group (Launch Template with UserData).
- **Queue**: SQS Standard (Decoupling Control Plane from Data Plane).
- **Storage**: S3 (Code), DynamoDB (Metadata), Redis (Hot State).

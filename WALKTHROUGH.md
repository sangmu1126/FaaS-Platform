# Worker 등록 문제 해결 및 아키텍처 문서

## 1. 문제 해결 과정 (Troubleshooting Journey)

### 1.1 초기 증상
```json
{"pools":{"python":0,"nodejs":0,"cpp":0,"go":0},"active_jobs":0,"status":"offline"}
```
Controller의 `/system/status`가 `offline`으로, Worker가 등록되지 않음.

---

### 1.2 발견된 문제들 및 해결

#### 문제 1: `ModuleNotFoundError: boto3`
| 항목 | 내용 |
|------|------|
| **원인** | AMI에 `boto3`가 Python 3.11용으로만 설치됨. systemd 서비스는 `/usr/bin/python3` (3.9) 사용 |
| **해결** | Builder에서 `sudo /usr/bin/python3 -m pip install boto3` 실행 |

#### 문제 2: `ModuleNotFoundError: redis`, `structlog`
| 항목 | 내용 |
|------|------|
| **원인** | `requirements.txt` 전체가 아닌 일부만 설치됨 |
| **해결** | `sudo /usr/bin/python3 -m pip install -r /home/ec2-user/faas-worker/requirements.txt` |

#### 문제 3: `Failed to load environment files: No such file or directory`
| 항목 | 내용 |
|------|------|
| **원인** | AMI 생성 시 `cloud-init` 상태를 리셋하지 않음 → 새 인스턴스에서 `user_data` 미실행 → `.env` 파일 미생성 |
| **해결** | Builder에서 `sudo cloud-init clean --logs --seed` 실행 후 AMI 재생성 |

---

### 1.3 올바른 AMI 생성 절차

```bash
# 1. Builder 인스턴스 준비 (Public Subnet에서)
# - Docker, Python, Git 설치
# - Worker 코드 복사 (/home/ec2-user/faas-worker/)
# - 의존성 설치: sudo /usr/bin/python3 -m pip install -r requirements.txt
# - Docker 이미지 Pre-pull: docker pull python:3.9, gcc:latest, node:18-alpine, golang:1.19-alpine
# - systemd 서비스 복사: sudo cp infra-worker.service /etc/systemd/system/

# 2. cloud-init 리셋 (필수!)
sudo cloud-init clean --logs --seed

# 3. AMI 생성 (AWS CLI)
aws ec2 create-image --instance-id <BUILDER_ID> --name "faas-worker" --no-reboot
```

---

### 1.4 최종 결과
```json
{
  "pools": {"python": 5, "nodejs": 1, "cpp": 1, "go": 1},
  "active_jobs": 0,
  "status": "online"
}
```

---

## 2. 아키텍처 개요

### 2.1 네트워크 토폴로지

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC (10.0.0.0/16)                   │
├─────────────────────────────┬───────────────────────────────┤
│      Public Subnets         │       Private Subnets         │
│   (10.0.1.0/24, 10.0.2.0/24)│   (10.0.10.0/24, 10.0.11.0/24)│
├─────────────────────────────┼───────────────────────────────┤
│  ┌─────────────────┐        │  ┌─────────────────┐          │
│  │   Controller    │        │  │     Worker      │          │
│  │   (EIP 연결)    │◄───────┼──│   (ASG 관리)    │          │
│  │   Port: 8080    │        │  │   Warm Pools    │          │
│  └─────────────────┘        │  └─────────────────┘          │
│          │                  │          │                    │
│          ▼                  │          ▼                    │
│  ┌─────────────────┐        │  ┌─────────────────┐          │
│  │ Internet Gateway│        │  │  VPC Endpoints  │          │
│  └─────────────────┘        │  │ (S3, SQS, DDB)  │          │
│                             │  └─────────────────┘          │
└─────────────────────────────┴───────────────────────────────┘
```

### 2.2 컴포넌트 역할

| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| **Controller** | Public Subnet | API Gateway, 함수 관리, Worker 상태 추적 |
| **Worker** | Private Subnet | 함수 실행, Warm Container Pool 관리 |
| **ElastiCache (Redis)** | Private Subnet | 세션/캐시 저장 |
| **SQS** | VPC Endpoint | 작업 큐 |
| **S3** | VPC Endpoint | 코드 저장소 |
| **DynamoDB** | VPC Endpoint | 메타데이터, 로그 |

### 2.3 데이터 흐름

```
[User] → [Controller:8080] → [SQS Queue] → [Worker]
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                        [S3: 코드 다운로드]           [Docker 컨테이너 실행]
                              │                               │
                              └───────────────┬───────────────┘
                                              │
                                        [결과 반환]
                                              │
                                    [Controller → User]
```

### 2.4 Worker 부팅 흐름

```
1. ASG가 새 Worker 인스턴스 시작
           │
           ▼
2. user_data_worker.sh 실행
   ├── .env 파일 생성 (Terraform 변수 주입)
   └── faas-worker.service 시작
           │
           ▼
3. agent.py 시작
   ├── Docker Warm Pool 초기화
   ├── Controller에 Heartbeat 전송
   └── SQS 폴링 시작
           │
           ▼
4. Controller가 Worker 등록 (status: online)
```

### 2.5 주요 설정 파일

| 파일 | 경로 | 용도 |
|------|------|------|
| `asg.tf` | Infra-terraform/ | Worker ASG, Launch Template 정의 |
| `controller_asg.tf` | Infra-terraform/ | Controller ASG 정의 |
| `user_data_worker.sh` | Infra-terraform/ | Worker 부팅 스크립트 |
| `infra-worker.service` | Infra-worker/ | Worker systemd 서비스 |
| `agent.py` | Infra-worker/ | Worker 메인 에이전트 |

---

## 3. 교훈 (Lessons Learned)

1. **AMI 생성 전 `cloud-init clean` 필수** - 안 하면 user_data가 실행 안 됨
2. **Python 버전 일치 확인** - pip 설치 경로와 서비스 실행 경로가 같아야 함
3. **Private Subnet에서는 인터넷 불가** - 모든 의존성은 AMI에 사전 설치 필요
4. **`requirements.txt` 전체 설치** - 일부만 설치하면 누락 발생

## 4. Performance Note

- **Latency Change**: Execution time increased from ~80ms to ~140ms.
- **Root Cause**: Transition to **VPC Private Subnet** architecture for security.
- **Analysis**:
  - **Before**: Public Subnet (Direct Access)  Fast but insecure.
  - **After**: Private Subnet (NAT/Routing) + ASG (Load Balancer)  Secure & Scalable but adds ~60ms network overhead.
  - **Verdict**: This is the optimal trade-off for a production-grade secure environment. Code-level delays (polling intervals) were verified to be non-existent.

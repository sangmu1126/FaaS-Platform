# 📦 Infra-packer

Automated AMI creation for FaaS Worker nodes using **HashiCorp Packer**.

## 🛠 Prerequisites

- [Packer](https://www.packer.io/downloads) installed
- AWS Credentials configured (`aws configure`)

## 🚀 Usage

### 1. Initialize Packer
```bash
packer init .
```

### 2. Build AMI
```bash
packer build worker-ami.pkr.hcl
```

This will:
1. Launch a temporary EC2 instance
2. Run `setup-worker.sh` (Install Docker, Python, etc.)
3. Create an AMI (`faas-worker-YYYYMMDD-hhmmss`)
4. Terminate the temporary instance

## 🔗 Integration with Terraform

After building the AMI, **Terraform** will automatically pick up the newest `faas-worker-*` AMI during the next `apply`.

```hcl
# Infra-terraform/asg.tf runs this filter:
data "aws_ami" "worker_ami" {
  most_recent = true
  filter {
    name   = "name"
    values = ["faas-worker-*"]
  }
}
```

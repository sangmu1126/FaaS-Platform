packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.6"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

source "amazon-ebs" "worker" {
  ami_name      = "faas-worker-${formatdate("YYYYMMDD-hhmmss", timestamp())}"
  instance_type = var.instance_type
  region        = var.region
  
  # Use Amazon Linux 2023 or 2 (Matching current Worker OS)
  source_ami_filter {
    filters = {
      name                = "amzn2-ami-kernel-5.10-hvm-*-x86_64-gp2"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["amazon"]
  }
  
  ssh_username = "ec2-user"
  
  tags = {
    Name    = "faas-worker-packer"
    Builder = "Packer"
  }
}

build {
  sources = ["source.amazon-ebs.worker"]

  # Upload script
  provisioner "file" {
    source      = "setup-worker.sh"
    destination = "/tmp/setup-worker.sh"
  }

  # Execute setup
  provisioner "shell" {
    inline = [
      "chmod +x /tmp/setup-worker.sh",
      "sudo /tmp/setup-worker.sh"
    ]
  }
}

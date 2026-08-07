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

source "amazon-ebs" "controller" {
  ami_name      = "faas-controller-${formatdate("YYYYMMDD-hhmmss", timestamp())}"
  instance_type = var.instance_type
  region        = var.region

  source_ami_filter {
    filters = {
      name                = "al2023-ami-2023.*-x86_64"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["137112412989"]
  }

  ssh_username = "ec2-user"

  launch_block_device_mappings {
    device_name           = "/dev/xvda"
    volume_size           = 8
    volume_type           = "gp3"
    delete_on_termination = true
  }

  tags = {
    Name    = "faas-controller-packer"
    Builder = "Packer"
  }
}

build {
  sources = ["source.amazon-ebs.controller"]

  provisioner "file" {
    source      = "setup-controller.sh"
    destination = "/tmp/setup-controller.sh"
  }

  provisioner "file" {
    source      = "../Infra-controller"
    destination = "/tmp"
  }

  provisioner "shell" {
    inline = [
      "chmod +x /tmp/setup-controller.sh",
      "sudo /tmp/setup-controller.sh"
    ]
  }
}

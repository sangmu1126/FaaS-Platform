output "controller_public_ip" {
  value = aws_instance.controller.public_ip
}

output "worker_public_ip" {
  value = aws_instance.worker.public_ip
}

output "ssh_connection_string_controller" {
  value = "ssh -i faas-key.pem ec2-user@${aws_instance.controller.public_ip}"
}

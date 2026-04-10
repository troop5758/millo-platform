output "vpc_id" {
  value       = try(module.vpc.vpc_id, "N/A")
  description = "VPC ID"
}

output "s3_bucket" {
  value       = aws_s3_bucket.millo_assets.id
  description = "S3 bucket for assets"
}

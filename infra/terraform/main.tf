# Millo — AWS base infrastructure (Terraform)
# VPC, EKS, S3, ALB. Domain: milloapp.com
# Run: terraform init && terraform plan

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# VPC
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "millo-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = false
  enable_dns_hostnames = true
}

# S3 bucket for CDN assets, recordings, VOD
resource "aws_s3_bucket" "millo_assets" {
  bucket = "millo-assets-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "millo-assets"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "millo_assets" {
  bucket = aws_s3_bucket.millo_assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "millo_assets" {
  bucket = aws_s3_bucket.millo_assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_caller_identity" "current" {}

variable "aws_region" {
  default = "us-east-1"
}

variable "environment" {
  default = "production"
}

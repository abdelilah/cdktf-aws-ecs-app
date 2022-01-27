# AWS ECS App

This architecture provides an easy way to deploy scalable apps using AWS Elastic Container Service.

## Highlights

- Customizable via `config.ts`
- Can use default VPC or creates a dedicated one
- Codepipeline automatically pushes new docker images from ECR to ECS
- Blue/Green ECS deployment
- Auto Scaling on ECS
- Optional Serverless Aurora Database
- Database password is stored in SSM parameter store and passed as environment variable to ECS
- EFS Disk is included in case files need to be shared across instances (e.g. WordPress sites)
- Folders can be be deployed automatically to EFS by uploading Zip files into S3 bucket
- Slack notifications
- Backup plan for EFS files into a separate region

## Pre Requisites

1. [Terraform CLI](https://learn.hashicorp.com/tutorials/terraform/install-cli)
2. [NodeJS >= 16](https://nodejs.org/)
3. CDKTF CLI: `npm install -g cdktf-cli`
4. AWS CLI

## Install Dependencies

```shell
npm install
npm run get
```

## Configure AWS CLI

```shell
aws configure
```

## Deploy

```shell
npm run deploy
```

## Destroy

```shell
npm run destroy
```

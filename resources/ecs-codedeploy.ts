import { Fn } from 'cdktf';
import { File } from '../.gen/providers/archive';
import { IamPolicyAttachment, IamRole } from '../.gen/providers/aws/iam';
import { S3Bucket, S3BucketObject } from '../.gen/providers/aws/s3';
import {
	CodedeployApp,
	CodedeployDeploymentGroup,
} from '../.gen/providers/aws/codedeploy';

import prefixName from '../lib/prefix-name';
import config from '../config';
import AppStack from '../app-stack';

export default class AppECSCodeDeploy {
	role: IamRole;
	s3ArtifactStore: S3Bucket;
	codeDeployApp: CodedeployApp;
	deploymentGroup: CodedeployDeploymentGroup;
	artifactStoreDefsObject: S3BucketObject;

	constructor(stack: AppStack) {
		const ecs = stack.ecsCluster;
		const ecrRepo = stack.dockerRegistry.ecr;
		const loadBalancer = stack.loadBalancer;

		this.s3ArtifactStore = new S3Bucket(stack, 'ecs-artifact-store', {
			bucket: prefixName('ecs-artifact-store'),
			versioning: {
				enabled: true,
			},
			forceDestroy: true,
		});

		this.role = new IamRole(stack, 'ecs-codedeploy-iam-role', {
			name: prefixName(`ecsCodedeployIAMRole`),
			assumeRolePolicy: `{
					"Version": "2012-10-17",
					"Statement": [
						{
							"Effect": "Allow",
							"Principal": {
								"Service": "codedeploy.amazonaws.com"
							},
							"Action": "sts:AssumeRole"
						}
					]
				}`,
		});

		new IamPolicyAttachment(stack, 'ecs-codedeploy-iam-policy', {
			name: prefixName('ecs-codedeploy-iam-role-attachement'),
			roles: [this.role.name],
			policyArn: 'arn:aws:iam::aws:policy/AWSCodeDeployRoleForECS',
		});

		const ecsTaskJSON = {
			taskDefinitionArn: ecs.taskDefinition.arn,
			containerDefinitions: Fn.jsondecode(
				ecs.taskDefinition.containerDefinitions,
			),
			family: ecs.taskDefinition.family,
			taskRoleArn: ecs.taskDefinition.taskRoleArn,
			executionRoleArn: ecs.taskDefinition.executionRoleArn,
			networkMode: ecs.taskDefinition.networkMode,
			revision: ecs.taskDefinition.revision,
			volumes: ecs.taskDefinition.volume,
			requiresCompatibilities: ecs.taskDefinition.requiresCompatibilities,
			cpu: ecs.taskDefinition.cpu,
			memory: ecs.taskDefinition.memory,
		};

		const defsZipFile = new File(stack, 'ecs-defs-zip', {
			type: 'zip',
			outputPath: 'defs.zip',
			source: [
				{
					filename: 'imagedefinitions.json',
					content: `[
                        {
                            "name": "${ecs.service.name}",
                            "imageUri": "${ecrRepo.repositoryUrl}:latest"
                        }
                    ]`,
				},
				{
					filename: 'taskdef.json',
					content: Fn.jsonencode(ecsTaskJSON),
				},
				{
					filename: 'appspec.yml',
					content: `version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "${ecs.taskDefinition.arn}"
        LoadBalancerInfo:
          ContainerName: "${prefixName('app')}"
          ContainerPort: ${config.container.port}
        PlatformVersion: "LATEST"`,
				},
			],
		});

		this.artifactStoreDefsObject = new S3BucketObject(
			stack,
			'ecs-artifact-store-key',
			{
				bucket: this.s3ArtifactStore.bucket,
				key: 'ecs-defs.zip',
				source: defsZipFile.outputPath,
			},
		);

		this.codeDeployApp = new CodedeployApp(stack, 'ecs-codedeploy-app', {
			name: prefixName('ecs-codedeploy-app'),
			computePlatform: 'ECS',
		});

		this.deploymentGroup = new CodedeployDeploymentGroup(
			stack,
			'ecs-codedeploy-group',
			{
				appName: this.codeDeployApp.name,
				serviceRoleArn: this.role.arn,
				deploymentGroupName: 'ecs-codedeploy-group',
				deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
				dependsOn: [this.role],
				autoRollbackConfiguration: {
					enabled: true,
					events: ['DEPLOYMENT_FAILURE'],
				},
				blueGreenDeploymentConfig: {
					deploymentReadyOption: {
						actionOnTimeout: 'CONTINUE_DEPLOYMENT',
					},
					terminateBlueInstancesOnDeploymentSuccess: {
						action: 'TERMINATE',
						terminationWaitTimeInMinutes: 5,
					},
				},
				deploymentStyle: {
					deploymentOption: 'WITH_TRAFFIC_CONTROL',
					deploymentType: 'BLUE_GREEN',
				},
				ecsService: {
					clusterName: ecs.cluster.name,
					serviceName: ecs.service.name,
				},
				loadBalancerInfo: {
					targetGroupPairInfo: {
						prodTrafficRoute: {
							listenerArns: [loadBalancer.listener.arn],
						},
						targetGroup: [
							{
								name: loadBalancer.targetGroupGreen.name,
							},
							{
								name: loadBalancer.targetGroupBlue.name,
							},
						],
					},
				},
			},
		);
	}
}

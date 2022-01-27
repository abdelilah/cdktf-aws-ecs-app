import { IamRole, IamRolePolicy } from '../.gen/providers/aws/iam';
import { Codepipeline } from '../.gen/providers/aws/codepipeline';
import {
	CloudwatchEventRule,
	CloudwatchEventTarget,
} from '../.gen/providers/aws/eventbridge';
import prefixName from '../lib/prefix-name';
import AppStack from '../app-stack';

export default class AppECSCodePipeline {
	role: IamRole;
	pipeline: Codepipeline;

	constructor(stack: AppStack) {
		const appCodeDeploy = stack.ecsCodeDeploy;
		const dockerRegistry = stack.dockerRegistry;

		this.role = new IamRole(stack, 'ecs-codepipeline-iam-role', {
			name: prefixName('ecsCodepipelineIAMRole'),
			assumeRolePolicy: `{
	            "Version": "2012-10-17",
	            "Statement": [
	                {
	                    "Effect": "Allow",
	                    "Principal": {
	                        "Service": "codepipeline.amazonaws.com"
	                    },
	                    "Action": "sts:AssumeRole"
	                }
	            ]
	        }`,
		});

		new IamRolePolicy(stack, 'ecs-codepipeline-iam-policy', {
			role: this.role.name,
			policy: `{
	        "Version": "2012-10-17",
	        "Statement": [
                {
	                "Effect": "Allow",
	                "Action": [
	                    "codedeploy:GetApplication",
                        "codedeploy:GetApplicationRevision",
                        "codedeploy:CreateDeployment",
                        "codedeploy:GetDeployment",
                        "codedeploy:RegisterApplicationRevision"
	                ],
	                "Resource": [
	                    "${appCodeDeploy.codeDeployApp.arn}",
                        "${appCodeDeploy.deploymentGroup.arn}"
	                ]
	            },
                {
	                "Effect": "Allow",
	                "Action": [
                        "codedeploy:GetDeploymentConfig"
	                ],
	                "Resource": [
	                    "*"
	                ]
	            },
                {
	                "Effect": "Allow",
	                "Action": [
	                    "ecs:*"
	                ],
	                "Resource": [
	                    "*"
	                ]
	            },
                {
	                "Effect": "Allow",
	                "Action": [
	                    "*"
	                ],
	                "Resource": [
                        "${appCodeDeploy.s3ArtifactStore.arn}",
	                    "${appCodeDeploy.s3ArtifactStore.arn}/*"
	                ]
	            },
                {
	                "Effect": "Allow",
	                "Action": [
                        "ecr:DescribeImages",
	                    "ecr:GetAuthorizationToken",
                        "ecr:BatchCheckLayerAvailability",
                        "ecr:GetDownloadUrlForLayer",
                        "ecr:BatchGetImage"
	                ],
	                "Resource": [
	                    "${dockerRegistry.ecr.arn}"
	                ]
	            },
	            {
	                "Effect": "Allow",
	                "Action": "iam:PassRole",
	                "Resource": "*"
	            }
	        ]
	    }`,
		});

		this.pipeline = new Codepipeline(stack, 'ecs-pipeline', {
			name: prefixName('ecsPipeline'),
			roleArn: this.role.arn,
			artifactStore: [
				{
					type: 'S3',
					location: appCodeDeploy.s3ArtifactStore.bucket,
				},
			],
			stage: [
				{
					name: 'Source',
					action: [
						{
							name: 'SourceECR',
							version: '1',
							category: 'Source',
							owner: 'AWS',
							provider: 'ECR',
							outputArtifacts: ['SourceArtifact'],
							configuration: {
								RepositoryName: dockerRegistry.ecr.name,
								ImageTag: 'latest',
							},
							runOrder: 1,
						},
						{
							name: 'SourceS3',
							version: '1',
							category: 'Source',
							owner: 'AWS',
							provider: 'S3',
							outputArtifacts: ['ECSSourceArtifact'],
							configuration: {
								S3Bucket: appCodeDeploy.artifactStoreDefsObject.bucket,
								S3ObjectKey: appCodeDeploy.artifactStoreDefsObject.key,
							},
							runOrder: 1,
						},
					],
				},
				{
					name: 'DeployToECS',
					action: [
						{
							name: 'DeployToECS',
							version: '1',
							category: 'Deploy',
							owner: 'AWS',
							provider: 'CodeDeployToECS',
							inputArtifacts: ['ECSSourceArtifact'],
							configuration: {
								ApplicationName: appCodeDeploy.codeDeployApp.name,
								DeploymentGroupName:
									appCodeDeploy.deploymentGroup.deploymentGroupName,
								TaskDefinitionTemplateArtifact: 'ECSSourceArtifact',
								AppSpecTemplateArtifact: 'ECSSourceArtifact',
							},
						},
					],
				},
			],
		});

		// Trigger pipeline when ECR is updated
		const cwPipelineEventRole = new IamRole(
			stack,
			'ecs-cw-pipeline-event-role',
			{
				name: prefixName('appCWPipelineEventRole'),
				path: '/service-role/',
				assumeRolePolicy: `{
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {
                            "Service": "events.amazonaws.com"
                        },
                        "Action": "sts:AssumeRole"
                    }
                ]
            }`,
			},
		);

		new IamRolePolicy(stack, 'ecs-cw-pipeline-event-role-policy', {
			name: prefixName('appCWPipelineEventRolePolicy'),
			role: cwPipelineEventRole.name,
			policy: `{
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Action": [
                            "codepipeline:StartPipelineExecution"
                        ],
                        "Resource": ["${this.pipeline.arn}"],
                        "Effect": "Allow"
                    }
                ]
            }`,
		});

		const cwPipelineRule = new CloudwatchEventRule(
			stack,
			'ecs-ecr-update-rule',
			{
				name: prefixName('appECRUpdateRule'),
				description: 'Trigger pipeline when ECR is updated',
				eventPattern: `{
                    "source": ["aws.ecr"],
                    "detail": {
                      "action-type": ["PUSH"],
                      "image-tag": ["latest"],
                      "repository-name": ["${dockerRegistry.ecr.name}"],
                      "result": ["SUCCESS"]
                    },
                    "detail-type": ["ECR Image Action"]
                  }`,
			},
		);

		new CloudwatchEventTarget(stack, 'ecs-cw-pipeline-target', {
			rule: cwPipelineRule.name,
			arn: this.pipeline.arn,
			roleArn: cwPipelineEventRole.arn,
		});
	}
}

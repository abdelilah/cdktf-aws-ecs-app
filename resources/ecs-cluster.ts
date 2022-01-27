import { CloudwatchLogGroup } from '../.gen/providers/aws/cloudwatch';
import {
	EcsCluster,
	EcsService,
	EcsTaskDefinition,
} from '../.gen/providers/aws/ecs';
import {
	IamRole,
	IamPolicyAttachment,
	IamRolePolicy,
} from '../.gen/providers/aws/iam';
import { SecurityGroup } from '../.gen/providers/aws/vpc';
import {
	AppautoscalingPolicy,
	AppautoscalingTarget,
} from '../.gen/providers/aws/appautoscaling';
import config from '../config';
import prefixName from '../lib/prefix-name';
import AppStack from '../app-stack';

export default class AppECSCluster {
	taskExecutionRole: IamRole;
	securityGroup: SecurityGroup;
	cluster: EcsCluster;
	logGroup: CloudwatchLogGroup;
	taskDefinition: EcsTaskDefinition;
	service: EcsService;
	scalingTarget: AppautoscalingTarget;

	constructor(stack: AppStack) {
		this.logGroup = new CloudwatchLogGroup(stack, 'log-group', {
			name: prefixName('ecs-cluster'),
			retentionInDays: 30,
		});

		this.taskExecutionRole = new IamRole(stack, 'ecs-task-execution-role', {
			name: prefixName(`ecsTaskExecutionRole`),
			assumeRolePolicy: `{
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Principal": {
                                "Service": "ecs-tasks.amazonaws.com"
                            },
                            "Action": "sts:AssumeRole"
                        }
                    ]
                }`,
		});

		if (stack.db) {
			new IamRolePolicy(stack, 'ecs-task-execution-role-policy', {
				role: this.taskExecutionRole.name,
				policy: `{
					"Version": "2012-10-17",
					"Statement": [
					  {
						"Effect": "Allow",
						"Action": [
						  "ssm:GetParameters"
						],
						"Resource": [
						  "${stack.db.ssmDbHost.arn}",
						  "${stack.db.ssmDbUser.arn}",
						  "${stack.db.ssmDbPassword.arn}",
						  "${stack.db.ssmDbName.arn}"
						]
					  }
					]
				}`,
			});
		}

		new IamPolicyAttachment(stack, 'ecs-task-execution-policy-attachment', {
			name: prefixName('ecsTaskExecutionPolicyAttachment'),
			policyArn:
				'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
			roles: [this.taskExecutionRole.name],
		});

		this.securityGroup = new SecurityGroup(stack, 'ecs-sg', {
			name: prefixName('ecs-sg'),
			vpcId: stack.vpc.vpc.id,
			ingress: [
				{
					protocol: '-1',
					fromPort: 0,
					toPort: 0,
					securityGroups: [stack.loadBalancer.securityGroup.id],
				},
			],
			egress: [
				{
					protocol: '-1',
					fromPort: 0,
					toPort: 0,
					cidrBlocks: ['0.0.0.0/0'],
				},
			],
		});

		this.cluster = new EcsCluster(stack, 'ecs-cluster', {
			name: prefixName('ecs-cluster'),
			dependsOn: [this.taskExecutionRole, this.securityGroup],
			defaultCapacityProviderStrategy: [
				{
					capacityProvider: 'FARGATE_SPOT',
					weight: 1,
				},
			],
			capacityProviders: ['FARGATE_SPOT', 'FARGATE'],
			configuration: {
				executeCommandConfiguration: {
					logging: 'OVERRIDE',
					logConfiguration: {
						cloudWatchLogGroupName: this.logGroup.name,
					},
				},
			},
			setting: [
				{
					name: 'containerInsights',
					value: 'disabled',
				},
			],
		});

		const ecsTaskEnv = config.container.environment || [];

		// Add database access variables
		this.taskDefinition = new EcsTaskDefinition(stack, 'ecs-task', {
			family: prefixName('app'),
			taskRoleArn: this.taskExecutionRole.arn,
			executionRoleArn: this.taskExecutionRole.arn,
			dependsOn: [this.taskExecutionRole],
			requiresCompatibilities: ['FARGATE'],
			cpu: `${config.container.cpu}`,
			memory: `${config.container.memory}`,
			networkMode: 'awsvpc',
			containerDefinitions: JSON.stringify([
				{
					name: prefixName('app'),
					image: stack.dockerRegistry.ecr.repositoryUrl,
					essential: true,
					cpu: config.container.cpu,
					memory: config.container.memory,
					environment: ecsTaskEnv,
					secrets: stack.db
						? [
								{
									name: 'DB_HOST',
									valueFrom: stack.db.ssmDbHost.arn,
								},
								{
									name: 'DB_USER',
									valueFrom: stack.db.ssmDbUser.arn,
								},
								{
									name: 'DB_PASSWORD',
									valueFrom: stack.db.ssmDbPassword.arn,
								},
								{
									name: 'DB_NAME',
									valueFrom: stack.db.ssmDbName.arn,
								},
						  ]
						: [],
					portMappings: [
						{
							containerPort: config.container.port,
							protocol: 'tcp',
						},
					],
					mountPoints: config.container.mountPoints || [],
					linuxParameters: {
						initProcessEnabled: true,
					},
					logConfiguration: {
						logDriver: 'awslogs',
						options: {
							'awslogs-group': this.logGroup.name,
							'awslogs-region': config.region,
							'awslogs-stream-prefix': 'container-stdout',
						},
					},
				},
			]),
			volume: [
				{
					name: 'efs-vol',
					efsVolumeConfiguration: {
						fileSystemId: stack.efsData.fileSystem.id,
						rootDirectory: '/',
					},
				},
			],
		});

		this.service = new EcsService(stack, 'ecs-service', {
			name: prefixName('app'),
			cluster: this.cluster.id,
			taskDefinition: this.taskDefinition.arn,
			desiredCount: 1,
			lifecycle: {
				ignoreChanges: ['desired_count'],
			},
			networkConfiguration: {
				securityGroups: [this.securityGroup.id],
				assignPublicIp: true,
				subnets: stack.vpc.getSubnetsIDs(),
			},
			schedulingStrategy: 'REPLICA',
			deploymentController: {
				type: 'CODE_DEPLOY',
			},
			loadBalancer: [
				{
					targetGroupArn: stack.loadBalancer.targetGroupGreen.arn,
					containerName: prefixName('app'),
					containerPort: config.container.port,
				},
			],
			capacityProviderStrategy: [
				{
					capacityProvider: 'FARGATE_SPOT',
					weight: 1,
				},
				{
					capacityProvider: 'FARGATE',
					weight: 0,
				},
			],
			deploymentMinimumHealthyPercent: 100,
			enableExecuteCommand: true,
			dependsOn: [
				this.taskExecutionRole,
				stack.loadBalancer.alb,
				stack.efsData.fileSystem,
			],
		});

		// Auto Scaling
		this.scalingTarget = new AppautoscalingTarget(
			stack,
			'ecs-autoscaling-target',
			{
				serviceNamespace: 'ecs',
				resourceId: `service/${this.cluster.name}/${this.service.name}`,
				scalableDimension: 'ecs:service:DesiredCount',
				minCapacity: config.autoScaling.min,
				maxCapacity: config.autoScaling.max,
			},
		);

		new AppautoscalingPolicy(stack, 'ecs-autoscaling-policy', {
			name: prefixName('scaling'),
			policyType: 'TargetTrackingScaling',
			serviceNamespace: this.scalingTarget.serviceNamespace,
			resourceId: this.scalingTarget.resourceId,
			scalableDimension: this.scalingTarget.scalableDimension,
			targetTrackingScalingPolicyConfiguration: {
				targetValue: config.autoScaling.cpuTarget,
				scaleInCooldown: config.autoScaling.scaleInCooldown,
				scaleOutCooldown: config.autoScaling.scaleOutCooldown,
				predefinedMetricSpecification: {
					predefinedMetricType: 'ECSServiceAverageCPUUtilization',
				},
			},
		});
	}
}

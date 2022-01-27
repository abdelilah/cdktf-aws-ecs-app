import { Construct } from 'constructs';
import { App, TerraformStack } from 'cdktf';
import { AwsProvider } from './.gen/providers/aws';
import { ArchiveProvider } from './.gen/providers/archive';

import AppLoadBalancer from './resources/load-balancer';
import AppEFS from './resources/efs';
import AppECSCluster from './resources/ecs-cluster';
import AppECSCodeDeploy from './resources/ecs-codedeploy';
import AppDockerRegistry from './resources/docker-registry';
import AppECSCodePipeline from './resources/ecs-codepipeline';
import AppDB from './resources/db';
import AppVPC from './resources/vpc';
import AppBackup from './resources/backup';
import AppNotifications from './resources/notifications';
import S3ToEFS from './resources/s3-to-efs';

import config from './config';

class AppStack extends TerraformStack {
	vpc: AppVPC;
	dockerRegistry: AppDockerRegistry;
	loadBalancer: AppLoadBalancer;
	efsData: AppEFS;
	ecsCluster: AppECSCluster;
	ecsCodeDeploy: AppECSCodeDeploy;
	ecsCodePipeline: AppECSCodePipeline;
	db?: AppDB;
	backup?: AppBackup;
	notifications: AppNotifications;
	s3ToEFS: S3ToEFS;

	constructor(scope: Construct) {
		super(scope, config.appName);

		// Providers setup
		const { region } = config;

		new AwsProvider(this, 'aws', {
			region,
			defaultTags: {
				tags: {
					app: config.appName,
				},
			},
		});

		new ArchiveProvider(this, 'archive', {});

		// VPC
		this.vpc = new AppVPC(this);

		// Database
		if (config.db.createDatabase === true) {
			this.db = new AppDB(this);
		}

		// ECR Repository
		this.dockerRegistry = new AppDockerRegistry(this);

		// Application Load Banancer
		this.loadBalancer = new AppLoadBalancer(this);

		// EFS File system
		this.efsData = new AppEFS(this, 'data');

		this.s3ToEFS = new S3ToEFS(this);

		// ECS Cluster
		this.ecsCluster = new AppECSCluster(this);

		// Allow s3ToEFS lambda and ECS to access the EFS volume
		this.efsData.securityGroup.ingress = [
			{
				protocol: 'tcp',
				fromPort: 2049,
				toPort: 2049,
				securityGroups: [
					this.s3ToEFS.securityGroup.id,
					this.ecsCluster.securityGroup.id,
				],
			},
		];

		// Code Deploy
		this.ecsCodeDeploy = new AppECSCodeDeploy(this);

		// Code Pipeline
		this.ecsCodePipeline = new AppECSCodePipeline(this);

		// Allow DB access from ECS
		if (config.db.createDatabase === true) {
			this.db!.securityGroup.ingress = [
				{
					protocol: 'tcp',
					fromPort: 3306,
					toPort: 3306,
					securityGroups: [this.ecsCluster.securityGroup.id],
				},
			];
		}

		if (config.backup.enabled === true) {
			this.backup = new AppBackup(this);
		}

		this.notifications = new AppNotifications(this);
	}
}

export const createAppStack = () => {
	const app = new App();
	const stack = new AppStack(app);
	return { app, stack };
};

export default AppStack;

import { AlbTargetGroupHealthCheck } from './.gen/providers/aws/elb';
import { RdsClusterConfig } from './.gen/providers/aws/rds';

export default {
	appName: 'app-name',
	region: 'us-east-1',
	createVPC: false,
	autoScaling: {
		min: 1,
		max: 5,
		cpuTarget: 65,
		scaleInCooldown: 30,
		scaleOutCooldown: 30,
	},
	loadBalancer: {
		port: 80,
		healthCheck: {
			path: '/alb-status',
			interval: 30,
			protocol: 'HTTP',
			timeout: 5,
			unhealthyThreshold: 2,
			healthyThreshold: 3,
		} as AlbTargetGroupHealthCheck,
	},
	container: {
		port: 80,
		cpu: 256,
		memory: 512,
		environment: [
			{
				name: 'FOO',
				value: 'bar',
			},
		],
		mountPoints: [
			{
				sourceVolume: 'efs-vol',
				containerPath: '/var/www',
			},
		],
	},
	db: {
		createDatabase: true,
		config: {
			masterUsername: process.env.DB_USERNAME,
			masterPassword: process.env.DB_PASSWORD,
			skipFinalSnapshot: true, // !!! Must be set to false in prod to avoid data loss !!!
			databaseName: process.env.DB_NAME,
		} as RdsClusterConfig,
	},
	backup: {
		enabled: false,
		secondaryRegion: 'us-west-1',
	},
	notifications: {
		slack: {
			webhookURL:
				'https://hooks.slack.com/services/XXXXXXXXX/XXXXXXXXXX/XXXXXXXXXXXXXXXXXXXXXXXX',
			channel: '#app-name',
			username: 'AWS',
			icon_emoji: ':fire:',
		},
		events: {
			CodePipeline: `{
                "source": ["aws.codepipeline"],
                "detail-type": ["CodePipeline Pipeline Execution State Change"],
                "detail": {
                    "state": ["STARTED", "SUCCEEDED", "FAILED", "CANCELED"]
                }
            }`,
			CodeDeploy: `{
                "source": ["aws.codedeploy"],
                "detail-type": ["CodeDeploy Deployment State-change Notification"],
                "detail": {
                    "state": ["START", "STOP", "FAILURE", "SUCCESS"]
                }
            }`,
		},
	},
};

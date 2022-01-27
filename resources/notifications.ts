import { SnsTopic, SnsTopicSubscription } from '../.gen/providers/aws/sns';
import {
	LambdaFunction,
	LambdaPermission,
} from '../.gen/providers/aws/lambdafunction';
import { File } from '../.gen/providers/archive';
import { IamRole, IamPolicyAttachment } from '../.gen/providers/aws/iam';
import {
	CloudwatchEventRule,
	CloudwatchEventTarget,
} from '../.gen/providers/aws/eventbridge';

import AppStack from '../app-stack';
import prefixName from '../lib/prefix-name';
import config from '../config';

export default class AppNotifications {
	role: IamRole;
	topic: SnsTopic;
	lambdaFunction: LambdaFunction;

	constructor(stack: AppStack) {
		this.role = new IamRole(stack, 'slack-notifications-role', {
			name: prefixName(`slack-notifications-role`),
			assumeRolePolicy: `{
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Principal": {
                                "Service": "lambda.amazonaws.com"
                            },
                            "Action": "sts:AssumeRole"
                        }
                    ]
                }`,
		});

		new IamPolicyAttachment(stack, 'slack-notifications-policy', {
			name: prefixName(`slack-notifications-policy`),
			roles: [this.role.name],
			policyArn:
				'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
		});

		const lambdaArchive = new File(stack, 'slack-notification-lambda-file', {
			type: 'zip',
			outputPath: 'slackNotification.zip',
			sourceDir: `${process.cwd()}/assets/lambda/slack`,
		});

		this.lambdaFunction = new LambdaFunction(
			stack,
			'slack-notification-lambda-function',
			{
				filename: lambdaArchive.outputPath,
				handler: 'index.handler',
				functionName: prefixName('SlackNotification'),
				runtime: 'nodejs12.x',
				role: this.role.arn,
				memorySize: 128,
				timeout: 15,
				environment: {
					variables: {
						SLACK_WEBHOOK_URL: config.notifications.slack.webhookURL,
						CHANNEL: config.notifications.slack.channel,
						USERNAME: config.notifications.slack.username,
						ICON_EMOJI: config.notifications.slack.icon_emoji,
					},
				},
			},
		);

		this.topic = new SnsTopic(stack, 'notifications-topic', {
			name: prefixName('notifications-topic'),
		});

		new SnsTopicSubscription(stack, 'sns-lambda-subscription', {
			topicArn: this.topic.arn,
			protocol: 'lambda',
			endpoint: this.lambdaFunction.arn,
		});

		new LambdaPermission(stack, 'notifications-lambda-permission', {
			functionName: this.lambdaFunction.functionName,
			action: 'lambda:InvokeFunction',
			principal: 'sns.amazonaws.com',
		});

		// Cloud Watch Events
		const cwEvents: { [x: string]: string } = config.notifications.events;

		for (let ruleName in cwEvents) {
			const cloudWatchRule = new CloudwatchEventRule(
				stack,
				`cw-sns-rule-${ruleName}`,
				{
					name: prefixName(`AppEvents${ruleName}`),
					description: `Sends ${ruleName} notifications to SNS topic`,
					eventPattern: cwEvents[ruleName],
				},
			);

			new CloudwatchEventTarget(stack, `cw-sns-target-${ruleName}`, {
				rule: cloudWatchRule.name,
				arn: this.topic.arn,
			});
		}
	}
}

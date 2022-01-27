import { TerraformOutput } from 'cdktf';
import { SecurityGroup } from '../.gen/providers/aws/vpc';
import { Alb, AlbListener, AlbTargetGroup } from '../.gen/providers/aws/elb';
import prefixName from '../lib/prefix-name';
import AppStack from '../app-stack';
import config from '../config';

export default class AppLoadBalancer {
	alb: Alb;
	targetGroupBlue: AlbTargetGroup;
	targetGroupGreen: AlbTargetGroup;
	listener: AlbListener;
	securityGroup: SecurityGroup;

	constructor(stack: AppStack) {
		const port = config.loadBalancer.port;

		this.securityGroup = new SecurityGroup(stack, 'alb-sg', {
			name: prefixName('alb-sg'),
			vpcId: stack.vpc.vpc.id,
			ingress: [
				{
					protocol: 'tcp',
					fromPort: port,
					toPort: port,
					cidrBlocks: ['0.0.0.0/0'],
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

		this.alb = new Alb(stack, 'alb', {
			name: prefixName('alb'),
			securityGroups: [this.securityGroup.id],
			subnets: stack.vpc.getSubnetsIDs(),
		});

		new TerraformOutput(stack, 'alb-dns-name', {
			value: this.alb.dnsName,
		});

		const healthCheck = config.loadBalancer.healthCheck || undefined;

		this.targetGroupGreen = new AlbTargetGroup(stack, 'alb-tg-green', {
			name: prefixName('alb-tg-green'),
			port,
			protocol: 'HTTP',
			targetType: 'ip',
			vpcId: stack.vpc.vpc.id,
			healthCheck,
		});

		this.targetGroupBlue = new AlbTargetGroup(stack, 'alb-tg-blue', {
			name: prefixName('alb-tg-blue'),
			port,
			protocol: 'HTTP',
			targetType: 'ip',
			vpcId: stack.vpc.vpc.id,
			healthCheck,
		});

		this.listener = new AlbListener(stack, 'alb-listener', {
			loadBalancerArn: this.alb.arn,
			port,
			defaultAction: [
				{
					type: 'forward',
					targetGroupArn: this.targetGroupGreen.arn,
				},
			],
		});
	}
}

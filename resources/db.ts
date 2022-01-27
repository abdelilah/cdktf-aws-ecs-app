import { SecurityGroup } from '../.gen/providers/aws/vpc';
import { RdsCluster } from '../.gen/providers/aws/rds';
import { SsmParameter } from '../.gen/providers/aws/ssm';

import prefixName from '../lib/prefix-name';
import AppStack from '../app-stack';
import config from '../config';

export default class AppDB {
	securityGroup: SecurityGroup;
	cluster: RdsCluster;
	ssmDbHost: SsmParameter;
	ssmDbUser: SsmParameter;
	ssmDbPassword: SsmParameter;
	ssmDbName: SsmParameter;

	constructor(stack: AppStack) {
		// Create security group
		this.securityGroup = new SecurityGroup(stack, 'db-sg', {
			name: prefixName('db'),
			vpcId: stack.vpc.vpc.id,
			egress: [
				{
					protocol: '-1',
					fromPort: 0,
					toPort: 0,
					cidrBlocks: ['0.0.0.0/0'],
				},
			],
		});

		this.cluster = new RdsCluster(stack, 'db-cluster', {
			clusterIdentifier: config.appName,
			engine: 'aurora-mysql',
			engineMode: 'serverless',
			availabilityZones: stack.vpc.getAvailabilityZones(),
			vpcSecurityGroupIds: [this.securityGroup.id],
			scalingConfiguration: {
				minCapacity: 1,
				maxCapacity: 4,
			},
			...config.db.config,
		});

		// Store credentials in SSM parameter store
		this.ssmDbHost = new SsmParameter(stack, 'ssm-db-host', {
			name: `/${config.appName}/db-host`,
			type: 'String',
			value: this.cluster.endpoint,
		});

		this.ssmDbUser = new SsmParameter(stack, 'ssm-db-user', {
			name: `/${config.appName}/db-user`,
			type: 'String',
			value: this.cluster.masterUsername,
		});

		this.ssmDbPassword = new SsmParameter(stack, 'ssm-db-password', {
			name: `/${config.appName}/db-password`,
			type: 'SecureString',
			value: this.cluster.masterPassword,
		});

		this.ssmDbName = new SsmParameter(stack, 'ssm-db-name', {
			name: `/${config.appName}/db-name`,
			type: 'String',
			value: this.cluster.databaseName,
		});
	}
}

import { Construct } from 'constructs';
import { Fn } from 'cdktf';
import {
	DefaultVpc,
	DefaultSubnet,
	Vpc,
	Subnet,
	InternetGateway,
	RouteTable,
	RouteTableAssociation,
	VpcEndpoint,
} from '../.gen/providers/aws/vpc';
import { DataAwsAvailabilityZones } from '../.gen/providers/aws/datasources';

import config from '../config';

export default class AppVPC {
	vpc: DefaultVpc | Vpc;
	subnet1: DefaultSubnet | Subnet;
	subnet2: DefaultSubnet | Subnet;
	subnet3: DefaultSubnet | Subnet;
	internetGateway?: InternetGateway;
	routeTable?: RouteTable;
	routeTableAssociation1?: RouteTableAssociation;
	routeTableAssociation2?: RouteTableAssociation;
	routeTableAssociation3?: RouteTableAssociation;

	constructor(scope: Construct) {
		const defaultAZs = new DataAwsAvailabilityZones(scope, 'defaultAZs');

		if (config.createVPC !== true) {
			this.vpc = new DefaultVpc(scope, 'vpc');

			this.subnet1 = new DefaultSubnet(scope, 'subnet1', {
				availabilityZone: Fn.element(defaultAZs.names, 0),
			});

			this.subnet2 = new DefaultSubnet(scope, 'subnet2', {
				availabilityZone: Fn.element(defaultAZs.names, 1),
			});

			this.subnet3 = new DefaultSubnet(scope, 'subnet3', {
				availabilityZone: Fn.element(defaultAZs.names, 2),
			});

			new VpcEndpoint(scope, 'vpc-endpoint', {
				vpcId: this.vpc.id,
				serviceName: `com.amazonaws.${config.region}.s3`,
				routeTableIds: [this.vpc.defaultRouteTableId],
			});

			return;
		}

		this.vpc = new Vpc(scope, 'VPC', {
			cidrBlock: '172.17.0.0/16',
			enableDnsHostnames: true,
		});

		this.subnet1 = new Subnet(scope, 'subnet1', {
			vpcId: this.vpc.id,
			availabilityZone: Fn.element(defaultAZs.names, 0),
			cidrBlock: Fn.cidrsubnet(this.vpc.cidrBlock, 8, 0),
		});

		this.subnet2 = new Subnet(scope, 'subnet2', {
			vpcId: this.vpc.id,
			availabilityZone: Fn.element(defaultAZs.names, 1),
			cidrBlock: Fn.cidrsubnet(this.vpc.cidrBlock, 8, 1),
		});

		this.subnet3 = new Subnet(scope, 'subnet3', {
			vpcId: this.vpc.id,
			availabilityZone: Fn.element(defaultAZs.names, 2),
			cidrBlock: Fn.cidrsubnet(this.vpc.cidrBlock, 8, 2),
		});

		this.internetGateway = new InternetGateway(scope, 'ig', {
			vpcId: this.vpc.id,
		});

		this.routeTable = new RouteTable(scope, 'routeTable', {
			vpcId: this.vpc.id,
			route: [
				{
					cidrBlock: '0.0.0.0/0',
					gatewayId: this.internetGateway.id,
				},
			],
		});

		this.routeTableAssociation1 = new RouteTableAssociation(
			scope,
			'routeTableAssociation1',
			{
				routeTableId: this.routeTable.id,
				subnetId: this.subnet1.id,
			},
		);

		this.routeTableAssociation2 = new RouteTableAssociation(
			scope,
			'routeTableAssociation2',
			{
				routeTableId: this.routeTable.id,
				subnetId: this.subnet2.id,
			},
		);

		this.routeTableAssociation3 = new RouteTableAssociation(
			scope,
			'routeTableAssociation3',
			{
				routeTableId: this.routeTable.id,
				subnetId: this.subnet3.id,
			},
		);

		// VPC Endpoint
		new VpcEndpoint(scope, 'vpc-endpoint', {
			vpcId: this.vpc.id,
			serviceName: `com.amazonaws.${config.region}.s3`,
			routeTableIds: [this.routeTable.id],
		});
	}

	getSubnetsIDs(): string[] {
		return [this.subnet1.id, this.subnet2.id, this.subnet3.id];
	}

	getAvailabilityZones(): string[] {
		return [
			this.subnet1.availabilityZone,
			this.subnet2.availabilityZone,
			this.subnet3.availabilityZone,
		];
	}
}

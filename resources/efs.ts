import {
	EfsAccessPoint,
	EfsFileSystem,
	EfsMountTarget,
} from '../.gen/providers/aws/efs';
import { SecurityGroup } from '../.gen/providers/aws/vpc';
import prefixName from '../lib/prefix-name';
import AppStack from '../app-stack';

export default class AppEFS {
	securityGroup: SecurityGroup;
	fileSystem: EfsFileSystem;
	mountTargets: EfsMountTarget[];
	accessPoint: EfsAccessPoint;

	constructor(stack: AppStack, id: string) {
		this.securityGroup = new SecurityGroup(stack, `efs-${id}-sg`, {
			name: prefixName(`efs-${id}-sg`),
			vpcId: stack.vpc.vpc.id,
			ingress: [
				{
					protocol: 'tcp',
					fromPort: 2049,
					toPort: 2049,
					securityGroups: [],
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

		this.fileSystem = new EfsFileSystem(stack, `efs-disk-${id}`, {
			encrypted: true,
		});

		this.mountTargets = stack.vpc.getSubnetsIDs().map((subnetId, index) => {
			return new EfsMountTarget(stack, `efs-mount-target-${id}-${index + 1}`, {
				fileSystemId: this.fileSystem.id,
				subnetId,
				securityGroups: [this.securityGroup.id],
			});
		});

		this.accessPoint = new EfsAccessPoint(stack, `efs-access-${id}-point`, {
			fileSystemId: this.fileSystem.id,
			posixUser: {
				gid: 0,
				uid: 0,
			},
			rootDirectory: {
				path: '/',
				creationInfo: {
					ownerGid: 0,
					ownerUid: 0,
					permissions: '0777',
				},
			},
		});
	}
}

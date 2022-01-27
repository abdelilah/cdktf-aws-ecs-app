import {
	LambdaFunction,
	LambdaPermission,
} from '../.gen/providers/aws/lambdafunction';
import { IamRole, IamRolePolicy } from '../.gen/providers/aws/iam';
import { File } from '../.gen/providers/archive';
import { S3Bucket, S3BucketNotification } from '../.gen/providers/aws/s3';
import { SecurityGroup } from '../.gen/providers/aws/vpc';
import AppStack from '../app-stack';
import prefixName from '../lib/prefix-name';

export default class S3ToEFS {
	securityGroup: SecurityGroup;
	s3Bucket: S3Bucket;
	lambdaFunction: LambdaFunction;

	constructor(stack: AppStack) {
		this.securityGroup = new SecurityGroup(stack, 's3-to-efs-lambda-sg', {
			name: prefixName('s3-to-efs-lambda-sg'),
			vpcId: stack.vpc.vpc.id,
			ingress: [],
			egress: [
				{
					protocol: '-1',
					fromPort: 0,
					toPort: 0,
					cidrBlocks: ['0.0.0.0/0'],
				},
			],
		});

		this.s3Bucket = new S3Bucket(stack, 's3-to-efs-bucket', {
			bucket: prefixName('efs-deploy'),
			versioning: {
				enabled: true,
			},
			lifecycleRule: [
				{
					id: 'delete-old-versions',
					enabled: true,
					noncurrentVersionExpiration: {
						days: 30,
					},
				},
			],
			serverSideEncryptionConfiguration: {
				rule: {
					applyServerSideEncryptionByDefault: {
						sseAlgorithm: 'AES256',
					},
				},
			},
			acl: 'private',
		});

		const s3ToEFSRole = new IamRole(stack, 's3-to-efs-lambda-role', {
			name: prefixName('s3ToEFSRole'),
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

		new IamRolePolicy(stack, 's3-to-efs-lambda-role-policy', {
			name: prefixName('s3ToEFSPolicy'),
			role: s3ToEFSRole.name,
			policy: `{
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": [
                            "ec2:CreateNetworkInterface",
                            "ec2:DescribeNetworkInterfaces",
                            "ec2:DeleteNetworkInterface",
                            "logs:CreateLogGroup",
                            "logs:CreateLogStream",
                            "logs:PutLogEvents"
                        ],
                        "Resource": "*"
                    },
                    {
                        "Effect": "Allow",
                        "Action": [
                            "s3:GetObject",
                            "s3:GetObjectVersion"
                        ],
                        "Resource": ["${this.s3Bucket.arn}/*"]
                    }
                ]
            }`,
		});

		const lambdaArchive = new File(stack, 's3-to-efs-lambda-archive', {
			type: 'zip',
			outputPath: 's3ToEFS.zip',
			sourceDir: `${process.cwd()}/assets/lambda/s3-to-efs`,
		});

		this.lambdaFunction = new LambdaFunction(stack, 's3-to-efs-lambda', {
			filename: lambdaArchive.outputPath,
			handler: 'index.handler',
			functionName: 's3ToEFS',
			runtime: 'nodejs12.x',
			role: s3ToEFSRole.arn,
			memorySize: 128,
			timeout: 300,
			fileSystemConfig: {
				arn: stack.efsData.accessPoint.arn,
				localMountPath: '/mnt/efs',
			},
			vpcConfig: {
				securityGroupIds: [this.securityGroup.id],
				subnetIds: stack.vpc.getSubnetsIDs(),
			},
			dependsOn: [
				...stack.efsData.mountTargets,
				stack.efsData.accessPoint,
				this.s3Bucket,
				s3ToEFSRole,
			],
		});

		new LambdaPermission(stack, 's3-to-efs-bucket-permission', {
			statementId: 'AllowExecutionFromS3Bucket',
			action: 'lambda:InvokeFunction',
			functionName: this.lambdaFunction.functionName,
			principal: 's3.amazonaws.com',
			sourceArn: this.s3Bucket.arn,
		});

		new S3BucketNotification(stack, 's3-to-efs-bucket-notification', {
			bucket: this.s3Bucket.bucket,
			lambdaFunction: [
				{
					lambdaFunctionArn: this.lambdaFunction.arn,
					events: ['s3:ObjectCreated:*'],
				},
			],
		});
	}
}

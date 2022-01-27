import { AwsProvider } from '../.gen/providers/aws';
import {
	BackupPlan,
	BackupVault,
	BackupSelection,
} from '../.gen/providers/aws/backup';
import { IamRole, IamPolicyAttachment } from '../.gen/providers/aws/iam';

import AppStack from '../app-stack';
import prefixName from '../lib/prefix-name';
import config from '../config';

export default class AppBackup {
	role: IamRole;
	plan: BackupPlan;
	vault: BackupVault;
	vaultSecondary: BackupVault;
	selection: BackupSelection;

	constructor(stack: AppStack) {
		this.role = new IamRole(stack, 'backup-role', {
			name: prefixName('backup-role'),
			assumeRolePolicy: `{
                "Version": "2012-10-17",
                "Statement": [
                  {
                    "Action": ["sts:AssumeRole"],
                    "Effect": "allow",
                    "Principal": {
                      "Service": ["backup.amazonaws.com"]
                    }
                  }
                ]
            }`,
		});

		new IamPolicyAttachment(stack, 'backup-policy', {
			name: prefixName('backup-policy'),
			roles: [this.role.name],
			policyArn:
				'arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup',
		});

		this.vault = new BackupVault(stack, 'backup-vault', {
			name: prefixName('backup-vault'),
		});

		this.vaultSecondary = new BackupVault(stack, 'backup-vault-secondary', {
			name: prefixName('backup-vault-secondary'),

			provider: new AwsProvider(stack, 'aws-secondary-region', {
				region: config.backup.secondaryRegion,
				alias: 'aws-secondary-region',
				defaultTags: {
					tags: {
						app: config.appName,
					},
				},
			}),
		});

		this.plan = new BackupPlan(stack, 'backup-plan', {
			name: prefixName('backup-plan'),
			rule: [
				{
					ruleName: 'daily',
					targetVaultName: this.vault.name,
					schedule: 'cron(0 5 ? * * *)',
					startWindow: 480,
					completionWindow: 10080,
					copyAction: [
						{
							destinationVaultArn: this.vaultSecondary.arn,
						},
					],
				},
			],
		});

		this.selection = new BackupSelection(stack, 'backup-selection', {
			name: prefixName('resources'),
			iamRoleArn: this.role.arn,
			planId: this.plan.id,
			resources: [stack.efsData.fileSystem.arn],
		});
	}
}

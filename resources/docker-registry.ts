import { Construct } from 'constructs';
import { TerraformOutput } from 'cdktf';
import { EcrRepository } from '../.gen/providers/aws/ecr';

import config from '../config';

export default class AppDockerRegistry {
	ecr: EcrRepository;

	constructor(scope: Construct) {
		this.ecr = new EcrRepository(scope, 'ecr-repo', {
			name: config.appName,
		});

		new TerraformOutput(scope, 'ecr-url', {
			value: this.ecr.repositoryUrl,
		});
	}
}

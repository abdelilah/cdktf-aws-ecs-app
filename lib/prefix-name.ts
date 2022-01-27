import config from '../config';

export default (name: string) => `${config.appName}-${name}`;

import { API } from 'homebridge';
import { EufyRobovacMatterPlatform } from './platform';

/**
 * Initializes the plugin with Homebridge v2.
 */
export default (api: API) => {
  api.registerPlatform('homebridge-eufy-robovac-matter', 'EufyRobovacMatter', EufyRobovacMatterPlatform);
};

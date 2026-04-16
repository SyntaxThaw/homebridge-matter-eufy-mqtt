import { PlatformConfig } from 'homebridge';

export interface EufyPlatformConfig extends PlatformConfig {
  username?: string;
  password?: string;
  countryCode?: string;
}

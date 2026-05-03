import { PlatformConfig } from 'homebridge';
import { z } from 'zod';

export const roomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const platformConfigSchema = z.object({
  name: z.string().optional(),
  platform: z.string().optional(),
  // username/password can be overridden by EUFY_USERNAME / EUFY_PASSWORD env vars
  username: z.string().optional(),
  password: z.string().optional(),
  disableMatterStatePush: z.boolean().optional().default(false),
  rooms: z.array(roomSchema).optional().default([]),
  defaultMode: z.enum(['AUTO', 'VACUUM_ONLY', 'MOP_ONLY', 'VACUUM_AND_MOP']).optional().default('AUTO'),
  defaultSuction: z.number().int().min(1).max(5).optional().default(2),
  mqttReconnectMaxDelay: z.number().int().positive().optional().default(30000),
});

export type RoomConfig = z.infer<typeof roomSchema>;
export type EufyPlatformConfig = PlatformConfig & z.infer<typeof platformConfigSchema>;

/**
 * Validates and normalizes user config.
 * Credentials can be supplied via EUFY_USERNAME / EUFY_PASSWORD environment variables,
 * which take precedence over values in config.json (useful for avoiding plaintext secrets).
 */
export function parsePlatformConfig(config: PlatformConfig): EufyPlatformConfig {
  const parsed = platformConfigSchema.parse(config) as EufyPlatformConfig;
  if (process.env['EUFY_USERNAME']) {
    parsed.username = process.env['EUFY_USERNAME'];
  }
  if (process.env['EUFY_PASSWORD']) {
    parsed.password = process.env['EUFY_PASSWORD'];
  }
  return parsed;
}

import { PlatformConfig } from 'homebridge';
import { z } from 'zod';

export const roomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const platformConfigSchema = z.object({
  name: z.string().optional(),
  platform: z.string().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  disableMatterStatePush: z.boolean().optional().default(false),
  rooms: z.array(roomSchema).optional().default([]),
  defaultMode: z.enum(['AUTO', 'VACUUM_ONLY', 'MOP_ONLY', 'VACUUM_AND_MOP']).optional().default('AUTO'),
  defaultSuction: z.number().int().min(1).max(4).optional().default(2),
  mqttReconnectMaxDelay: z.number().int().positive().optional().default(30000),
});

export type RoomConfig = z.infer<typeof roomSchema>;
export type EufyPlatformConfig = PlatformConfig & z.infer<typeof platformConfigSchema>;

/** Validates and normalizes user config. */
export function parsePlatformConfig(config: PlatformConfig): EufyPlatformConfig {
  return platformConfigSchema.parse(config) as EufyPlatformConfig;
}

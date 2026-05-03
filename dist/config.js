"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformConfigSchema = exports.roomSchema = void 0;
exports.parsePlatformConfig = parsePlatformConfig;
const zod_1 = require("zod");
exports.roomSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
});
exports.platformConfigSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    platform: zod_1.z.string().optional(),
    // username/password can be overridden by EUFY_USERNAME / EUFY_PASSWORD env vars
    username: zod_1.z.string().optional(),
    password: zod_1.z.string().optional(),
    disableMatterStatePush: zod_1.z.boolean().optional().default(false),
    rooms: zod_1.z.array(exports.roomSchema).optional().default([]),
    defaultMode: zod_1.z.enum(['AUTO', 'VACUUM_ONLY', 'MOP_ONLY', 'VACUUM_AND_MOP']).optional().default('AUTO'),
    defaultSuction: zod_1.z.number().int().min(1).max(5).optional().default(2),
    mqttReconnectMaxDelay: zod_1.z.number().int().positive().optional().default(30000),
});
/**
 * Validates and normalizes user config.
 * Credentials can be supplied via EUFY_USERNAME / EUFY_PASSWORD environment variables,
 * which take precedence over values in config.json (useful for avoiding plaintext secrets).
 */
function parsePlatformConfig(config) {
    const parsed = exports.platformConfigSchema.parse(config);
    if (process.env['EUFY_USERNAME']) {
        parsed.username = process.env['EUFY_USERNAME'];
    }
    if (process.env['EUFY_PASSWORD']) {
        parsed.password = process.env['EUFY_PASSWORD'];
    }
    return parsed;
}

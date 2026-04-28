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
    username: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1),
    disableMatterStatePush: zod_1.z.boolean().optional().default(false),
    rooms: zod_1.z.array(exports.roomSchema).optional().default([]),
    defaultMode: zod_1.z.enum(['AUTO', 'VACUUM_ONLY', 'MOP_ONLY', 'VACUUM_AND_MOP']).optional().default('AUTO'),
    defaultSuction: zod_1.z.number().int().min(1).max(4).optional().default(2),
    mqttReconnectMaxDelay: zod_1.z.number().int().positive().optional().default(30000),
});
/** Validates and normalizes user config. */
function parsePlatformConfig(config) {
    return exports.platformConfigSchema.parse(config);
}

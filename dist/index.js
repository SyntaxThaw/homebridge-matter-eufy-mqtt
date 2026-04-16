"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const platform_1 = require("./platform");
/**
 * Initializes the plugin with Homebridge v2.
 */
exports.default = (api) => {
    api.registerPlatform('homebridge-eufy-robovac-matter', 'EufyRobovacMatter', platform_1.EufyRobovacMatterPlatform);
};

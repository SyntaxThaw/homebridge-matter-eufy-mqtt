"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveCapabilitiesByModel = deriveCapabilitiesByModel;
// From const.py
const EUFY_CLEAN_X_SERIES = ['T2262', 'T2261', 'T2266', 'T2276', 'T2320', 'T2351'];
const EUFY_CLEAN_G_SERIES = ['T2210', 'T2250', 'T2251', 'T2252', 'T2253', 'T2254', 'T2255', 'T2256', 'T2257', 'T2258', 'T2259', 'T2270', 'T2272', 'T2273', 'T2277'];
const EUFY_CLEAN_L_SERIES = ['T2190', 'T2267', 'T2268', 'T2278'];
const EUFY_CLEAN_C_SERIES = ['T1250', 'T2117', 'T2118', 'T2128', 'T2130', 'T2132', 'T2120', 'T2280', 'T2292'];
function deriveCapabilitiesByModel(model) {
    const isXSeries = EUFY_CLEAN_X_SERIES.includes(model);
    const isGSeries = EUFY_CLEAN_G_SERIES.includes(model);
    const isLSeries = EUFY_CLEAN_L_SERIES.includes(model);
    const isCSeries = EUFY_CLEAN_C_SERIES.includes(model);
    const isKnownSeries = isXSeries || isGSeries || isLSeries || isCSeries;
    return {
        supportsPause: isKnownSeries,
        supportsResume: isKnownSeries,
        supportsGoHome: isKnownSeries,
        supportsCleanModes: isXSeries || isLSeries,
    };
}

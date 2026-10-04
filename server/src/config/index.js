"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../supertext/client");
exports.default = {
    default: () => ({
        apiKey: process.env.SUPERTEXT_API_KEY,
        endpoint: process.env.SUPERTEXT_API_ENDPOINT || client_1.LIVE_ENDPOINT,
        pollIntervalMs: 2000,
        pollTimeoutMs: 180000,
        locales: {},
        contentTypes: [],
    }),
    validator(config) {
        var _a;
        for (const [locale, options] of Object.entries((_a = config.locales) !== null && _a !== void 0 ? _a : {})) {
            if ((options === null || options === void 0 ? void 0 : options.politeness) && !['default', 'more', 'less'].includes(options.politeness)) {
                throw new Error(`supertext: locales.${locale}.politeness must be "default", "more" or "less".`);
            }
        }
        if (config.contentTypes && !Array.isArray(config.contentTypes)) {
            throw new Error('supertext: contentTypes must be an array of content-type UIDs.');
        }
    },
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bootstrap = ({ strapi }) => {
    const { apiKey } = strapi.config.get('plugin::supertext');
    if (!apiKey) {
        strapi.log.warn('[supertext] No API key configured (SUPERTEXT_API_KEY). Translation is disabled until one is set.');
    }
};
exports.default = bootstrap;

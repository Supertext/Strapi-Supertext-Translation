import type { Core } from '@strapi/strapi';

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  const { apiKey } = strapi.config.get('plugin::supertext') as { apiKey?: string };
  if (!apiKey) {
    strapi.log.warn('[supertext] No API key configured (SUPERTEXT_API_KEY). Translation is disabled until one is set.');
  }
};

export default bootstrap;

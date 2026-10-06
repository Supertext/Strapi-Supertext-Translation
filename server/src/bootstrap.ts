import type { Core } from '@strapi/strapi';

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  const { apiKey } = strapi.config.get('plugin::supertext') as { apiKey?: string };
  if (!apiKey) {
    strapi.log.warn('[supertext] No API key configured (SUPERTEXT_API_KEY). Translation is disabled until one is set. Create a Supertext account at https://www.supertext.com/person/en/account/signin and generate a key at https://www.supertext.com/en/integrations/api (requires the Admin role).');
  }
};

export default bootstrap;

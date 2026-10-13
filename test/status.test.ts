import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import translator from '../server/src/services/translator';
import { pluginVersion } from '../server/src/version';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const fakeStrapi = (config: Record<string, unknown>, locales: { code: string; name: string }[] = []) => ({
  config: { get: () => ({ apiKey: 'secret', endpoint: 'https://api.supertext.com/v1/', locales: {}, contentTypes: [], ...config }) },
  components: {},
  plugin: (name: string) => (name === 'i18n' ? { service: () => ({ find: async () => locales }) } : undefined),
  log: { debug() {} },
});

describe('status', () => {
  it('reads the plugin version from package.json', () => {
    expect(pluginVersion()).toBe(pkg.version);
  });

  it('returns the version with the configuration, never the key', () => {
    const status = translator({ strapi: fakeStrapi({}) } as never).status();
    expect(status).toEqual({
      configured: true,
      endpoint: 'https://api.supertext.com/v1/',
      locales: {},
      contentTypes: [],
      version: pkg.version,
    });
    expect(JSON.stringify(status)).not.toContain('secret');
  });

  it('lists every locale with its Supertext code, unmapped ones as null', async () => {
    const strapi = fakeStrapi(
      { locales: { de: { code: 'de-CH', politeness: 'more' }, 'en-GB': { politeness: 'less' } } },
      [
        { code: 'en', name: 'English' },
        { code: 'de', name: 'German' },
        { code: 'fr-CH', name: 'French (Switzerland)' },
        { code: 'en-GB', name: 'English (UK)' },
      ]
    );
    expect(await translator({ strapi } as never).languages()).toEqual([
      { code: 'en', name: 'English', target: null, politeness: 'default', politenessSupported: null },
      { code: 'de', name: 'German', target: 'de-CH', politeness: 'more', politenessSupported: true },
      { code: 'fr-CH', name: 'French (Switzerland)', target: 'fr-CH', politeness: 'default', politenessSupported: true },
      { code: 'en-GB', name: 'English (UK)', target: 'en-GB', politeness: 'less', politenessSupported: false },
    ]);
  });
});

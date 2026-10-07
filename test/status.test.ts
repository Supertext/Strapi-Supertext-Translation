import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import translator from '../server/src/services/translator';
import { pluginVersion } from '../server/src/version';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('status', () => {
  it('reads the plugin version from package.json', () => {
    expect(pluginVersion()).toBe(pkg.version);
  });

  it('returns the version with the configuration, never the key', () => {
    const strapi = {
      config: { get: () => ({ apiKey: 'secret', endpoint: 'https://api.supertext.com/v1/', locales: {}, contentTypes: [] }) },
      components: {},
    };
    const status = translator({ strapi } as never).status();
    expect(status).toEqual({
      configured: true,
      endpoint: 'https://api.supertext.com/v1/',
      locales: {},
      contentTypes: [],
      version: pkg.version,
    });
    expect(JSON.stringify(status)).not.toContain('secret');
  });
});

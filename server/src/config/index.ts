import { LIVE_ENDPOINT, type Politeness } from '../supertext/client';

export interface LocaleOptions {
  /** Supertext target language code, if it differs from the Strapi locale code. */
  code?: string;
  /** "more" = formal (Sie/vous), "less" = informal (du/tu). */
  politeness?: Politeness;
}

export interface PluginConfig {
  /** Supertext API key. Defaults to the SUPERTEXT_API_KEY environment variable. */
  apiKey?: string;
  /** API base URL. Defaults to SUPERTEXT_API_ENDPOINT or the live API. */
  endpoint?: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  /** Per-locale options, keyed by Strapi locale code (e.g. "de-CH"). */
  locales: Record<string, LocaleOptions>;
  /** Restrict translation to these content-type UIDs. Empty = every localized type. */
  contentTypes: string[];
}

export default {
  default: (): PluginConfig => ({
    apiKey: process.env.SUPERTEXT_API_KEY,
    endpoint: process.env.SUPERTEXT_API_ENDPOINT || LIVE_ENDPOINT,
    pollIntervalMs: 2000,
    pollTimeoutMs: 180_000,
    locales: {},
    contentTypes: [],
  }),
  validator(config: Partial<PluginConfig>) {
    for (const [locale, options] of Object.entries(config.locales ?? {})) {
      if (options?.politeness && !['default', 'more', 'less'].includes(options.politeness)) {
        throw new Error(`supertext: locales.${locale}.politeness must be "default", "more" or "less".`);
      }
    }
    if (config.contentTypes && !Array.isArray(config.contentTypes)) {
      throw new Error('supertext: contentTypes must be an array of content-type UIDs.');
    }
  },
};

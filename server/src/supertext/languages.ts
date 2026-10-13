import { LanguageCodes } from '../vendor/supertext-sdk/index';

/**
 * Language codes the Supertext way, with the Supertext SDK's rules (the same in every
 * Supertext plugin): the target is regional (`de` → `de-DE`, `de_ch` → `de-CH`; unknown
 * bare codes unchanged), the source the bare language (`de-CH` → `de`). A configured
 * `code` override wins over the Strapi locale.
 */
export const DEFAULT_REGIONS: Readonly<Record<string, string>> = LanguageCodes.DEFAULT_REGIONS;

export const normalizeTag = (code: string): string => LanguageCodes.normalize(code);

/** Target code for a Strapi locale: the configured `code` override wins, else the locale. */
export function targetCode(locale: string, override?: string): string {
  return LanguageCodes.target(override || locale);
}

/** Source code: the bare language of the override or locale (`en-US` → `en`). Empty = auto-detect. */
export function sourceCode(locale: string, override?: string): string {
  return LanguageCodes.source(override || locale || '');
}

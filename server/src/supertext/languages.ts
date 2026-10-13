import { Languages, SupertextError as SdkError } from '../vendor/supertext-sdk/v1/index';
import { fromSdkError, type Politeness } from './client';

/**
 * Strapi locales → Supertext codes, with the Supertext SDK's rules (the same in every Supertext
 * plugin, no guessing): the locale's `code` option in the plugin configuration wins (sent as it
 * is); otherwise a Strapi locale that equals a Supertext code apart from case and `_`/`-` is used
 * (`de-CH`, `fr_ch` → `fr-CH`, `es`); anything else is the error `unsupportedLanguage` and nothing
 * is sent. There are no default regions: `de` must be mapped (to `de-DE`, `de-CH` or `de-AT`).
 * Sources are bare (`en-US` → `en`).
 */
export const SUPERTEXT_TARGETS = Languages.TARGETS;

const plugin = <T>(run: () => T): T => {
  try {
    return run();
  } catch (error) {
    throw error instanceof SdkError ? fromSdkError(error) : error;
  }
};

/** Target code for a Strapi locale: the configured `code` wins, else an exact Supertext code, else `unsupportedLanguage`. */
export function targetCode(locale: string, override?: string): string {
  return plugin(() => Languages.target(locale, override ? { [locale]: override } : undefined));
}

/** The target code, or null when the locale isn't mapped (for the settings page). */
export function targetCodeOrNull(locale: string, override?: string): string | null {
  try {
    return targetCode(locale, override);
  } catch {
    return null;
  }
}

/**
 * Source code: the bare language of the configured `code` or of the locale (`en-US` → `en`,
 * `de-CH` → `de`), else `unsupportedLanguage`. Empty = auto-detect.
 */
export function sourceCode(locale: string, override?: string): string {
  return plugin(() => Languages.source(override || locale || ''));
}

/** Whether Supertext offers formal/informal for a target code (null: a code not in the SDK's list). */
export const supportsPoliteness = (target: string): boolean | null => Languages.supportsPoliteness(target);

/**
 * The politeness to send. A formal/informal setting for a target that has none isn't dropped
 * silently: it is the error `unsupportedFeature` (nothing is sent), and the settings page warns.
 */
export function politenessFor(target: string, politeness: Politeness | undefined, locale = target): Politeness {
  const value = politeness ?? 'default';
  if (value !== 'default' && supportsPoliteness(target) === false) {
    throw fromSdkError(new SdkError('unsupported_feature', { feature: 'politeness', targetLang: locale }));
  }
  return value;
}

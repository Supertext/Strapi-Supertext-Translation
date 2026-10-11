/**
 * Supertext language codes. Supertext wants the source as a bare language
 * (`en`) and the target with a region (`de-DE`); a regional source or a bare
 * target is rejected with INVALID_LANGUAGE_PAIR.
 */

/** Regional default for a bare target (same table in every Supertext plugin). */
export const DEFAULT_REGIONS: Readonly<Record<string, string>> = {
  ar: 'ar-SA', bg: 'bg-BG', cs: 'cs-CZ', da: 'da-DK', de: 'de-DE', el: 'el-GR', en: 'en-US',
  es: 'es-ES', et: 'et-EE', fi: 'fi-FI', fr: 'fr-FR', hr: 'hr-HR', hu: 'hu-HU', it: 'it-IT',
  ja: 'ja-JP', ko: 'ko-KR', lt: 'lt-LT', lv: 'lv-LV', nb: 'nb-NO', nl: 'nl-NL', pl: 'pl-PL',
  pt: 'pt-PT', ro: 'ro-RO', ru: 'ru-RU', sk: 'sk-SK', sl: 'sl-SI', sr: 'sr-RS', sv: 'sv-SE',
  th: 'th-TH', tr: 'tr-TR', uk: 'uk-UA', vi: 'vi-VN', zh: 'zh-CN',
};

/** `de_ch` / `DE-ch` → `de-CH`; scripts and numeric regions keep their form (`zh-Hant`, `es-419`). */
export function normalizeTag(code: string): string {
  const [language, ...rest] = code.trim().split(/[-_]+/).filter(Boolean);
  if (!language) return '';
  const subtags = rest.map((part) => {
    if (/^[a-z]{2}$/i.test(part)) return part.toUpperCase();
    if (/^[a-z]{4}$/i.test(part)) return part[0].toUpperCase() + part.slice(1).toLowerCase();
    return part;
  });
  return [language.toLowerCase(), ...subtags].join('-');
}

/**
 * Target code for a Strapi locale: the configured `code` override wins, else the
 * locale. Always regional: a bare language gets its default region (`de` → `de-DE`);
 * unknown bare codes are sent unchanged.
 */
export function targetCode(locale: string, override?: string): string {
  const tag = normalizeTag(override || locale);
  return tag.includes('-') ? tag : (DEFAULT_REGIONS[tag] ?? tag);
}

/** Source code: the bare language of the override or locale (`en-US` → `en`). Empty = auto-detect. */
export function sourceCode(locale: string, override?: string): string {
  return normalizeTag(override || locale || '').split('-')[0] ?? '';
}

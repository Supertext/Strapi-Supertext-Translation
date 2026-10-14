import { describe, expect, it } from 'vitest';
import { politenessFor, sourceCode, supportsPoliteness, targetCode, targetCodeOrNull } from '../server/src/supertext/languages';

describe('language codes (no guessing)', () => {
  it('sends a bare source language', () => {
    expect(sourceCode('en')).toBe('en');
    expect(sourceCode('')).toBe('');
    expect(sourceCode('en-US')).toBe('en');
    expect(sourceCode('en_GB')).toBe('en');
    expect(sourceCode('DE-ch')).toBe('de');
  });

  it('uses a Strapi locale that is a Supertext code, ignoring case and underscores', () => {
    expect(targetCode('it-CH')).toBe('it-CH');
    expect(targetCode('de_ch')).toBe('de-CH');
    expect(targetCode('fr-ch')).toBe('fr-CH');
    expect(targetCode('es')).toBe('es');
    expect(targetCode('zh-hant')).toBe('zh-Hant');
  });

  it('refuses locales Supertext does not have, without a default region', () => {
    for (const code of ['de', 'en', 'sl-SI', 'es-ES', 'zh-CN', 'xx']) {
      expect(() => targetCode(code), code).toThrow(expect.objectContaining({ code: 'unsupportedLanguage', values: { language: code } }));
    }
    expect(targetCodeOrNull('de')).toBeNull();
    expect(() => sourceCode('xx')).toThrow(expect.objectContaining({ code: 'unsupportedLanguage' }));
  });

  it('lets the configured code win and sends it as it is', () => {
    expect(targetCode('de', 'de-AT')).toBe('de-AT');
    expect(targetCode('ch', 'gsw-u-sd-chzh')).toBe('gsw-u-sd-chzh');
    expect(targetCodeOrNull('zh-CN', 'zh-Hans')).toBe('zh-Hans');
    // The source is the language of the configured code.
    expect(sourceCode('ch', 'de-CH')).toBe('de');
  });

  it('uses one mapping for both directions', () => {
    expect(targetCode('de', 'de-CH')).toBe('de-CH');
    expect(sourceCode('de', 'de-CH')).toBe('de');
    expect(targetCode('en', 'en-US')).toBe('en-US');
    expect(sourceCode('en', 'en-US')).toBe('en');
  });

  it('knows which targets offer formal/informal and never drops a setting silently', () => {
    expect(supportsPoliteness('de-CH')).toBe(true);
    expect(supportsPoliteness('en-US')).toBe(false);
    expect(politenessFor('de-CH', 'more')).toBe('more');
    expect(politenessFor('en-US', undefined)).toBe('default');
    expect(politenessFor('en-US', 'default')).toBe('default');
    expect(() => politenessFor('en-US', 'more', 'en')).toThrow(expect.objectContaining({ code: 'unsupportedFeature', values: { language: 'en' } }));
    // A mapped code the SDK doesn't list: sent as configured.
    expect(politenessFor('xx-YY', 'less')).toBe('less');
  });
});

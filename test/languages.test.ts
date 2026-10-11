import { describe, expect, it } from 'vitest';
import { sourceCode, targetCode } from '../server/src/supertext/languages';

describe('language codes', () => {
  it('sends a bare source language', () => {
    expect(sourceCode('en')).toBe('en');
    expect(sourceCode('')).toBe('');
  });
  it('strips the region from a regional source', () => {
    expect(sourceCode('en-US')).toBe('en');
    expect(sourceCode('en_GB')).toBe('en');
    expect(sourceCode('DE-ch')).toBe('de');
  });
  it('gives a bare target its default region', () => {
    expect(targetCode('de')).toBe('de-DE');
    expect(targetCode('en')).toBe('en-US');
    expect(targetCode('sl')).toBe('sl-SI');
    expect(targetCode('ZH')).toBe('zh-CN');
  });
  it('keeps a regional target and normalizes case and underscores', () => {
    expect(targetCode('it-CH')).toBe('it-CH');
    expect(targetCode('de_ch')).toBe('de-CH');
    expect(targetCode('fr-ch')).toBe('fr-CH');
    expect(targetCode('zh-hant')).toBe('zh-Hant');
    expect(targetCode('es-419')).toBe('es-419');
  });
  it('lets the configured code win', () => {
    expect(targetCode('de', 'de-AT')).toBe('de-AT');
    expect(targetCode('ch', 'de_ch')).toBe('de-CH');
    expect(sourceCode('ch', 'de-CH')).toBe('de');
  });
  it('sends unknown bare codes unchanged', () => {
    expect(targetCode('xx')).toBe('xx');
  });
});

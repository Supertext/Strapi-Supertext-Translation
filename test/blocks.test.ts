import { describe, expect, it } from 'vitest';
import { htmlToInline, inlineToHtml, type InlineNode } from '../server/src/supertext/blocks';

describe('blocks inline conversion', () => {
  const children: InlineNode[] = [
    { type: 'text', text: 'We ship ' },
    { type: 'text', text: 'Swiss chocolate', bold: true },
    { type: 'text', text: ' to ' },
    { type: 'link', url: 'https://example.com/?a=1&b=2', children: [{ type: 'text', text: 'every country', italic: true }] },
    { type: 'text', text: '.\nSecond line & more' },
  ];

  it('round-trips marks, links and line breaks', () => {
    const html = inlineToHtml(children);
    expect(html).toContain('<strong>Swiss chocolate</strong>');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(htmlToInline(html, children)).toEqual(children);
  });

  it('reads translated HTML with reordered marks', () => {
    const result = htmlToInline('Wir liefern <strong>Schweizer Schokolade</strong> in <a href="https://example.com/?a=1&amp;b=2"><em>jedes Land</em></a>.', children);
    expect(result).toEqual([
      { type: 'text', text: 'Wir liefern ' },
      { type: 'text', text: 'Schweizer Schokolade', bold: true },
      { type: 'text', text: ' in ' },
      { type: 'link', url: 'https://example.com/?a=1&b=2', children: [{ type: 'text', text: 'jedes Land', italic: true }] },
      { type: 'text', text: '.' },
    ]);
  });

  it('never returns empty children', () => {
    expect(htmlToInline('')).toEqual([{ type: 'text', text: '' }]);
  });
});

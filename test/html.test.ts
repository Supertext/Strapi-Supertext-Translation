import { describe, expect, it } from 'vitest';
import { buildDocument, parseDocument, type Segment } from '../server/src/supertext/html';

describe('HTML document round trip', () => {
  const segments: Segment[] = [
    { text: 'Fish & Chips < 10 CHF, "quoted"', html: false },
    { text: 'Monday|9-18\nSaturday|10-16\n\nSunday|closed', html: false },
    { text: '<p>We ship <strong>Swiss chocolate</strong>.</p><ul><li>Fast</li></ul>', html: true },
    { text: 'Grüezi – café, naïve, 日本語', html: false },
    { text: '## Heading\n\n- item *one*\n- [link](https://example.com)', html: false },
  ];

  it('returns every segment unchanged when nothing is translated', () => {
    // Simulate a translator re-serialising with different whitespace.
    const document = buildDocument(segments).replace(/<\/div>\n/g, '</div>\n\n   ');
    const parsed = parseDocument(document, segments);
    segments.forEach((segment, i) => expect(parsed.get(i)).toBe(segment.text));
  });

  it('ignores ids it did not send', () => {
    const parsed = parseDocument('<div data-st-id="99">x</div>', segments);
    expect(parsed.size).toBe(0);
  });
});

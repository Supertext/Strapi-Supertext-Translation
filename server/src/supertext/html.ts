import { parse, HTMLElement, TextNode, type Node } from 'node-html-parser';

/**
 * Packs many strings into one HTML document and splits the translated document
 * back apart. Supertext keeps markup and attributes and only translates text,
 * so every segment travels inside <div data-st-id="N">…</div>.
 *
 * Plain-text segments are escaped and their line breaks sent as <br>, so they
 * come back unchanged apart from the translation; HTML segments go as-is.
 */

export interface Segment {
  text: string;
  html: boolean;
}

const LINE_BREAK = '\u001E';

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function buildDocument(segments: Segment[]): string {
  let html = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n';
  segments.forEach((segment, id) => {
    const content = segment.html
      ? segment.text
      : escapeHtml(segment.text.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');
    html += `<div data-st-id="${id}">${content}</div>\n`;
  });
  return html + '</body></html>';
}

/** @returns segment index => translated text */
export function parseDocument(html: string, segments: Segment[]): Map<number, string> {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, pre: true } });
  const result = new Map<number, string>();
  for (const element of root.querySelectorAll('[data-st-id]')) {
    const id = Number(element.getAttribute('data-st-id'));
    const segment = segments[id];
    if (!segment) {
      continue;
    }
    result.set(id, segment.html ? element.innerHTML.trim() : plainText(element));
  }
  return result;
}

/** Text content where <br> are the only line breaks and other whitespace collapses. */
function plainText(element: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node instanceof TextNode) {
      parts.push(node.text);
    } else if (node instanceof HTMLElement) {
      if (node.rawTagName?.toLowerCase() === 'br') {
        parts.push(LINE_BREAK);
        return;
      }
      node.childNodes.forEach(walk);
    }
  };
  element.childNodes.forEach(walk);
  return parts
    .join('')
    .replace(/\s+/gu, ' ')
    .replace(new RegExp(` ?${LINE_BREAK} ?`, 'gu'), '\n')
    .replace(/^ +| +$/g, '');
}

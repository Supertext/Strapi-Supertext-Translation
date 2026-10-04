import { parse, HTMLElement, TextNode, type Node } from 'node-html-parser';
import { escapeHtml } from './html';

/**
 * Converts the inline content of a Strapi "blocks" (rich text) node to HTML
 * for translation, and the translated HTML back to inline nodes.
 *
 * Inline nodes are text leaves with marks (bold, italic, underline,
 * strikethrough, code) and links containing text leaves.
 */

export interface TextLeaf {
  type: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
}

export interface LinkNode {
  type: 'link';
  url: string;
  children: TextLeaf[];
  [key: string]: unknown;
}

export type InlineNode = TextLeaf | LinkNode;

type Mark = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code';

const MARK_TAGS: Array<[Mark, string]> = [
  ['bold', 'strong'],
  ['italic', 'em'],
  ['underline', 'u'],
  ['strikethrough', 's'],
  ['code', 'code'],
];

const TAG_MARKS: Record<string, Mark> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  u: 'underline',
  s: 'strikethrough',
  del: 'strikethrough',
  strike: 'strikethrough',
  code: 'code',
};

/** Block types whose children are inline content we translate. */
const INLINE_CONTAINERS = new Set(['paragraph', 'heading', 'quote', 'list-item']);

export function isInlineContainer(node: unknown): node is { type: string; children: InlineNode[] } {
  return (
    !!node &&
    typeof node === 'object' &&
    INLINE_CONTAINERS.has((node as { type?: string }).type ?? '') &&
    Array.isArray((node as { children?: unknown }).children)
  );
}

export function hasText(children: InlineNode[]): boolean {
  return children.some((child) =>
    child.type === 'text' ? child.text.trim() !== '' : child.children?.some((leaf) => leaf.text?.trim())
  );
}

export function inlineToHtml(children: InlineNode[]): string {
  return children
    .map((child) => {
      if (child.type === 'link') {
        return `<a href="${escapeHtml(child.url ?? '')}">${inlineToHtml(child.children ?? [])}</a>`;
      }
      if (child.type !== 'text') {
        return '';
      }
      let html = escapeHtml(child.text ?? '').replace(/\n/g, '<br>');
      for (const [mark, tag] of [...MARK_TAGS].reverse()) {
        if (child[mark]) {
          html = `<${tag}>${html}</${tag}>`;
        }
      }
      return html;
    })
    .join('');
}

export function htmlToInline(html: string, original: InlineNode[] = []): InlineNode[] {
  const root = parse(`<div>${html}</div>`, { comment: false });
  const result: InlineNode[] = [];
  const originalLinks = original.filter((node): node is LinkNode => node.type === 'link');

  const pushText = (target: Array<InlineNode | TextLeaf>, text: string, marks: Set<Mark>) => {
    if (text === '') {
      return;
    }
    const last = target[target.length - 1];
    if (last && last.type === 'text' && sameMarks(last, marks)) {
      last.text += text;
      return;
    }
    const leaf: TextLeaf = { type: 'text', text };
    marks.forEach((mark) => (leaf[mark] = true));
    target.push(leaf);
  };

  const walk = (node: Node, marks: Set<Mark>, target: Array<InlineNode | TextLeaf>, inLink: boolean) => {
    if (node instanceof TextNode) {
      pushText(target, node.text.replace(/\s+/g, ' '), marks);
      return;
    }
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const tag = (node.rawTagName || '').toLowerCase();
    if (tag === 'br') {
      pushText(target, '\n', marks);
      return;
    }
    if (tag === 'a' && !inLink) {
      const url = node.getAttribute('href') ?? '';
      // Keep any extra properties the original link had (e.g. custom attributes).
      const source = originalLinks.find((link) => link.url === url);
      const link: LinkNode = { ...(source ?? {}), type: 'link', url, children: [] };
      node.childNodes.forEach((child) => walk(child, marks, link.children, true));
      if (link.children.length === 0) {
        link.children.push({ type: 'text', text: '' });
      }
      target.push(link);
      return;
    }
    const mark = TAG_MARKS[tag];
    const next = mark ? new Set([...marks, mark]) : marks;
    node.childNodes.forEach((child) => walk(child, next, target, inLink));
  };

  root.childNodes.forEach((child) => walk(child, new Set(), result, false));

  // Trim outer whitespace introduced by the round trip.
  const first = result[0];
  if (first?.type === 'text') first.text = first.text.replace(/^ +/, '');
  const last = result[result.length - 1];
  if (last?.type === 'text') last.text = last.text.replace(/ +$/, '');

  return result.length ? result : [{ type: 'text', text: '' }];
}

function sameMarks(leaf: TextLeaf, marks: Set<Mark>): boolean {
  return MARK_TAGS.every(([mark]) => Boolean(leaf[mark]) === marks.has(mark));
}

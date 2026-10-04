"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInlineContainer = isInlineContainer;
exports.hasText = hasText;
exports.inlineToHtml = inlineToHtml;
exports.htmlToInline = htmlToInline;
const node_html_parser_1 = require("node-html-parser");
const html_1 = require("./html");
const MARK_TAGS = [
    ['bold', 'strong'],
    ['italic', 'em'],
    ['underline', 'u'],
    ['strikethrough', 's'],
    ['code', 'code'],
];
const TAG_MARKS = {
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
function isInlineContainer(node) {
    var _a;
    return (!!node &&
        typeof node === 'object' &&
        INLINE_CONTAINERS.has((_a = node.type) !== null && _a !== void 0 ? _a : '') &&
        Array.isArray(node.children));
}
function hasText(children) {
    return children.some((child) => { var _a; return child.type === 'text' ? child.text.trim() !== '' : (_a = child.children) === null || _a === void 0 ? void 0 : _a.some((leaf) => { var _a; return (_a = leaf.text) === null || _a === void 0 ? void 0 : _a.trim(); }); });
}
function inlineToHtml(children) {
    return children
        .map((child) => {
        var _a, _b, _c;
        if (child.type === 'link') {
            return `<a href="${(0, html_1.escapeHtml)((_a = child.url) !== null && _a !== void 0 ? _a : '')}">${inlineToHtml((_b = child.children) !== null && _b !== void 0 ? _b : [])}</a>`;
        }
        if (child.type !== 'text') {
            return '';
        }
        let html = (0, html_1.escapeHtml)((_c = child.text) !== null && _c !== void 0 ? _c : '').replace(/\n/g, '<br>');
        for (const [mark, tag] of [...MARK_TAGS].reverse()) {
            if (child[mark]) {
                html = `<${tag}>${html}</${tag}>`;
            }
        }
        return html;
    })
        .join('');
}
function htmlToInline(html, original = []) {
    const root = (0, node_html_parser_1.parse)(`<div>${html}</div>`, { comment: false });
    const result = [];
    const originalLinks = original.filter((node) => node.type === 'link');
    const pushText = (target, text, marks) => {
        if (text === '') {
            return;
        }
        const last = target[target.length - 1];
        if (last && last.type === 'text' && sameMarks(last, marks)) {
            last.text += text;
            return;
        }
        const leaf = { type: 'text', text };
        marks.forEach((mark) => (leaf[mark] = true));
        target.push(leaf);
    };
    const walk = (node, marks, target, inLink) => {
        var _a;
        if (node instanceof node_html_parser_1.TextNode) {
            pushText(target, node.text.replace(/\s+/g, ' '), marks);
            return;
        }
        if (!(node instanceof node_html_parser_1.HTMLElement)) {
            return;
        }
        const tag = (node.rawTagName || '').toLowerCase();
        if (tag === 'br') {
            pushText(target, '\n', marks);
            return;
        }
        if (tag === 'a' && !inLink) {
            const url = (_a = node.getAttribute('href')) !== null && _a !== void 0 ? _a : '';
            // Keep any extra properties the original link had (e.g. custom attributes).
            const source = originalLinks.find((link) => link.url === url);
            const link = { ...(source !== null && source !== void 0 ? source : {}), type: 'link', url, children: [] };
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
    if ((first === null || first === void 0 ? void 0 : first.type) === 'text')
        first.text = first.text.replace(/^ +/, '');
    const last = result[result.length - 1];
    if ((last === null || last === void 0 ? void 0 : last.type) === 'text')
        last.text = last.text.replace(/ +$/, '');
    return result.length ? result : [{ type: 'text', text: '' }];
}
function sameMarks(leaf, marks) {
    return MARK_TAGS.every(([mark]) => Boolean(leaf[mark]) === marks.has(mark));
}

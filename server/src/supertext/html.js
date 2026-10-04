"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = void 0;
exports.buildDocument = buildDocument;
exports.parseDocument = parseDocument;
const node_html_parser_1 = require("node-html-parser");
const LINE_BREAK = '\u001E';
const escapeHtml = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
exports.escapeHtml = escapeHtml;
function buildDocument(segments) {
    let html = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n';
    segments.forEach((segment, id) => {
        const content = segment.html
            ? segment.text
            : (0, exports.escapeHtml)(segment.text.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');
        html += `<div data-st-id="${id}">${content}</div>\n`;
    });
    return html + '</body></html>';
}
/** @returns segment index => translated text */
function parseDocument(html, segments) {
    const root = (0, node_html_parser_1.parse)(html, { comment: false, blockTextElements: { script: true, style: true, pre: true } });
    const result = new Map();
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
function plainText(element) {
    const parts = [];
    const walk = (node) => {
        var _a;
        if (node instanceof node_html_parser_1.TextNode) {
            parts.push(node.text);
        }
        else if (node instanceof node_html_parser_1.HTMLElement) {
            if (((_a = node.rawTagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === 'br') {
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

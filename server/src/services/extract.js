"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extract = extract;
exports.populateFor = populateFor;
const blocks_1 = require("../supertext/blocks");
const COPIED_TYPES = new Set([
    'email',
    'enumeration',
    'integer',
    'biginteger',
    'float',
    'decimal',
    'boolean',
    'date',
    'datetime',
    'time',
    'json',
]);
const isTranslatableString = (value) => typeof value === 'string' && value.trim() !== '' && !/^[\d\s.,:/+-]+$/.test(value);
function extract(attributes, source, schema) {
    const jobs = [];
    const uidFields = [];
    const data = walk(attributes, source, schema, jobs, true, uidFields);
    return { data, jobs, uidFields };
}
function walk(attributes, source, schema, jobs, topLevel, uidFields) {
    var _a, _b;
    const data = {};
    for (const [name, attribute] of Object.entries(attributes)) {
        // Non-localized fields are shared across locales; leave them alone.
        if (topLevel && ((_b = (_a = attribute.pluginOptions) === null || _a === void 0 ? void 0 : _a.i18n) === null || _b === void 0 ? void 0 : _b.localized) === false) {
            continue;
        }
        const value = source[name];
        if (value === undefined) {
            continue;
        }
        switch (attribute.type) {
            case 'string':
            case 'text':
            case 'richtext': {
                data[name] = value;
                if (isTranslatableString(value)) {
                    // Markdown (richtext) travels as plain text so its syntax survives.
                    jobs.push({ segment: { text: value, html: false }, apply: (t) => (data[name] = t) });
                }
                break;
            }
            case 'blocks': {
                const blocks = structuredClone(value);
                data[name] = blocks;
                collectBlocks(blocks, jobs);
                break;
            }
            case 'uid': {
                data[name] = value;
                if (topLevel && attribute.targetField) {
                    uidFields.push(name);
                }
                break;
            }
            case 'media': {
                data[name] = Array.isArray(value)
                    ? value.map((file) => file.id)
                    : value
                        ? value.id
                        : null;
                break;
            }
            case 'component': {
                const componentAttributes = schema.component(attribute.component);
                const one = (item) => item ? walk(componentAttributes, item, schema, jobs, false, uidFields) : null;
                data[name] = attribute.repeatable ? (Array.isArray(value) ? value.map(one) : []) : one(value);
                break;
            }
            case 'dynamiczone': {
                data[name] = Array.isArray(value)
                    ? value.map((item) => {
                        const { __component } = item;
                        // Mutate the walked object (don't spread it): the jobs' setters point at it.
                        const entry = walk(schema.component(__component), item, schema, jobs, false, uidFields);
                        return Object.assign(entry, { __component });
                    })
                    : [];
                break;
            }
            default:
                if (COPIED_TYPES.has(attribute.type)) {
                    data[name] = value;
                }
            // relation, password and unknown types are skipped on purpose.
        }
    }
    return data;
}
function collectBlocks(nodes, jobs) {
    if (!Array.isArray(nodes)) {
        return;
    }
    for (const node of nodes) {
        if ((0, blocks_1.isInlineContainer)(node)) {
            if ((0, blocks_1.hasText)(node.children)) {
                const original = node.children;
                jobs.push({
                    segment: { text: (0, blocks_1.inlineToHtml)(original), html: true },
                    apply: (translation) => (node.children = (0, blocks_1.htmlToInline)(translation, original)),
                });
            }
        }
        else if (node && typeof node === 'object' && node.type !== 'code') {
            collectBlocks(node.children, jobs);
        }
    }
}
/** Builds a populate object that loads components, dynamic zones and media. */
function populateFor(attributes, schema, depth = 0) {
    var _a;
    if (depth > 10) {
        return true;
    }
    const populate = {};
    for (const [name, attribute] of Object.entries(attributes)) {
        if (attribute.type === 'media') {
            populate[name] = true;
        }
        else if (attribute.type === 'component') {
            const nested = populateFor(schema.component(attribute.component), schema, depth + 1);
            populate[name] = nested === true || Object.keys(nested).length === 0 ? true : { populate: nested };
        }
        else if (attribute.type === 'dynamiczone') {
            populate[name] = {
                on: Object.fromEntries(((_a = attribute.components) !== null && _a !== void 0 ? _a : []).map((uid) => {
                    const nested = populateFor(schema.component(uid), schema, depth + 1);
                    return [uid, nested === true || Object.keys(nested).length === 0 ? true : { populate: nested }];
                })),
            };
        }
    }
    return populate;
}

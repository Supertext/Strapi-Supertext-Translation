"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationError = void 0;
const client_1 = require("../supertext/client");
const html_1 = require("../supertext/html");
const extract_1 = require("./extract");
class TranslationError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
exports.TranslationError = TranslationError;
const translator = ({ strapi }) => {
    const config = () => strapi.config.get('plugin::supertext');
    const schema = {
        component: (uid) => { var _a, _b; return ((_b = (_a = strapi.components[uid]) === null || _a === void 0 ? void 0 : _a.attributes) !== null && _b !== void 0 ? _b : {}); },
    };
    const client = () => {
        const { apiKey, endpoint, pollIntervalMs, pollTimeoutMs } = config();
        if (!apiKey) {
            throw new TranslationError('No Supertext API key configured. Set SUPERTEXT_API_KEY on the server.', 503);
        }
        return new client_1.SupertextClient({ apiKey, endpoint, pollIntervalMs, pollTimeoutMs });
    };
    const contentType = (uid) => {
        var _a, _b;
        const model = strapi.contentTypes[uid];
        if (!model) {
            throw new TranslationError(`Unknown content type ${uid}.`, 404);
        }
        if (!((_b = (_a = model.pluginOptions) === null || _a === void 0 ? void 0 : _a.i18n) === null || _b === void 0 ? void 0 : _b.localized)) {
            throw new TranslationError('This content type is not localized. Enable internationalization for it first.');
        }
        const allowed = config().contentTypes;
        if (allowed.length && !allowed.includes(uid)) {
            throw new TranslationError('Supertext translation is not enabled for this content type.', 403);
        }
        return model;
    };
    /** Sends the segments in as few documents as possible (one unless > ~900k characters). */
    async function translateJobs(jobs, targetLocale, sourceLocale, api) {
        var _a, _b;
        const options = (_a = config().locales[targetLocale]) !== null && _a !== void 0 ? _a : {};
        const chunks = [];
        let current = [];
        let size = 0;
        for (const job of jobs) {
            const length = job.segment.text.length + 40;
            if (current.length && size + length > client_1.MAX_DOCUMENT_CHARACTERS) {
                chunks.push(current);
                current = [];
                size = 0;
            }
            current.push(job);
            size += length;
        }
        if (current.length)
            chunks.push(current);
        let applied = 0;
        for (const chunk of chunks) {
            const segments = chunk.map((job) => job.segment);
            const translated = await api.translateDocument((0, html_1.buildDocument)(segments), {
                targetLanguage: options.code || targetLocale,
                sourceLanguage: sourceLocale,
                politeness: (_b = options.politeness) !== null && _b !== void 0 ? _b : 'default',
            });
            const parsed = (0, html_1.parseDocument)(translated, segments);
            chunk.forEach((job, index) => {
                const value = parsed.get(index);
                if (value !== undefined && value !== '') {
                    job.apply(value);
                    applied++;
                }
            });
        }
        return applied;
    }
    return {
        status() {
            const { apiKey, endpoint, locales, contentTypes } = config();
            return { configured: Boolean(apiKey), endpoint, locales, contentTypes };
        },
        async testConnection() {
            await client().validate();
        },
        /** Locales that already exist for a document, so callers can warn before overwriting. */
        async existingLocales(uid, documentId) {
            const rows = await strapi.db.query(uid).findMany({
                where: { documentId },
                select: ['locale'],
            });
            return [...new Set(rows.map((row) => row.locale))];
        },
        async translate(request) {
            const { uid, documentId, sourceLocale } = request;
            const model = contentType(uid);
            const targets = [...new Set(request.targetLocales)].filter((locale) => locale && locale !== sourceLocale);
            if (!targets.length) {
                throw new TranslationError('Choose at least one target locale other than the source locale.');
            }
            const api = client();
            const documents = strapi.documents(uid);
            const source = await documents.findOne({
                documentId,
                locale: sourceLocale,
                status: 'draft',
                populate: (0, extract_1.populateFor)(model.attributes, schema),
            });
            if (!source) {
                throw new TranslationError(`No ${sourceLocale} version of this entry found. Save it first.`, 404);
            }
            const existing = await this.existingLocales(uid, documentId);
            const results = [];
            for (const locale of targets) {
                try {
                    // Extract per locale: each target needs its own copy of the data.
                    const { data, jobs, uidFields } = (0, extract_1.extract)(model.attributes, source, schema);
                    const fields = await translateJobs(jobs, locale, sourceLocale, api);
                    const exists = existing.includes(locale);
                    for (const field of uidFields) {
                        if (exists) {
                            delete data[field]; // keep the URL the translation already has
                            continue;
                        }
                        try {
                            data[field] = await strapi
                                .plugin('content-manager')
                                .service('uid')
                                .generateUIDField({ contentTypeUID: uid, field, data, locale });
                        }
                        catch (error) {
                            strapi.log.warn(`[supertext] Could not generate ${field} for ${locale}: ${error.message}`);
                        }
                    }
                    await documents.update({ documentId, locale, data });
                    results.push({ locale, status: exists ? 'updated' : 'created', fields });
                }
                catch (error) {
                    const message = error instanceof client_1.SupertextError || error instanceof TranslationError
                        ? error.message
                        : `Could not save the translation: ${error.message}`;
                    strapi.log.error(`[supertext] ${uid} ${documentId} → ${locale}: ${error.message}`);
                    results.push({ locale, status: 'error', error: message });
                }
            }
            return results;
        },
    };
};
exports.default = translator;

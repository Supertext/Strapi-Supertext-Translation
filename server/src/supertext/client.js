"use strict";
/**
 * Supertext AI file translation (https://api.supertext.com/v1/).
 *
 * Same protocol as the Supertext WordPress and TYPO3 plugins: submit one HTML
 * document, poll its status, download the translation, delete the file.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupertextClient = exports.SupertextError = exports.MAX_DOCUMENT_CHARACTERS = exports.LIVE_ENDPOINT = void 0;
exports.LIVE_ENDPOINT = 'https://api.supertext.com/v1/';
/** Stay well below the API's 1,000,000 character limit per document. */
exports.MAX_DOCUMENT_CHARACTERS = 900000;
class SupertextError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'SupertextError';
    }
}
exports.SupertextError = SupertextError;
class SupertextClient {
    constructor(options) {
        var _a, _b, _c;
        this.options = options;
        if (!options.apiKey) {
            throw new SupertextError('No Supertext API key configured.');
        }
        this.endpoint = (options.endpoint || exports.LIVE_ENDPOINT).replace(/\/+$/, '') + '/';
        this.pollIntervalMs = Math.max(250, (_a = options.pollIntervalMs) !== null && _a !== void 0 ? _a : 2000);
        this.pollTimeoutMs = Math.max(5000, (_b = options.pollTimeoutMs) !== null && _b !== void 0 ? _b : 180000);
        this.fetchFn = (_c = options.fetch) !== null && _c !== void 0 ? _c : fetch;
    }
    /** Translates a complete HTML document and returns the translated HTML. */
    async translateDocument(html, options) {
        const fileId = await this.submit(html, options);
        try {
            await this.waitUntilDone(fileId);
            return await this.download(fileId);
        }
        finally {
            await this.request('DELETE', `translate/ai/file/${encodeURIComponent(fileId)}`).catch(() => undefined);
        }
    }
    /** Cost-free check that the key is valid and the API reachable. */
    async validate() {
        await this.request('GET', 'features');
    }
    async submit(html, options) {
        const form = new FormData();
        form.append('target_lang', options.targetLanguage);
        const source = (options.sourceLanguage || '').split(/[-_]/)[0].toLowerCase();
        if (source) {
            // A full tag like "de-CH" as source is rejected with INVALID_LANGUAGE_PAIR.
            form.append('source_lang', source);
        }
        if (options.politeness === 'more' || options.politeness === 'less') {
            form.append('politeness', options.politeness);
        }
        // The part's type must be exactly "text/html" (no charset), otherwise 415.
        form.append('file', new Blob([html], { type: 'text/html' }), 'content.html');
        const response = await this.request('POST', 'translate/ai/file', form);
        const data = (await response.json().catch(() => ({})));
        if (!data.file_id) {
            throw new SupertextError('Supertext did not return a file id.');
        }
        return data.file_id;
    }
    async waitUntilDone(fileId) {
        const deadline = Date.now() + this.pollTimeoutMs;
        do {
            const response = await this.request('GET', `translate/ai/file/${encodeURIComponent(fileId)}/status`);
            const { status } = (await response.json().catch(() => ({})));
            switch (status) {
                case 'done':
                    return;
                case 'error':
                    throw new SupertextError('Supertext failed to translate the document.');
                case 'limit_exceeded':
                    throw new SupertextError('Your Supertext translation limit is exceeded.');
                case 'deleted':
                    throw new SupertextError('The Supertext file was deleted before it could be downloaded.');
            }
            await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
        } while (Date.now() < deadline);
        throw new SupertextError('Timed out waiting for the Supertext translation.');
    }
    async download(fileId) {
        const response = await this.request('GET', `translate/ai/file/${encodeURIComponent(fileId)}/translation`);
        const body = await response.text();
        if (!body.trim()) {
            throw new SupertextError('The translated document was empty.');
        }
        return body;
    }
    async request(method, path, body) {
        let response;
        try {
            response = await this.fetchFn(this.endpoint + path, {
                method,
                body,
                headers: {
                    Authorization: `Supertext-Auth-Key ${this.options.apiKey}`,
                    Accept: 'application/json',
                },
                signal: AbortSignal.timeout(30000),
            });
        }
        catch (error) {
            throw new SupertextError(`Could not reach Supertext: ${error.message}`);
        }
        if (response.ok) {
            return response;
        }
        const status = response.status;
        let message = status === 401 || status === 403
            ? 'Authentication failed. Please check the Supertext API key.'
            : status === 404
                ? 'The requested Supertext resource was not found.'
                : status === 413
                    ? 'The content is too large for Supertext to translate in one go.'
                    : status === 429
                        ? 'Too many requests to Supertext. Please try again shortly.'
                        : status >= 500
                            ? 'The Supertext service is currently unavailable.'
                            : `Supertext answered with HTTP ${status}.`;
        const detail = (await response.text().catch(() => '')).replace(/<[^>]*>/g, '').trim();
        if (detail) {
            message += ` (${detail.slice(0, 200)})`;
        }
        throw new SupertextError(message, status);
    }
}
exports.SupertextClient = SupertextClient;

/**
 * Supertext AI file translation (https://api.supertext.com/v1/).
 *
 * Same protocol as the Supertext WordPress and TYPO3 plugins: submit one HTML
 * document, poll its status, download the translation, delete the file.
 */

export const LIVE_ENDPOINT = 'https://api.supertext.com/v1/';

/** Stay well below the API's 1,000,000 character limit per document. */
export const MAX_DOCUMENT_CHARACTERS = 900_000;

export type Politeness = 'default' | 'more' | 'less';

export interface ClientOptions {
  apiKey: string;
  endpoint?: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  /** Injected for tests. */
  fetch?: typeof fetch;
}

export interface TranslateOptions {
  /** BCP-47 target, e.g. "de-CH". */
  targetLanguage: string;
  /** Any form ("en", "en-US"); only the primary subtag is sent. Empty = auto-detect. */
  sourceLanguage?: string;
  politeness?: Politeness;
}

export class SupertextError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'SupertextError';
  }
}

export class SupertextClient {
  private readonly endpoint: string;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: ClientOptions) {
    if (!options.apiKey) {
      throw new SupertextError('No Supertext API key configured.');
    }
    this.endpoint = (options.endpoint || LIVE_ENDPOINT).replace(/\/+$/, '') + '/';
    this.pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 2000);
    this.pollTimeoutMs = Math.max(5000, options.pollTimeoutMs ?? 180_000);
    this.fetchFn = options.fetch ?? fetch;
  }

  /** Translates a complete HTML document and returns the translated HTML. */
  async translateDocument(html: string, options: TranslateOptions): Promise<string> {
    const fileId = await this.submit(html, options);
    try {
      await this.waitUntilDone(fileId);
      return await this.download(fileId);
    } finally {
      await this.request('DELETE', `translate/ai/file/${encodeURIComponent(fileId)}`).catch(() => undefined);
    }
  }

  /** Cost-free check that the key is valid and the API reachable. */
  async validate(): Promise<void> {
    await this.request('GET', 'features');
  }

  private async submit(html: string, options: TranslateOptions): Promise<string> {
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
    const data = (await response.json().catch(() => ({}))) as { file_id?: string };
    if (!data.file_id) {
      throw new SupertextError('Supertext did not return a file id.');
    }
    return data.file_id;
  }

  private async waitUntilDone(fileId: string): Promise<void> {
    const deadline = Date.now() + this.pollTimeoutMs;
    do {
      const response = await this.request('GET', `translate/ai/file/${encodeURIComponent(fileId)}/status`);
      const { status } = (await response.json().catch(() => ({}))) as { status?: string };
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

  private async download(fileId: string): Promise<string> {
    const response = await this.request('GET', `translate/ai/file/${encodeURIComponent(fileId)}/translation`);
    const body = await response.text();
    if (!body.trim()) {
      throw new SupertextError('The translated document was empty.');
    }
    return body;
  }

  private async request(method: string, path: string, body?: FormData): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint + path, {
        method,
        body,
        headers: {
          Authorization: authHeader(this.options.apiKey),
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new SupertextError(`Could not reach Supertext: ${(error as Error).message}`);
    }
    if (response.ok) {
      return response;
    }
    const status = response.status;
    let message =
      status === 401 || status === 403
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

/**
 * The Authorization header value. Accepts the key with or without the
 * `Supertext-Auth-Key ` prefix (Supertext shows it with the prefix).
 */
export function authHeader(apiKey: string): string {
  return `Supertext-Auth-Key ${apiKey.trim().replace(/^Supertext-Auth-Key\s+/i, '')}`;
}

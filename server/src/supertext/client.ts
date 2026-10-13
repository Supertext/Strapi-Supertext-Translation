/**
 * Supertext AI file translation (https://api.supertext.com/v1/) through the shared
 * Supertext SDK: submit one HTML document, poll its status, download the
 * translation, delete the file. No Strapi imports here (tested on its own).
 */
import {
  LIVE_BASE_URL,
  SupertextClient as SdkClient,
  SupertextError as SdkError,
  type FetchLike,
} from '../vendor/supertext-sdk/index';

export const LIVE_ENDPOINT = LIVE_BASE_URL;

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
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface TranslateOptions {
  /** Any form ("de", "de_ch"); sent as a regional code. */
  targetLanguage: string;
  /** Any form ("en", "en-US"); sent as the bare language. Empty = auto-detect. */
  sourceLanguage?: string;
  politeness?: Politeness;
}

/**
 * `code` and `values` let the admin panel show the message in the user's
 * interface language (keys `error.<code>` in admin/src/translations); `message`
 * is the English text for logs and API clients.
 */
export class SupertextError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly values: Record<string, string | number> = {}
  ) {
    super(message);
    this.name = 'SupertextError';
  }
}

/** SDK error code → this plugin's code (admin key `error.<code>`) and English message. */
const ERRORS: Record<string, [string, string]> = {
  missing_api_key: ['notConfigured', 'No Supertext API key configured.'],
  authentication_failure: [
    'authFailed',
    'Authentication failed. Please check the Supertext API key. No Supertext account yet? Create one at https://www.supertext.com/person/en/account/signin. Generate your API key at https://www.supertext.com/en/integrations/api (supertext.com → Integrations → API; requires the Admin role).',
  ],
  invalid_language_pair: ['invalidLanguagePair', 'Supertext does not support this language pair.'],
  not_found: ['notFound', 'The requested Supertext resource was not found.'],
  payload_too_large: ['tooLarge', 'The content is too large for Supertext to translate in one go.'],
  too_many_requests: ['rateLimited', 'Too many requests to Supertext. Please try again shortly.'],
  service_unavailable: ['unavailable', 'The Supertext service is currently unavailable.'],
  unexpected_status: ['http', 'Supertext answered with an unexpected HTTP status.'],
  transport_error: ['unreachable', 'Could not reach Supertext.'],
  no_file_id: ['noFileId', 'Supertext did not return a file id.'],
  translation_error: ['failed', 'Supertext failed to translate the document.'],
  quota_exceeded: ['limitExceeded', 'Your Supertext translation limit is exceeded.'],
  file_deleted: ['fileDeleted', 'The Supertext file was deleted before it could be downloaded.'],
  timeout: ['timeout', 'Timed out waiting for the Supertext translation.'],
  incomplete_response: ['emptyTranslation', 'The translated document was empty.'],
};

/** The SDK's error as this plugin's SupertextError (code and values for the admin panel). */
export function fromSdkError(error: SdkError): SupertextError {
  const [code, english] = ERRORS[error.code] ?? ['unknown', error.message];
  const values: Record<string, string | number> = {};
  if (code === 'http' && error.status) values.status = error.status;
  if (error.detail) values.detail = error.detail;
  if (code === 'invalidLanguagePair') values.detail = `${error.sourceLang ?? '?'} → ${error.targetLang ?? '?'}`;
  const message = code === 'http' && error.status ? `Supertext answered with HTTP ${error.status}.` : english;
  return new SupertextError(values.detail ? `${message} (${values.detail})` : message, error.status, code, values);
}

/**
 * The plugin's access to the Supertext AI file translation API, built on the shared
 * Supertext SDK (server/src/vendor/supertext-sdk, compiled with the plugin). The SDK does
 * the protocol (upload, polling, download, cleanup also after errors), the auth header
 * (a pasted `Supertext-Auth-Key ` prefix is stripped), HTTP 429 retries and the
 * language codes (bare source, regional target).
 */
export class SupertextClient {
  private readonly sdk: SdkClient;

  constructor(options: ClientOptions) {
    if (!options.apiKey) {
      throw new SupertextError('No Supertext API key configured.', undefined, 'notConfigured');
    }
    const pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 2000);
    this.sdk = new SdkClient(options.apiKey, {
      baseUrl: options.endpoint || LIVE_ENDPOINT,
      pollIntervalMs,
      timeoutMs: Math.max(5000, options.pollTimeoutMs ?? 180_000),
      userAgent: 'strapi-plugin-supertext-translation',
      ...(options.fetch ? { fetch: options.fetch as unknown as FetchLike } : {}),
      ...(options.sleep ? { sleep: options.sleep } : {}),
    });
  }

  /** Translates a complete HTML document and returns the translated HTML. */
  async translateDocument(html: string, options: TranslateOptions): Promise<string> {
    try {
      return await this.sdk.translateHtml(html, options.targetLanguage, {
        sourceLang: options.sourceLanguage || null,
        politeness: options.politeness ?? 'default',
      });
    } catch (error) {
      throw error instanceof SdkError ? fromSdkError(error) : error;
    }
  }

  /** Cost-free check that the key is valid and the API reachable. */
  async validate(): Promise<void> {
    try {
      await this.sdk.validateApiKey();
    } catch (error) {
      throw error instanceof SdkError ? fromSdkError(error) : error;
    }
  }
}

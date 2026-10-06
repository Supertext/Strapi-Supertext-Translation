import type { Core } from '@strapi/strapi';
import type { PluginConfig } from '../config';
import { MAX_DOCUMENT_CHARACTERS, SupertextClient, SupertextError } from '../supertext/client';
import { buildDocument, parseDocument, type Segment } from '../supertext/html';
import { extract, populateFor, type Attributes, type Job, type SchemaLookup } from './extract';

export interface TranslateRequest {
  uid: string;
  documentId: string;
  sourceLocale: string;
  targetLocales: string[];
}

export interface LocaleResult {
  locale: string;
  status: 'created' | 'updated' | 'error';
  fields?: number;
  error?: string;
}

export class TranslationError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

const translator = ({ strapi }: { strapi: Core.Strapi }) => {
  const config = (): PluginConfig => strapi.config.get('plugin::supertext') as PluginConfig;

  const schema: SchemaLookup = {
    component: (uid) => ((strapi.components as unknown as Record<string, { attributes: Attributes }>)[uid]?.attributes ?? {}),
  };

  const client = () => {
    const { apiKey, endpoint, pollIntervalMs, pollTimeoutMs } = config();
    if (!apiKey) {
      throw new TranslationError('No Supertext API key configured. Set SUPERTEXT_API_KEY on the server. Generate a key at https://www.supertext.com/en/integrations/api (requires the Admin role in your Supertext account).', 503);
    }
    return new SupertextClient({ apiKey, endpoint, pollIntervalMs, pollTimeoutMs });
  };

  const contentType = (uid: string) => {
    const model = strapi.contentTypes[uid as keyof typeof strapi.contentTypes] as
      | { attributes: Attributes; pluginOptions?: { i18n?: { localized?: boolean } } }
      | undefined;
    if (!model) {
      throw new TranslationError(`Unknown content type ${uid}.`, 404);
    }
    if (!model.pluginOptions?.i18n?.localized) {
      throw new TranslationError('This content type is not localized. Enable internationalization for it first.');
    }
    const allowed = config().contentTypes;
    if (allowed.length && !allowed.includes(uid)) {
      throw new TranslationError('Supertext translation is not enabled for this content type.', 403);
    }
    return model;
  };

  /** Sends the segments in as few documents as possible (one unless > ~900k characters). */
  async function translateJobs(jobs: Job[], targetLocale: string, sourceLocale: string, api: SupertextClient) {
    const options = config().locales[targetLocale] ?? {};
    const chunks: Job[][] = [];
    let current: Job[] = [];
    let size = 0;
    for (const job of jobs) {
      const length = job.segment.text.length + 40;
      if (current.length && size + length > MAX_DOCUMENT_CHARACTERS) {
        chunks.push(current);
        current = [];
        size = 0;
      }
      current.push(job);
      size += length;
    }
    if (current.length) chunks.push(current);

    let applied = 0;
    for (const chunk of chunks) {
      const segments: Segment[] = chunk.map((job) => job.segment);
      const translated = await api.translateDocument(buildDocument(segments), {
        targetLanguage: options.code || targetLocale,
        sourceLanguage: sourceLocale,
        politeness: options.politeness ?? 'default',
      });
      const parsed = parseDocument(translated, segments);
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
    async existingLocales(uid: string, documentId: string): Promise<string[]> {
      const rows = await strapi.db.query(uid as never).findMany({
        where: { documentId },
        select: ['locale'],
      });
      return [...new Set(rows.map((row: { locale: string }) => row.locale))];
    },

    async translate(request: TranslateRequest): Promise<LocaleResult[]> {
      const { uid, documentId, sourceLocale } = request;
      const model = contentType(uid);
      const targets = [...new Set(request.targetLocales)].filter((locale) => locale && locale !== sourceLocale);
      if (!targets.length) {
        throw new TranslationError('Choose at least one target locale other than the source locale.');
      }
      const api = client();
      const documents = strapi.documents(uid as never);

      const source = await documents.findOne({
        documentId,
        locale: sourceLocale,
        status: 'draft',
        populate: populateFor(model.attributes, schema) as never,
      } as never);
      if (!source) {
        throw new TranslationError(`No ${sourceLocale} version of this entry found. Save it first.`, 404);
      }
      const existing = await this.existingLocales(uid, documentId);

      const results: LocaleResult[] = [];
      for (const locale of targets) {
        try {
          // Extract per locale: each target needs its own copy of the data.
          const { data, jobs, uidFields } = extract(model.attributes, source as Record<string, unknown>, schema);
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
            } catch (error) {
              strapi.log.warn(`[supertext] Could not generate ${field} for ${locale}: ${(error as Error).message}`);
            }
          }

          await documents.update({ documentId, locale, data } as never);
          results.push({ locale, status: exists ? 'updated' : 'created', fields });
        } catch (error) {
          const message =
            error instanceof SupertextError || error instanceof TranslationError
              ? error.message
              : `Could not save the translation: ${(error as Error).message}`;
          strapi.log.error(`[supertext] ${uid} ${documentId} → ${locale}: ${(error as Error).message}`);
          results.push({ locale, status: 'error', error: message });
        }
      }
      return results;
    },
  };
};

export default translator;
export type TranslatorService = ReturnType<typeof translator>;

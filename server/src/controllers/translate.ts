import type { Core } from '@strapi/strapi';
import { TranslationError, type TranslatorService } from '../services/translator';
import { SupertextClient, SupertextError } from '../supertext/client';
import { siteUrl } from '../reporting';
import type { ReportingService } from '../services/reporting';

type Ctx = {
  request: { body?: Record<string, unknown>; origin?: string };
  set?(headers: Record<string, string>): void;
  query: Record<string, unknown>;
  state: { userAbility: unknown };
  body: unknown;
  status: number;
  forbidden(message?: string, details?: unknown): void;
  badRequest(message?: string, details?: unknown): void;
};

const controller = ({ strapi }: { strapi: Core.Strapi }) => {
  const translator = () => strapi.plugin('supertext').service('translator') as TranslatorService;
  const reporting = () => strapi.plugin('supertext').service('reporting') as ReportingService;
  /** The site's base URL: `server.url` if absolute, else the origin of this request. */
  const site = (ctx: Ctx) => siteUrl(strapi.config.get('server.url'), ctx.request?.origin);

  const checker = (ctx: Ctx, model: string) =>
    strapi.plugin('content-manager').service('permission-checker').create({ userAbility: ctx.state.userAbility, model });

  const fail = (ctx: Ctx, error: unknown) => {
    if (error instanceof TranslationError || error instanceof SupertextError) {
      ctx.status = error instanceof TranslationError ? error.status : 502;
      ctx.body = { error: { message: error.message, details: { code: error.code, values: error.values } } };
      return;
    }
    strapi.log.error(`[supertext] ${(error as Error).stack ?? error}`);
    ctx.status = 502;
    ctx.body = { error: { message: (error as Error).message } };
  };

  return {
    async status(ctx: Ctx) {
      // Version report and key check in the background (back-end request that runs the plugin's code).
      reporting().inBackground('onRequest', site(ctx));
      ctx.body = {
        ...translator().status(),
        languages: await translator().languages(),
        reports: { enabled: reporting().enabled(), check: await reporting().lastCheck() },
      };
    },

    /** The automatic key check (always HTTP 200: a 401 would sign the admin out); reports a changed status. */
    async testConnection(ctx: Ctx) {
      try {
        const result = await reporting().run('testConnection', site(ctx));
        const { apiKey, endpoint } = strapi.config.get('plugin::supertext') as { apiKey?: string; endpoint?: string };
        const check = result?.check ?? (await SupertextClient.checkApiKey(apiKey ?? '', endpoint));
        ctx.body = { ok: check.status === 'ok', check };
      } catch (error) {
        fail(ctx, error);
      }
    },

    /** Public (no login): the Commando Center checks that the site is reachable. 404 while reports are off. */
    ping(ctx: Ctx) {
      const answer = reporting().ping(ctx.query.challenge);
      ctx.status = answer.status;
      ctx.set?.(answer.headers);
      ctx.body = answer.body;
    },

    async locales(ctx: Ctx) {
      const model = String(ctx.query.model ?? '');
      const documentId = String(ctx.query.documentId ?? '');
      if (!model || !documentId) {
        return ctx.badRequest('model and documentId are required');
      }
      if (checker(ctx, model).cannot.read()) {
        return ctx.forbidden();
      }
      ctx.body = { locales: await translator().existingLocales(model, documentId) };
    },

    async translate(ctx: Ctx) {
      const body = ctx.request.body ?? {};
      const model = String(body.model ?? '');
      const documentId = String(body.documentId ?? '');
      const sourceLocale = String(body.sourceLocale ?? '');
      const targetLocales = Array.isArray(body.targetLocales) ? body.targetLocales.map(String) : [];
      if (!model || !documentId || !sourceLocale || !targetLocales.length) {
        return ctx.badRequest('model, documentId, sourceLocale and targetLocales are required');
      }

      // Same rules as the Content Manager: read the source locale, write each target locale.
      const permissions = checker(ctx, model);
      if (permissions.cannot.read({ locale: sourceLocale })) {
        return ctx.forbidden(`You may not read the ${sourceLocale} version.`, {
          code: 'forbiddenRead',
          values: { locale: sourceLocale },
        });
      }
      const denied = targetLocales.filter(
        (locale: string) => permissions.cannot.update({ locale }) && permissions.cannot.create({ locale })
      );
      if (denied.length) {
        return ctx.forbidden(`You may not edit these locales: ${denied.join(', ')}`, {
          code: 'forbiddenEdit',
          values: { locales: denied.join(', ') },
        });
      }

      try {
        const results = await translator().translate({ uid: model, documentId, sourceLocale, targetLocales });
        const rejected = results.find((r) => r.code === 'authFailed');
        if (rejected) reporting().inBackground('authenticationFailed', site(ctx), rejected.httpStatus ?? 401);
        else reporting().inBackground('onRequest', site(ctx));
        ctx.body = { results };
      } catch (error) {
        fail(ctx, error);
      }
    },
  };
};

export default controller;

import type { Core } from '@strapi/strapi';
import { TranslationError, type TranslatorService } from '../services/translator';

type Ctx = {
  request: { body?: Record<string, unknown> };
  query: Record<string, unknown>;
  state: { userAbility: unknown };
  body: unknown;
  status: number;
  forbidden(message?: string): void;
  badRequest(message?: string): void;
};

const controller = ({ strapi }: { strapi: Core.Strapi }) => {
  const translator = () => strapi.plugin('supertext').service('translator') as TranslatorService;

  const checker = (ctx: Ctx, model: string) =>
    strapi.plugin('content-manager').service('permission-checker').create({ userAbility: ctx.state.userAbility, model });

  const fail = (ctx: Ctx, error: unknown) => {
    if (error instanceof TranslationError) {
      ctx.status = error.status;
      ctx.body = { error: { message: error.message } };
      return;
    }
    strapi.log.error(`[supertext] ${(error as Error).stack ?? error}`);
    ctx.status = 502;
    ctx.body = { error: { message: (error as Error).message } };
  };

  return {
    status(ctx: Ctx) {
      ctx.body = translator().status();
    },

    async testConnection(ctx: Ctx) {
      try {
        await translator().testConnection();
        ctx.body = { ok: true };
      } catch (error) {
        fail(ctx, error);
      }
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
        return ctx.forbidden(`You may not read the ${sourceLocale} version.`);
      }
      const denied = targetLocales.filter(
        (locale: string) => permissions.cannot.update({ locale }) && permissions.cannot.create({ locale })
      );
      if (denied.length) {
        return ctx.forbidden(`You may not edit these locales: ${denied.join(', ')}`);
      }

      try {
        const results = await translator().translate({ uid: model, documentId, sourceLocale, targetLocales });
        ctx.body = { results };
      } catch (error) {
        fail(ctx, error);
      }
    },
  };
};

export default controller;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const translator_1 = require("../services/translator");
const controller = ({ strapi }) => {
    const translator = () => strapi.plugin('supertext').service('translator');
    const checker = (ctx, model) => strapi.plugin('content-manager').service('permission-checker').create({ userAbility: ctx.state.userAbility, model });
    const fail = (ctx, error) => {
        var _a;
        if (error instanceof translator_1.TranslationError) {
            ctx.status = error.status;
            ctx.body = { error: { message: error.message } };
            return;
        }
        strapi.log.error(`[supertext] ${(_a = error.stack) !== null && _a !== void 0 ? _a : error}`);
        ctx.status = 502;
        ctx.body = { error: { message: error.message } };
    };
    return {
        status(ctx) {
            ctx.body = translator().status();
        },
        async testConnection(ctx) {
            try {
                await translator().testConnection();
                ctx.body = { ok: true };
            }
            catch (error) {
                fail(ctx, error);
            }
        },
        async locales(ctx) {
            var _a, _b;
            const model = String((_a = ctx.query.model) !== null && _a !== void 0 ? _a : '');
            const documentId = String((_b = ctx.query.documentId) !== null && _b !== void 0 ? _b : '');
            if (!model || !documentId) {
                return ctx.badRequest('model and documentId are required');
            }
            if (checker(ctx, model).cannot.read()) {
                return ctx.forbidden();
            }
            ctx.body = { locales: await translator().existingLocales(model, documentId) };
        },
        async translate(ctx) {
            var _a, _b, _c, _d;
            const body = (_a = ctx.request.body) !== null && _a !== void 0 ? _a : {};
            const model = String((_b = body.model) !== null && _b !== void 0 ? _b : '');
            const documentId = String((_c = body.documentId) !== null && _c !== void 0 ? _c : '');
            const sourceLocale = String((_d = body.sourceLocale) !== null && _d !== void 0 ? _d : '');
            const targetLocales = Array.isArray(body.targetLocales) ? body.targetLocales.map(String) : [];
            if (!model || !documentId || !sourceLocale || !targetLocales.length) {
                return ctx.badRequest('model, documentId, sourceLocale and targetLocales are required');
            }
            // Same rules as the Content Manager: read the source locale, write each target locale.
            const permissions = checker(ctx, model);
            if (permissions.cannot.read({ locale: sourceLocale })) {
                return ctx.forbidden(`You may not read the ${sourceLocale} version.`);
            }
            const denied = targetLocales.filter((locale) => permissions.cannot.update({ locale }) && permissions.cannot.create({ locale }));
            if (denied.length) {
                return ctx.forbidden(`You may not edit these locales: ${denied.join(', ')}`);
            }
            try {
                const results = await translator().translate({ uid: model, documentId, sourceLocale, targetLocales });
                ctx.body = { results };
            }
            catch (error) {
                fail(ctx, error);
            }
        },
    };
};
exports.default = controller;

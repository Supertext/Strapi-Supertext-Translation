"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const policies = ['admin::isAuthenticatedAdmin'];
exports.default = () => ({
    type: 'admin',
    routes: [
        { method: 'GET', path: '/status', handler: 'translate.status', config: { policies } },
        { method: 'POST', path: '/test-connection', handler: 'translate.testConnection', config: { policies } },
        { method: 'GET', path: '/locales', handler: 'translate.locales', config: { policies } },
        { method: 'POST', path: '/translate', handler: 'translate.translate', config: { policies } },
    ],
});

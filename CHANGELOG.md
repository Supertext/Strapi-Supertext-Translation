# Changelog

## Unreleased

- Added: support for Node.js 24 (the current LTS version), tested in CI next to Node 20 and 22.
- Changed: **languages are no longer guessed.** A Strapi locale that is a Supertext code (`de-CH`, `fr-CH`, `es`, `zh-Hans`, apart from case and `_`/`-`) is used as it is; every other locale needs its Supertext code in the plugin's `locales` setting (`code`, the language mapping, e.g. `de: { code: 'de-CH' }`). The default regions are gone: they were wrong for most languages (Supertext wants `es`, `sl`, `nl` without region and `zh-Hans` instead of `zh-CN`). An unmapped locale gets the message *has no Supertext language yet* and nothing is sent for it; the settings page marks it *Not mapped*. Formal/informal set for a language Supertext offers no tone for (e.g. English) is reported as *no formal or informal tone* instead of being sent, and the settings page warns about it. Both messages in English, German, French and Italian.
- Added: automatic API key check when the key is new or changed, on *Test connection* and when Supertext rejects the key during a translation. The settings page shows the latest result with its time (*the connection works*, *rejected*, *no key*, *Supertext can't be reached*, *error*) in all four languages; *Test connection* now shows it there instead of a notification.
- Added: *Send version information to Supertext* (config option `versionReports`, on by default; `SUPERTEXT_VERSION_REPORTS=0` turns it off too): after an update and when the key check result changes, the plugin sends the site URL, the plugin, Strapi, Node.js and SDK versions, whether a key is set, the key check result and the ping address to Supertext. No content, no API key and no personal data. Shown on the settings page. State is kept in Strapi's core store.
- Added: public ping endpoint `GET /api/supertext/ping` that only echoes Supertext's challenge, so Supertext can check the site is reachable (404 with version reports off).
- Fixed: bundled Supertext SDK 0.2.1 (commit `eeba8fa`): one `code` per locale serves both directions; a mapped locale is sent as a source in its source form (`de-CH` → `de`), so English as the source no longer fails with `en: { code: 'en-US' }`.
- Changed: bundled Supertext SDK 0.2.0 (commit `c66cb4d`, `v1` namespace): the key check, version reports and the API's language list. `POST /supertext/test-connection` returns the key check (`{ ok, check }`) instead of an error for a rejected key; `GET /supertext/status` also lists the locales with their Supertext codes and the reporting state.
- Changed: the connection to Supertext now uses the shared [Supertext SDK](https://github.com/Supertext/Supertext-API-SDK-and-Guide) (TypeScript SDK 0.1.0), bundled into the plugin, so nothing else needs installing. Translation works as before; an unsupported language pair now has its own message (*Supertext does not support this language pair*) in all four languages, and the file at Supertext is also deleted after errors. An unknown language (e.g. `xx-YY`) is now reported as an unsupported language pair too, not as "resource not found" (Supertext answers it with HTTP 404).
- Tested with Strapi 5.57 (development setup and demo moved from 5.56.0, with updated dependencies that fix known vulnerabilities).
- Added: French and Italian interface (and German where it was missing): the panel, settings page and error messages follow the user's Strapi interface language. The demo offers German, French and Italian as interface languages.
- The *No API key* and *Authentication failed* messages now link to both Supertext account signup and API key generation.
- The settings page shows the installed plugin version, linked to its release notes on GitHub.
- The source language is sent without region (`en-US` → `en`, from its `code` setting if there is one), and the settings page shows the code actually sent for each locale.

## 0.1.0 — 2026-10-07

- First version for Strapi 5: **Supertext translation** panel in the Content Manager's edit view to translate the saved entry into one or more locales.
- Translates string, text, Markdown and Blocks fields, including inside components and dynamic zones; copies other localized values and media; skips relations and shared fields.
- One Supertext AI file-translation request per target locale; results saved as drafts; slugs generated for new locales and kept for replaced ones.
- Per-locale Supertext code and politeness, content-type allow-list, permission checks per locale.
- Settings page with configuration overview and connection test.
- Demo Strapi app, Dockerfile and Railway configuration; mock Supertext API for local testing.
- Installation guide, user guide and developer guide.
- The settings page, setup warnings and the *Authentication failed* error now link to Supertext account signup and API key generation (supertext.com → Integrations → API, requires the Admin role); same links in the README and installation guide.
- Fix: translating into several languages at once no longer fails with *Too many requests*: requests that hit Supertext's per-second rate limit are retried automatically.
- Fix: the API key now works whether it is entered with or without the `Supertext-Auth-Key ` prefix Supertext shows it with.
- Docs: screenshots in the user and installation guides, regenerated with `npm run docs:screenshots`.
- Demo: optional `DEMO_ADMIN_*` / `DEMO_EDITOR_*` variables create admin accounts on startup; the Editor role gets all demo locales.
- Demo: `better-sqlite3` is now optional, so the Railway image (PostgreSQL, no build tools) installs cleanly.

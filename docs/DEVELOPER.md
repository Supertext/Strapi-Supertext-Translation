# Developer guide — Supertext Translation for Strapi

How the plugin is built, how to work on it, and how it's tested, released and deployed.

## Repository layout

```
admin/src/                 Admin panel (React)
  index.ts                 Registers the edit-view side panel and the settings page
  components/SupertextPanel.tsx
  pages/Settings.tsx
  translations/{en,de}.json
server/src/                Server (Koa) part
  config/index.ts          Defaults + validation of plugin config
  routes/admin/index.ts    /supertext/* admin routes
  controllers/translate.ts Permission checks, request handling
  services/translator.ts   Orchestration: load source, translate per locale, save
  services/extract.ts      Pure schema walk: data for the target + text segments
  supertext/client.ts      Supertext AI file translation API client
  supertext/html.ts        Pack/unpack segments into one HTML document
  supertext/blocks.ts      Strapi "blocks" inline nodes <-> HTML
test/                      Vitest unit tests + mock Supertext API
demo/                      Strapi 5 demo app (Article type, Swiss locales, sample entry)
Dockerfile, railway.json   Demo image for Railway
```

## How a translation runs

```
Editor clicks "Translate with Supertext" (SupertextPanel)
  → POST /supertext/translate { model, documentId, sourceLocale, targetLocales }
      controller: Content Manager permission checker
        read(sourceLocale) and create|update(each target locale), else 403
      translator.translate()
        source = documents(uid).findOne({ documentId, locale, status: 'draft', populate })
                 populate = populateFor(schema): media, components, dynamic zones (deep)
        for each target locale:
          extract(schema, source) → { data, jobs, uidFields }
          translateJobs(): all segments → ONE HTML document (split > 900k chars)
                           → Supertext → parse → job.apply() writes into data
          uid fields: new locale → content-manager uid service from translated target field
                      existing locale → keep its current slug
          documents(uid).update({ documentId, locale, data })   // creates or replaces the draft
      ← { results: [{ locale, status: created|updated|error, fields, error? }] }
```

`extract()` rules (see `services/extract.ts`):

| Attribute | Handling |
| --- | --- |
| `string`, `text`, `richtext` | Plain-text segment (Markdown syntax survives). Skipped if empty or purely numeric. |
| `blocks` | Each paragraph/heading/quote/list-item becomes an HTML segment with `<strong> <em> <u> <s> <code> <a href>`; code blocks are skipped. |
| `component`, `dynamiczone` | Recursed; `id`s dropped so new component rows are created; `__component` kept. |
| `media` | Copied as file ids. |
| `uid` | Copied, then regenerated (see above). |
| numbers, booleans, dates, enumerations, email, json | Copied. |
| `relation`, `password` | Skipped. |
| Top-level fields with `pluginOptions.i18n.localized: false` | Skipped (shared across locales). |

## Supertext API protocol

Shared with the WordPress and TYPO3 plugins:

1. `POST {base}translate/ai/file` — multipart: `file` (part type exactly `text/html`, no charset, else 415), `target_lang` (BCP-47, e.g. `de-CH`), optional `source_lang` (primary subtag only, e.g. `en`), optional `politeness` (`more`/`less`) → `{ file_id }`
2. `GET …/{file_id}/status` until `done` (`error`, `limit_exceeded`, `deleted` are terminal)
3. `GET …/{file_id}/translation` → translated HTML
4. `DELETE …/{file_id}` (files also expire after 24 h)

Header: `Authorization: Supertext-Auth-Key <key>`. The key may be configured with or without the `Supertext-Auth-Key ` prefix; the client strips it and always sends exactly one. The header name must be `Authorization` (the live API answers 403 to `Authentication`). Each segment travels as `<div data-st-id="N">…</div>`; plain text is escaped with line breaks as `<br>`.

## Admin API

All routes require an authenticated admin (`admin::isAuthenticatedAdmin`).

| Route | Purpose |
| --- | --- |
| `GET /supertext/status` | `{ configured, endpoint, locales, contentTypes }` (never the key) |
| `POST /supertext/test-connection` | Validates the key (`GET features`, no cost) |
| `GET /supertext/locales?model=&documentId=` | Locales that exist for a document |
| `POST /supertext/translate` | See above |

## Local development

```bash
npm ci
npm test                 # unit tests (vitest)
npm run test:ts:back     # type-check server
npm run test:ts:front    # type-check admin
npm run build            # dist/ via @strapi/sdk-plugin

# Run the demo against the mock API
npm run mock &           # http://localhost:8765/v1/, key "test-key"
cp demo/.env.example demo/.env
npm run demo:install     # build + pack the plugin, install it into demo/
cd demo && npm run develop
```

Without `DATABASE_URL` the demo uses SQLite via `better-sqlite3`, an optional dependency: it's skipped where it can't be installed (e.g. the Railway image, which uses PostgreSQL). If SQLite fails to load locally, run `npm --prefix demo rebuild better-sqlite3`.

The mock "translates" by prefixing every text node with `[<target>] `, which makes it easy to see which fields were translated. Point `SUPERTEXT_API_KEY`/`SUPERTEXT_API_ENDPOINT` in `demo/.env` at the real API to test for real.

Why a tarball instead of `npm link`? Linking makes the plugin load its own copy of React and the design system, which breaks the admin panel. `npm install ./plugin.tgz` puts the plugin inside `demo/node_modules` so it shares the demo's dependencies. Install the tarball explicitly (as `demo:install` does): with an unchanged version number, a plain `npm install` keeps the old copy.

## Tests

| File | Covers |
| --- | --- |
| `test/html.test.ts` | Segment packing round trip (escaping, line breaks, Unicode, Markdown) |
| `test/blocks.test.ts` | Blocks inline ↔ HTML (marks, links, line breaks) |
| `test/extract.test.ts` | Field selection, copying, ids, dynamic zones, populate tree |
| `test/client.test.ts` | API call sequence, form fields, errors, cleanup |

CI (`.github/workflows/ci.yml`) runs type checks, tests and the build on Node 20 and 22, then builds the demo admin panel with the packed plugin.

The end-to-end flow (translate, overwrite, permissions, error responses, admin panel UI) was verified manually against the demo and the mock API; there are no automated end-to-end tests yet.

## Docs screenshots

The screenshots in `docs/images/` come from the local demo and are regenerated with one script whenever the panel, settings page or demo content changes:

```bash
npm run docs:mock &        # stand-in API that returns real German for the sample article
npm run demo:install
cd demo && rm -rf .tmp && DEMO_ADMIN_EMAIL=anna.muster@example.com DEMO_ADMIN_PASSWORD=Docs12345 \
  SUPERTEXT_API_KEY=test-key SUPERTEXT_API_ENDPOINT=http://127.0.0.1:8765/v1/ npm run develop &
cd .. && npx playwright install chromium   # once
npm run docs:screenshots
```

Start from an empty demo database (`rm -rf demo/.tmp`) so the first translation shows as *created*. The script logs in with `DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD` (the defaults above are local-only), captures the edit view, the panel before/after translating, the German result, the overwrite warning, the settings page and the locales page, and shows the live endpoint on the settings screenshot instead of the local stand-in's address.

## Demo deployment (Railway)

The Railway service `Strapi` in project `supertext-cms-demos` builds this repo's `Dockerfile` on every push to `main`. The image builds the plugin, installs it into `demo/`, builds the admin panel and runs `strapi start`.

Service variables: `DATABASE_URL` (from the Postgres service), `APP_KEYS`, `ADMIN_JWT_SECRET`, `API_TOKEN_SALT`, `TRANSFER_TOKEN_SALT`, `JWT_SECRET`, `ENCRYPTION_KEY`, and `SUPERTEXT_API_KEY` (set by hand in the Railway dashboard). Uploads live on the volume mounted at `/app/public/uploads`.

Optional variables that make a fresh demo ready to use without registering in the browser (set them in the Railway dashboard; never commit them):

| Variable | Effect |
| --- | --- |
| `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` | Creates a Super Admin on startup |
| `DEMO_EDITOR_EMAIL`, `DEMO_EDITOR_PASSWORD` | Creates an Editor, e.g. for automated tests |

Accounts are only created if they don't exist yet; an existing account's password is never changed by these variables (change it in the admin panel instead). Passwords must follow Strapi's rule (8+ characters, upper- and lower-case letter, number), otherwise the account is skipped with a warning in the log.

On every start the demo also ensures the locales de-CH, fr-CH and it-CH, gives Strapi's Editor role access to all locales (Strapi doesn't grant locales added later to existing roles), and creates one English sample article if none exists (`demo/src/index.js`).

## Releasing

1. Bump `version` in `package.json`.
2. Move the *Unreleased* entries in `CHANGELOG.md` under the new version.
3. Tag `vX.Y.Z` on `main`. (Publishing to npm: `npm publish` once the package name is registered.)

## Known limitations / roadmap

- Translation runs inside the request; very large entries may hit proxy timeouts. Planned: background jobs with progress.
- Relations are not set on new translations.
- No bulk translation from the list view yet.
- No automatic translation on save/publish yet.
- Human (professional) translation orders are not supported (the WordPress plugin has them).
- Not yet tested against the live Supertext API.

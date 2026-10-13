# Developer guide — Supertext Translation for Strapi

How the plugin is built, how to work on it, and how it's tested, released and deployed.

## Repository layout

```
admin/src/                 Admin panel (React)
  index.ts                 Registers the edit-view side panel and the settings page
  components/SupertextPanel.tsx
  pages/Settings.tsx
  translations/{en,de,fr,it}.json  Admin strings (react-intl), incl. error.<code> messages
  utils/errorText.ts       Server error code → message in the user's language
server/src/                Server (Koa) part
  config/index.ts          Defaults + validation of plugin config
  routes/admin/index.ts    /supertext/* admin routes
  controllers/translate.ts Permission checks, request handling
  services/translator.ts   Orchestration: load source, translate per locale, save
  services/extract.ts      Pure schema walk: data for the target + text segments
  supertext/client.ts      the plugin's Supertext client on top of the Supertext SDK; SDK error codes → plugin codes
  supertext/languages.ts   Strapi locale → Supertext code (the SDK's LanguageCodes)
  vendor/supertext-sdk/    Supertext SDK sources (TypeScript), bundled with the server; see *Supertext SDK*
  supertext/html.ts        Pack/unpack segments into one HTML document
  supertext/blocks.ts      Strapi "blocks" inline nodes <-> HTML
scripts/vendor-sdk.sh      updates server/src/vendor/supertext-sdk
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

Shared with the WordPress plugin and every other Supertext plugin, and done by the Supertext SDK:

1. `POST {base}translate/ai/file` — multipart: `file` (part type exactly `text/html`, no charset, else 415), `target_lang` (regional code, e.g. `de-CH`), optional `source_lang` (bare language, e.g. `en`; see *Language codes*), optional `politeness` (`more`/`less`) → `{ file_id }`
2. `GET …/{file_id}/status` until `done` (`error`, `limit_exceeded`, `deleted` are terminal)
3. `GET …/{file_id}/translation` → translated HTML
4. `DELETE …/{file_id}`, also after errors (files also expire after 24 h)

Header: `Authorization: Supertext-Auth-Key <key>`. The key may be configured with or without the `Supertext-Auth-Key ` prefix; exactly one is sent. The header name must be `Authorization` (the live API answers 403 to `Authentication`).

**Rate limit:** the API limits requests per second per key (HTTP 429, `RATE_LIMIT_EXCEEDED`); translating into several languages at once hits it. A 429 is retried up to 4 times, waiting for `Retry-After` if sent, otherwise 1, 2, 4 and 8 seconds (plus jitter, at most 30 s), before reporting *Too many requests*. Each segment travels as `<div data-st-id="N">…</div>` (`server/src/supertext/html.ts`); plain text is escaped with line breaks as `<br>`.

### Supertext SDK

All Supertext calls go through the [Supertext SDK](https://github.com/Supertext/Supertext-API-SDK-and-Guide) (`sdk/typescript`), the shared client of all Supertext plugins. Its TypeScript sources are copied into `server/src/vendor/supertext-sdk/` and bundled into `dist/server` by `strapi-plugin build`, so sites install nothing besides the plugin; `COMMIT` and `VERSION` name the SDK commit and version (the server's `tsconfig.json` uses `lib: ES2022` for them). Never edit the copy: fix the SDK repository and copy it again with `scripts/vendor-sdk.sh [commit-or-tag]` (or `SDK_DIR=<clone> scripts/vendor-sdk.sh`), then run tests, type checks and the build, and note the update in `CHANGELOG.md`.

`server/src/supertext/client.ts` wraps the SDK client and maps the SDK's error codes to the plugin's own (`error.<code>` in the admin translations): `missing_api_key` → `notConfigured`, `authentication_failure` → `authFailed`, `invalid_language_pair` → `invalidLanguagePair` (detail: the codes sent), `not_found` → `notFound`, `payload_too_large` → `tooLarge`, `too_many_requests` → `rateLimited`, `service_unavailable` → `unavailable`, `unexpected_status` → `http`, `transport_error` → `unreachable`, `no_file_id` → `noFileId`, `translation_error` → `failed`, `quota_exceeded` → `limitExceeded`, `file_deleted` → `fileDeleted`, `timeout` → `timeout`, `incomplete_response` → `emptyTranslation`. The API key never appears in messages.

### Language codes

Supertext's rule (from testing the live API): **source = bare language** (`en`, `de`), **target = regional code** (`de-DE`, `fr-CH`, `en-US`). A regional source or a bare target is rejected with `INVALID_LANGUAGE_PAIR`. Translating within one language (source `en`, target `en-GB`) is allowed.

`server/src/supertext/languages.ts` turns Strapi locale codes into Supertext codes with the SDK's `LanguageCodes` (the settings page uses the same function for its *Sent to Supertext as* column):

- `targetCode(locale, code)`: the `locales.<locale>.code` setting wins, else the locale. The code is normalized (`de_ch`/`de-ch` → `de-CH`; scripts and numeric regions keep their form: `zh-Hant`, `es-419`). A bare language gets its default region from the SDK's `DEFAULT_REGIONS` (de→de-DE, en→en-US, fr→fr-FR, it→it-IT, pt→pt-PT, zh→zh-CN, …; the same table in every Supertext plugin). Unknown bare codes are sent unchanged, so Supertext's error names them.
- `sourceCode(locale, code)`: the language of the source locale's `code` setting or of the locale (`en-US` → `en`).

The mock API (`test/mock-supertext.mjs`) rejects bare targets and regional sources like the real API.

## Admin API

All routes require an authenticated admin (`admin::isAuthenticatedAdmin`).

| Route | Purpose |
| --- | --- |
| `GET /supertext/status` | `{ configured, endpoint, locales, contentTypes, version }` (never the key; `version` is read from the plugin's `package.json` at runtime) |
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

## Interface strings

The admin panel's strings live in `admin/src/translations/{en,de,fr,it}.json` (react-intl messages, loaded by `registerTrads` in `admin/src/index.ts` and prefixed with the plugin id). English is the source and fallback. New or changed strings need all four languages in the same commit: formal address (Sie, vous, Lei), Strapi's own terms in each language (de *Sprache*/*Eintrag*, fr *locale*/*entrée*, it *lingua*/*elemento*), and "Supertext", `{placeholders}`, `<tags>` and URLs unchanged. Use typographic apostrophes (’) in French and Italian: a straight `'` before `{` or `<` is an ICU quote.

Server errors are English (`message`, for logs and API clients) and carry a `code` and `values` (`SupertextError`, `TranslationError`, the controller's `forbidden` details and the per-locale results). The admin panel shows `error.<code>` from the translation files via `utils/errorText.ts`, falling back to the English message. A new server error gets a code and an `error.<code>` entry; `test/translations.test.ts` checks both.

## Tests

| File | Covers |
| --- | --- |
| `test/html.test.ts` | Segment packing round trip (escaping, line breaks, Unicode, Markdown) |
| `test/blocks.test.ts` | Blocks inline ↔ HTML (marks, links, line breaks) |
| `test/extract.test.ts` | Field selection, copying, ids, dynamic zones, populate tree |
| `test/client.test.ts` | The plugin's client on the SDK: call sequence, form fields, key prefix, 429 retries, error codes, cleanup (the SDK's own tests run in the SDK repository) |
| `test/translations.test.ts` | All four admin languages have the same keys, placeholders, tags and URLs; every key and server error code has an English message |

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

Other ports: `MOCK_PORT` for the stand-in, `PORT` for Strapi and `STRAPI_URL` (e.g. `http://127.0.0.1:20601`) for the script. Start from an empty demo database (`rm -rf demo/.tmp`) so the first translation shows as *created*. The script logs in with `DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD` (the defaults above are local-only), captures the edit view, the panel before/after translating, the German result, the overwrite warning, the settings page and the locales page, and shows the live endpoint on the settings screenshot instead of the local stand-in's address.

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

## Dependency updates

Dependabot (`.github/dependabot.yml`) opens weekly pull requests: minor and patch updates grouped into one, GitHub Actions in another, each major update on its own. Merge one when CI is green and it doesn't change what the plugin supports.

Some major versions are ignored on purpose: TypeScript (7.x is the native compiler, which the type-checking and build tools here don't support yet) and `@types/node` (the types must match the oldest Node version the plugin supports, not the newest). In Strapi also React, React DOM and their types, react-router-dom and react-intl: Strapi 5's admin provides React 18, react-router-dom 6 and react-intl 6 itself, so the plugin must match them. Lift an ignore rule when the plugin moves to the new version.

## Code quality and security checks

- **Checks** workflow (`.github/workflows/checks.yml`): [actionlint](https://github.com/rhysd/actionlint) and [zizmor](https://docs.zizmor.sh/) lint the workflows on every push and pull request. Dependency review fails a pull request that adds a package with a known vulnerability (moderate or worse). Third-party actions are pinned to commit SHAs; Dependabot keeps the pins up to date. To run the workflow lint locally: `pip install actionlint-py zizmor`, then `actionlint` and `zizmor .github/workflows` in the repo root.
- **Links** workflow (`.github/workflows/links.yml`): [lychee](https://lychee.cli.rs/) checks the links in all Markdown files weekly and whenever docs change on `main`. Broken links open (or update) the issue "Broken links in the docs". Links that can't work from CI (local URLs, placeholders, pages behind a login) are excluded in `.lycheeignore`.
- JavaScript and TypeScript are analysed by CodeQL (see below), so this repo runs no separate static analyser.
- GitHub settings (set by Remy's setup script, not stored in the repo): **secret scanning with push protection** (a push containing a known token format is rejected; findings under *Security → Secret scanning*) and **CodeQL default setup** (findings under *Security → Code scanning* and as comments on pull requests; PHP isn't covered by CodeQL, which is why the PHP plugins run PHPStan).

Before starting work in this repo, look at its open findings: code scanning alerts, secret scanning alerts, Dependabot PRs and the "Broken links in the docs" issue.

## Releasing

Releases are published by `.github/workflows/release.yml` when the version is officially bumped; nobody tags or creates releases by hand.

1. Move the *Unreleased* entries in `CHANGELOG.md` under a new `## X.Y.Z — YYYY-MM-DD` section, and keep an empty *Unreleased* above it.
2. Set the same version in:
   - `package.json`: the npm package version
3. Push to `main`. The workflow checks that the version files match `CHANGELOG.md`, then tags `vX.Y.Z` and creates the GitHub release with the CHANGELOG section as notes (0.x versions as pre-releases). A push that adds no new version does nothing, and a version that is already released is skipped. After fixing a failed run, start it again with *Run workflow* on the *Release* workflow.

Publishing to npm stays manual: `npm publish` once the package name is registered.
## Known limitations / roadmap

- Translation runs inside the request; very large entries may hit proxy timeouts. Planned: background jobs with progress.
- Relations are not set on new translations.
- No bulk translation from the list view yet.
- No automatic translation on save/publish yet.
- Human (professional) translation orders are not supported (the WordPress plugin has them).
- Not yet tested against the live Supertext API.

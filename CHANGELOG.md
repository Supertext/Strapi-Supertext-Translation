# Changelog

## Unreleased

## 0.1.0 — 2026-10-04
- First version for Strapi 5: **Supertext translation** panel in the Content Manager's edit view to translate the saved entry into one or more locales.
- Translates string, text, Markdown and Blocks fields, including inside components and dynamic zones; copies other localized values and media; skips relations and shared fields.
- One Supertext AI file-translation request per target locale; results saved as drafts; slugs generated for new locales and kept for replaced ones.
- Per-locale Supertext code and politeness, content-type allow-list, permission checks per locale.
- Settings page with configuration overview and connection test.
- Demo Strapi app, Dockerfile and Railway configuration; mock Supertext API for local testing.
- Installation guide, user guide and developer guide.

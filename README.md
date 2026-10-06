# Supertext Translation for Strapi

Translate Strapi 5 entries into other locales with **Supertext AI**, straight from the Content Manager.

Open an entry, tick the languages in the **Supertext translation** panel, click **Translate with Supertext** — the plugin translates every localized text field (including rich text, components and dynamic zones) in one request per language and saves the result as a draft for review.

- Works with Strapi's built-in internationalization (i18n) and its role permissions per locale
- Keeps rich-text formatting and links; copies numbers, dates and media; rebuilds URL slugs
- Formal/informal tone and custom Supertext codes per locale
- Re-translate an existing locale on demand, with a clear warning first

## Documentation

| Guide | For |
| --- | --- |
| [Installation guide](docs/INSTALLATION.md) | Administrators: requirements, install, API key, settings, permissions, troubleshooting |
| [User guide](docs/USER_GUIDE.md) | Editors: translating, reviewing, what gets translated |
| [Developer guide](docs/DEVELOPER.md) | Architecture, API protocol, local development, tests, demo deployment, releases |

You need a Supertext account and API key: [create an account](https://www.supertext.com/person/en/account/signin), then generate the key at [supertext.com → Integrations → API](https://www.supertext.com/en/integrations/api) (requires the Admin role).

Quick start (not on npm yet — see the installation guide for building the package):

```js
// config/plugins.js
module.exports = ({ env }) => ({
  supertext: { enabled: true, config: { apiKey: env('SUPERTEXT_API_KEY') } },
});
```

## Demo

`demo/` is a Strapi 5 app with a sample Article type and Swiss locales; it's deployed to Railway from this repository. See the [developer guide](docs/DEVELOPER.md#demo-deployment-railway).

## Changelog and roadmap

See [CHANGELOG.md](CHANGELOG.md) and the [roadmap](docs/DEVELOPER.md#known-limitations--roadmap).

## License

MIT © Supertext AG

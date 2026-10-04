'use strict';

const LOCALES = [
  { code: 'de-CH', name: 'German (Switzerland) (de-CH)' },
  { code: 'fr-CH', name: 'French (Switzerland) (fr-CH)' },
  { code: 'it-CH', name: 'Italian (Switzerland) (it-CH)' },
];

const SAMPLE = {
  title: 'Swiss chocolate, shipped worldwide',
  slug: 'swiss-chocolate-shipped-worldwide',
  summary: 'How a small family business in Bern brings hand-made pralines to customers in 40 countries.',
  body: [
    { type: 'heading', level: 2, children: [{ type: 'text', text: 'From Bern to the world' }] },
    {
      type: 'paragraph',
      children: [
        { type: 'text', text: 'Every praline is made by hand in our workshop in ' },
        { type: 'text', text: 'Bern', bold: true },
        { type: 'text', text: '. Read more on ' },
        { type: 'link', url: 'https://www.supertext.com', children: [{ type: 'text', text: 'our website' }] },
        { type: 'text', text: '.' },
      ],
    },
    {
      type: 'list',
      format: 'unordered',
      children: [
        { type: 'list-item', children: [{ type: 'text', text: 'Fresh ingredients from local farms' }] },
        { type: 'list-item', children: [{ type: 'text', text: 'Climate-neutral delivery within 48 hours' }] },
      ],
    },
  ],
  readingTime: 3,
  seo: {
    metaTitle: 'Hand-made Swiss chocolate | Demo',
    metaDescription: 'Hand-made pralines from Bern, delivered fresh to 40 countries.',
    noIndex: true,
  },
  sections: [
    {
      __component: 'sections.feature',
      heading: 'Our promise',
      text: 'We only use **fair-trade cocoa** and never add palm oil.\n\n- No artificial flavours\n- Recyclable packaging',
    },
    { __component: 'sections.quote', quote: 'The best chocolate I have ever tasted.', author: 'A happy customer' },
  ],
};

module.exports = {
  register() {},

  /** Demo setup: Swiss locales plus one English sample article. */
  async bootstrap({ strapi }) {
    const locales = strapi.plugin('i18n').service('locales');
    const existing = (await locales.find()).map((locale) => locale.code);
    for (const locale of LOCALES) {
      if (!existing.includes(locale.code)) {
        await locales.create(locale);
        strapi.log.info(`[demo] Added locale ${locale.code}`);
      }
    }

    const articles = strapi.documents('api::article.article');
    if ((await articles.count({ locale: 'en' })) === 0) {
      await articles.create({ locale: 'en', data: SAMPLE });
      strapi.log.info('[demo] Created the sample article');
    }
  },
};

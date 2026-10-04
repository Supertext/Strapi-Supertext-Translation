import { describe, expect, it } from 'vitest';
import { extract, populateFor, type Attributes, type SchemaLookup } from '../server/src/services/extract';

const components: Record<string, Attributes> = {
  'shared.seo': { metaTitle: { type: 'string' }, metaDescription: { type: 'text' }, noIndex: { type: 'boolean' } },
  'sections.quote': { quote: { type: 'text' }, author: { type: 'string' } },
  'sections.image': { image: { type: 'media' }, caption: { type: 'string' } },
};
const schema: SchemaLookup = { component: (uid) => components[uid] ?? {} };

const attributes: Attributes = {
  title: { type: 'string' },
  slug: { type: 'uid', targetField: 'title' },
  price: { type: 'decimal' },
  sku: { type: 'string', pluginOptions: { i18n: { localized: false } } },
  body: { type: 'blocks' },
  cover: { type: 'media' },
  seo: { type: 'component', component: 'shared.seo' },
  sections: { type: 'dynamiczone', components: ['sections.quote', 'sections.image'] },
  author: { type: 'relation' },
};

const source = {
  id: 7,
  documentId: 'abc',
  title: 'Swiss chocolate',
  slug: 'swiss-chocolate',
  price: 12.5,
  sku: 'CH-1',
  body: [
    { type: 'heading', level: 2, children: [{ type: 'text', text: 'Why us' }] },
    { type: 'list', format: 'unordered', children: [{ type: 'list-item', children: [{ type: 'text', text: 'Fresh' }] }] },
    { type: 'code', children: [{ type: 'text', text: 'npm install' }] },
    { type: 'paragraph', children: [{ type: 'text', text: '' }] },
  ],
  cover: { id: 3, url: '/uploads/a.jpg' },
  seo: { id: 11, metaTitle: 'Buy chocolate', metaDescription: 'Best in town', noIndex: false },
  sections: [
    { id: 1, __component: 'sections.quote', quote: 'Delicious!', author: 'Anna' },
    { id: 2, __component: 'sections.image', image: { id: 4 }, caption: '2024' },
  ],
  author: { id: 9 },
};

describe('extract', () => {
  const { data, jobs, uidFields } = extract(attributes, source, schema);

  it('collects translatable text only', () => {
    expect(jobs.map((j) => j.segment.text)).toEqual([
      'Swiss chocolate',
      'Why us',
      'Fresh',
      'Buy chocolate',
      'Best in town',
      'Delicious!',
      'Anna',
    ]);
  });

  it('copies other localized values, drops ids, skips shared fields and relations', () => {
    expect(data).toMatchObject({ price: 12.5, cover: 3, seo: { noIndex: false } });
    expect(data).not.toHaveProperty('sku');
    expect(data).not.toHaveProperty('author');
    expect(data).not.toHaveProperty('id');
    expect(data.seo).not.toHaveProperty('id');
    expect(data.sections).toEqual([
      { quote: 'Delicious!', author: 'Anna', __component: 'sections.quote' },
      { image: 4, caption: '2024', __component: 'sections.image' },
    ]);
    expect(uidFields).toEqual(['slug']);
  });

  it('writes translations into the data without touching the source', () => {
    jobs.forEach((job) => job.apply(job.segment.html ? `[de] ${job.segment.text}` : `[de] ${job.segment.text}`));
    expect(data.title).toBe('[de] Swiss chocolate');
    expect((data.body as any)[0].children).toEqual([{ type: 'text', text: '[de] Why us' }]);
    expect((data.body as any)[2]).toEqual(source.body[2]);
    expect((data.seo as any).metaTitle).toBe('[de] Buy chocolate');
    expect((data.sections as any)[0]).toMatchObject({ __component: 'sections.quote', quote: '[de] Delicious!' });
    expect((data.sections as any)[1].caption).toBe('2024');
    expect(source.body[0].children[0].text).toBe('Why us');
  });

  it('builds a populate tree for media, components and dynamic zones', () => {
    expect(populateFor(attributes, schema)).toEqual({
      cover: true,
      seo: true,
      sections: { on: { 'sections.quote': true, 'sections.image': { populate: { image: true } } } },
    });
  });
});

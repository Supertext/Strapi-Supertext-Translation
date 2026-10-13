import { describe, expect, it } from 'vitest';
import { SupertextClient } from '../server/src/supertext/client';

type Call = { method: string; url: string; body?: FormData };

type Init = RequestInit & { headers?: Record<string, string> };

const fakeFetch = (handler: (call: Call) => Response) => {
  const calls: (Call & { headers: Headers })[] = [];
  const fn = (async (url: string, init: Init) => {
    const headers = new Headers(init.headers);
    // The SDK builds the multipart body itself; read it back as FormData.
    const type = headers.get('content-type') ?? '';
    const body = type.startsWith('multipart/form-data')
      ? await new Response(init.body as BodyInit, { headers: { 'content-type': type } }).formData()
      : undefined;
    const call = { method: init.method ?? 'GET', url, body, headers };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { fn, calls };
};

describe('SupertextClient', () => {
  it('submits, polls, downloads and deletes', async () => {
    let polls = 0;
    const { fn, calls } = fakeFetch(({ method, url }) => {
      if (method === 'POST') return Response.json({ file_id: 'f1' });
      if (url.endsWith('/status')) return Response.json({ status: ++polls < 2 ? 'running' : 'done' });
      if (url.endsWith('/translation')) return new Response('<div data-st-id="0">Hallo</div>');
      return Response.json({});
    });
    const client = new SupertextClient({ apiKey: 'k', endpoint: 'https://api.test/v1', pollIntervalMs: 1, fetch: fn });
    const html = await client.translateDocument('<div>Hi</div>', { targetLanguage: 'de-CH', sourceLanguage: 'en', politeness: 'more' });

    expect(html).toContain('Hallo');
    expect(calls.map((c) => `${c.method} ${c.url.replace('https://api.test/v1/', '')}`)).toEqual([
      'POST translate/ai/file',
      'GET translate/ai/file/f1/status',
      'GET translate/ai/file/f1/status',
      'GET translate/ai/file/f1/translation',
      'DELETE translate/ai/file/f1',
    ]);
    const form = calls[0].body!;
    expect(form.get('target_lang')).toBe('de-CH');
    expect(form.get('source_lang')).toBe('en');
    expect(form.get('politeness')).toBe('more');
    expect((form.get('file') as File).type).toBe('text/html');
  });

  it('explains authentication errors and still deletes nothing it never created', async () => {
    const { fn, calls } = fakeFetch(() => new Response('{"detail":"bad key"}', { status: 401 }));
    const client = new SupertextClient({ apiKey: 'wrong', fetch: fn });
    await expect(client.translateDocument('<p>x</p>', { targetLanguage: 'fr' })).rejects.toThrow(/Authentication failed.*bad key/);
    await expect(client.validate()).rejects.toMatchObject({ code: 'authFailed', values: { detail: expect.stringContaining('bad key') } });
    expect(calls).toHaveLength(2);
  });

  it('stops on limit_exceeded and cleans up', async () => {
    const { fn, calls } = fakeFetch(({ method, url }) =>
      method === 'POST' ? Response.json({ file_id: 'f2' }) : url.endsWith('/status') ? Response.json({ status: 'limit_exceeded' }) : Response.json({})
    );
    const client = new SupertextClient({ apiKey: 'k', fetch: fn });
    await expect(client.translateDocument('<p>x</p>', { targetLanguage: 'fr' })).rejects.toThrow(/limit is exceeded/);
    expect(calls.at(-1)?.method).toBe('DELETE');
  });

  it('maps an unsupported language pair to its own code', async () => {
    const { fn } = fakeFetch(() => new Response('{"error_code":"INVALID_LANGUAGE_PAIR","source_lang":"en","target_lang":"xx"}', { status: 400 }));
    await expect(new SupertextClient({ apiKey: 'k', fetch: fn }).translateDocument('<p>x</p>', { targetLanguage: 'xx', sourceLanguage: 'en' })).rejects.toMatchObject({
      code: 'invalidLanguagePair',
    });
  });

  it('refuses to start without an API key', () => {
    expect(() => new SupertextClient({ apiKey: '' })).toThrow(/No Supertext API key/);
  });
});

describe('API key', () => {
  it('accepts the key with or without the Supertext-Auth-Key prefix', async () => {
    const { fn, calls } = fakeFetch(() => Response.json({}));
    await new SupertextClient({ apiKey: ' Supertext-Auth-Key abc+/= ', fetch: fn }).validate();
    await new SupertextClient({ apiKey: 'abc+/=', fetch: fn }).validate();
    expect(calls.map((c) => c.headers.get('authorization'))).toEqual(['Supertext-Auth-Key abc+/=', 'Supertext-Auth-Key abc+/=']);
  });
});

describe('rate limiting', () => {
  it('retries after HTTP 429 and then succeeds', async () => {
    let limited = 2;
    const { fn } = fakeFetch(({ method, url }) => {
      if (method === 'POST') return limited-- > 0 ? new Response('rate limit', { status: 429 }) : Response.json({ file_id: 'f3' });
      if (url.endsWith('/status')) return Response.json({ status: 'done' });
      if (url.endsWith('/translation')) return new Response('<div data-st-id="0">Hallo</div>');
      return Response.json({});
    });
    const waits: number[] = [];
    const client = new SupertextClient({ apiKey: 'k', fetch: fn, sleep: async (ms) => void waits.push(ms) });
    expect(await client.translateDocument('<div>Hi</div>', { targetLanguage: 'de-CH' })).toContain('Hallo');
    expect(waits).toHaveLength(2);
  });

  it('gives up after a few retries', async () => {
    const { fn, calls } = fakeFetch(() => new Response('rate limit', { status: 429 }));
    const client = new SupertextClient({ apiKey: 'k', fetch: fn, sleep: async () => undefined });
    await expect(client.validate()).rejects.toThrow(/Too many requests/);
    expect(calls).toHaveLength(5);
  });

  it('honours Retry-After', async () => {
    const { retryDelayMs } = await import('../server/src/vendor/supertext-sdk/v1/index');
    expect(retryDelayMs(0, '3')).toBe(3000);
    expect(retryDelayMs(1, null)).toBeGreaterThanOrEqual(2000);
  });
});

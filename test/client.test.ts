import { describe, expect, it } from 'vitest';
import { SupertextClient } from '../server/src/supertext/client';

type Call = { method: string; url: string; body?: FormData };

const fakeFetch = (handler: (call: Call) => Response) => {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    const call = { method: init.method ?? 'GET', url, body: init.body as FormData };
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
    const html = await client.translateDocument('<div>Hi</div>', { targetLanguage: 'de-CH', sourceLanguage: 'en-US', politeness: 'more' });

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
    await expect(client.validate()).rejects.toMatchObject({
      code: 'authFailed',
      values: { detail: '{"detail":"bad key"}' },
    });
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

  it('refuses to start without an API key', () => {
    expect(() => new SupertextClient({ apiKey: '' })).toThrow(/No Supertext API key/);
  });
});

describe('authHeader', () => {
  it('accepts the key with or without the Supertext-Auth-Key prefix', async () => {
    const { authHeader } = await import('../server/src/supertext/client');
    expect(authHeader('abc+/=')).toBe('Supertext-Auth-Key abc+/=');
    expect(authHeader(' Supertext-Auth-Key abc+/= ')).toBe('Supertext-Auth-Key abc+/=');
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
    const { retryDelayMs } = await import('../server/src/supertext/client');
    expect(retryDelayMs(0, '3')).toBe(3000);
    expect(retryDelayMs(1, null)).toBeGreaterThanOrEqual(2000);
  });
});

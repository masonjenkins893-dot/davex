import { registerTool } from './registry.js';

registerTool(
  {
    name: 'web_fetch',
    description: 'Fetch the content of a webpage.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        selector: { type: 'string', description: 'CSS selector to extract (optional)' },
      },
      required: ['url'],
    },
  },
  async (args) => {
    const url = args.url as string;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'DaveX/1.0 (AI Coding Agent by Sixpert)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return `HTTP ${res.status}: ${res.statusText}`;
      const text = await res.text();

      // Strip HTML tags for readability
      const clean = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return clean.slice(0, 8000);
    } catch (err: any) {
      return `Fetch error: ${err.message}`;
    }
  }
);

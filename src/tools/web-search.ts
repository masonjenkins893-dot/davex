import { registerTool } from './registry.js';
import { getSetting } from '../config/settings.js';

registerTool(
  {
    name: 'web_search',
    description: 'Search the web for information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        num_results: { type: 'number', description: 'Number of results (default 5)' },
      },
      required: ['query'],
    },
  },
  async (args) => {
    const query = args.query as string;
    const numResults = (args.num_results as number) || 5;

    // Try DuckDuckGo instant answer API (no key needed)
    try {
      const encoded = encodeURIComponent(query);
      const res = await fetch(
        `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`,
        { signal: AbortSignal.timeout(10_000) }
      );
      const data = await res.json() as any;

      const results: string[] = [];

      if (data.Abstract) {
        results.push(`📌 ${data.AbstractText}\nSource: ${data.AbstractURL}`);
      }

      if (data.RelatedTopics) {
        const topics = data.RelatedTopics
          .filter((t: any) => t.Text)
          .slice(0, numResults - 1)
          .map((t: any) => `• ${t.Text}\n  ${t.FirstURL || ''}`);
        results.push(...topics);
      }

      if (results.length > 0) return results.join('\n\n');
    } catch {}

    // Fallback: return a message with search URL
    return `Search "${query}" on:\n• https://www.google.com/search?q=${encodeURIComponent(query)}\n• https://duckduckgo.com/?q=${encodeURIComponent(query)}\n\nUse web_fetch to get the page content.`;
  }
);

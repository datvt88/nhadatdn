import type { MetadataRoute } from 'next';
import { getSiteUrl } from '../lib/seo';

// Mời rõ các crawler của answer engine (ChatGPT Search, Perplexity, Claude, Google AI...) để
// nội dung có thể được thu thập và trích dẫn. Vẫn cho phép mọi bot khác. Không chặn gì.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-User',
  'anthropic-ai',
  'Google-Extended',
  'Applebot',
  'Applebot-Extended',
  'Bingbot',
  'CCBot',
  'Amazonbot',
  'Bytespider',
  'Meta-ExternalAgent',
  'DuckAssistBot',
];

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: AI_CRAWLERS, allow: '/' },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`],
    host: siteUrl,
  };
}

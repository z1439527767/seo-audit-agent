#!/usr/bin/env node
/**
 * SEO Audit Agent v1.0 — Zero-dependency MCP server
 *
 * Analyzes any URL for SEO health. Returns scored report with
 * actionable fixes. Built for AI Agent marketplaces (AgentForge, AiPayGen).
 *
 * MCP Tools:
 *   - seo_audit_url(url) — full SEO audit of a single URL
 *   - seo_batch_audit(urls[]) — audit multiple URLs
 *
 * Usage: node server.js
 * Pricing: $9/mo or $0.10/audit
 */

import { readFileSync } from 'fs';

// ── Built-in HTTP fetch (Node 18+) ──
async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SEO-Audit-Agent/1.0' }
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const html = await res.text();
    return { html, url: res.url, status: res.status };
  } catch (e) {
    return { error: e.message };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Simple HTML parsing (no dependencies) ──
function extractTag(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi');
  return [...html.matchAll(re)].map(m => m[1].trim());
}

function extractMeta(html, name) {
  const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractLinks(html) {
  const re = /<a[^>]+href=["']([^"']+)["']/gi;
  return [...html.matchAll(re)].map(m => m[1]);
}

function extractImages(html) {
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  return [...html.matchAll(re)].map(m => m[1]);
}

function extractCanonical(html) {
  const re = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i;
  const m = html.match(re);
  return m ? m[1] : null;
}

// ── SEO Analysis ──
function analyzeSEO(html, url) {
  const checks = [];
  let score = 100;

  // 1. Title tag (weight: 15)
  const titles = extractTag(html, 'title');
  const title = titles[0] || '';
  if (!title) {
    checks.push({ check: 'Title Tag', status: 'FAIL', score: -15, fix: 'Add a descriptive <title> tag (50-60 chars)' });
    score -= 15;
  } else if (title.length < 30) {
    checks.push({ check: 'Title Tag', status: 'WARN', score: -5, detail: `${title.length} chars`, fix: 'Expand title to 50-60 characters with primary keyword' });
    score -= 5;
  } else if (title.length > 70) {
    checks.push({ check: 'Title Tag', status: 'WARN', score: -3, detail: `${title.length} chars (too long)`, fix: 'Trim title to under 60 chars for SERP display' });
    score -= 3;
  } else {
    checks.push({ check: 'Title Tag', status: 'PASS', score: 0, detail: `${title.length} chars` });
  }

  // 2. Meta Description (weight: 10)
  const desc = extractMeta(html, 'description');
  if (!desc) {
    checks.push({ check: 'Meta Description', status: 'FAIL', score: -10, fix: 'Add <meta name="description"> tag (120-160 chars)' });
    score -= 10;
  } else if (desc.length < 70) {
    checks.push({ check: 'Meta Description', status: 'WARN', score: -3, detail: `${desc.length} chars`, fix: 'Expand to 120-160 characters' });
    score -= 3;
  } else if (desc.length > 160) {
    checks.push({ check: 'Meta Description', status: 'WARN', score: -2, detail: `${desc.length} chars`, fix: 'Trim to ~155 chars for SERP display' });
    score -= 2;
  } else {
    checks.push({ check: 'Meta Description', status: 'PASS', score: 0, detail: `${desc.length} chars` });
  }

  // 3. H1 Tag (weight: 10)
  const h1s = extractTag(html, 'h1');
  if (h1s.length === 0) {
    checks.push({ check: 'H1 Tag', status: 'FAIL', score: -10, fix: 'Add exactly one <h1> tag with primary keyword' });
    score -= 10;
  } else if (h1s.length > 1) {
    checks.push({ check: 'H1 Tag', status: 'WARN', score: -5, detail: `${h1s.length} H1s found`, fix: 'Use only ONE <h1> per page' });
    score -= 5;
  } else {
    checks.push({ check: 'H1 Tag', status: 'PASS', score: 0, detail: h1s[0].substring(0, 60) });
  }

  // 4. Canonical URL (weight: 8)
  const canonical = extractCanonical(html);
  if (!canonical) {
    checks.push({ check: 'Canonical URL', status: 'WARN', score: -4, fix: 'Add <link rel="canonical"> to prevent duplicate content issues' });
    score -= 4;
  } else {
    checks.push({ check: 'Canonical URL', status: 'PASS', score: 0, detail: canonical });
  }

  // 5. Viewport/Mobile (weight: 8)
  if (!html.includes('viewport')) {
    checks.push({ check: 'Mobile Ready', status: 'FAIL', score: -8, fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">' });
    score -= 8;
  } else {
    checks.push({ check: 'Mobile Ready', status: 'PASS', score: 0 });
  }

  // 6. Image Alt Tags (weight: 7)
  const imgs = extractImages(html);
  const altRe = /<img[^>]+alt=["']([^"']*)["']/gi;
  const alts = [...html.matchAll(altRe)];
  const missingAlt = imgs.length - alts.filter(a => a[1].trim()).length;
  if (imgs.length > 0 && missingAlt > imgs.length * 0.5) {
    checks.push({ check: 'Image Alt Text', status: 'WARN', score: -5, detail: `${missingAlt}/${imgs.length} missing alt`, fix: 'Add descriptive alt text to all images' });
    score -= 5;
  } else if (imgs.length > 0) {
    checks.push({ check: 'Image Alt Text', status: 'PASS', score: 0, detail: `${imgs.length} images` });
  } else {
    checks.push({ check: 'Image Alt Text', status: 'PASS', score: 0, detail: 'no images' });
  }

  // 7. Content Length (weight: 7)
  const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(' ').filter(Boolean).length;
  if (wordCount < 300) {
    checks.push({ check: 'Content Length', status: 'WARN', score: -5, detail: `${wordCount} words`, fix: 'Aim for 300+ words of substantive content' });
    score -= 5;
  } else {
    checks.push({ check: 'Content Length', status: 'PASS', score: 0, detail: `${wordCount} words` });
  }

  // 8. Internal Links (weight: 5)
  const links = extractLinks(html);
  const internalLinks = links.filter(l => l.startsWith('/') || l.includes(new URL(url).hostname));
  if (links.length === 0) {
    checks.push({ check: 'Internal Links', status: 'INFO', score: 0, detail: 'no links found' });
  } else if (internalLinks.length < 3) {
    checks.push({ check: 'Internal Links', status: 'WARN', score: -3, detail: `${internalLinks.length} internal`, fix: 'Add more internal links for better crawl structure' });
    score -= 3;
  } else {
    checks.push({ check: 'Internal Links', status: 'PASS', score: 0, detail: `${internalLinks.length} internal / ${links.length} total` });
  }

  // 9. HTTPS (weight: 5)
  if (!url.startsWith('https://')) {
    checks.push({ check: 'HTTPS', status: 'FAIL', score: -5, fix: 'Migrate to HTTPS — Google ranking factor' });
    score -= 5;
  } else {
    checks.push({ check: 'HTTPS', status: 'PASS', score: 0 });
  }

  // 10. Heading Structure (weight: 5)
  const h2s = extractTag(html, 'h2');
  const h3s = extractTag(html, 'h3');
  if (h2s.length === 0) {
    checks.push({ check: 'Heading Structure', status: 'WARN', score: -3, detail: 'no H2s', fix: 'Use H2/H3 for content hierarchy' });
    score -= 3;
  } else {
    checks.push({ check: 'Heading Structure', status: 'PASS', score: 0, detail: `H1:${h1s.length} H2:${h2s.length} H3:${h3s.length}` });
  }

  // Grade
  let grade = 'A';
  if (score < 60) grade = 'F';
  else if (score < 70) grade = 'D';
  else if (score < 80) grade = 'C';
  else if (score < 90) grade = 'B';

  return {
    url,
    score: Math.max(0, score),
    grade,
    wordCount,
    images: imgs.length,
    links: links.length,
    checks,
    summary: checks.filter(c => c.status === 'FAIL' || c.status === 'WARN')
      .map(c => `[${c.status}] ${c.check}: ${c.fix || c.detail}`)
  };
}

// ── MCP Server (JSON-RPC over stdio) ──
async function handleRequest(req) {
  const { method, params, id } = req;

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0', id,
      result: {
        tools: [
          {
            name: 'seo_audit_url',
            description: 'Analyze a single URL for SEO issues. Returns scored report with actionable fixes covering title, meta, headings, mobile, images, links, HTTPS, and more.',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'The URL to audit (e.g., https://example.com)' }
              },
              required: ['url']
            }
          },
          {
            name: 'seo_batch_audit',
            description: 'Audit multiple URLs at once. Returns comparative scores and prioritized fix list.',
            inputSchema: {
              type: 'object',
              properties: {
                urls: { type: 'array', items: { type: 'string' }, description: 'Array of URLs to audit' }
              },
              required: ['urls']
            }
          }
        ]
      }
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    if (name === 'seo_audit_url') {
      const result = await fetchPage(args.url);
      if (result.error) {
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({ error: result.error, url: args.url }, null, 2) }] } };
      }
      const analysis = analyzeSEO(result.html, args.url);
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }] } };
    }
    if (name === 'seo_batch_audit') {
      const results = [];
      for (const url of args.urls) {
        const result = await fetchPage(url);
        if (result.error) {
          results.push({ url, error: result.error });
        } else {
          results.push(analyzeSEO(result.html, url));
        }
      }
      // Sort by score ascending (worst first)
      results.sort((a, b) => (a.score || 0) - (b.score || 0));
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] } };
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
}

// ── Main ──
async function main() {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;
    // Process complete JSON-RPC messages (newline-delimited)
    while (buffer.includes('\n')) {
      const idx = buffer.indexOf('\n');
      const line = buffer.substring(0, idx).trim();
      buffer = buffer.substring(idx + 1);
      if (!line) continue;
      try {
        const req = JSON.parse(line);
        const res = await handleRequest(req);
        process.stdout.write(JSON.stringify(res) + '\n');
      } catch (e) {
        process.stderr.write(`Parse error: ${e.message}\n`);
      }
    }
  }
}

main().catch(e => { process.stderr.write(`Fatal: ${e.message}\n`); process.exit(1); });

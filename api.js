// SEO Audit Agent — Backend API (Vercel serverless)
// Handles: Stripe checkout, SEO audit, webhooks

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const PRICE_ID = 'price_1ThGDyBwFP8f26YyEA1ZtKzH';
const DOMAIN = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000';

async function fetchPage(url) {
  const c = new AbortController();
  setTimeout(() => c.abort(), 15000);
  const res = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'SEO-Audit/1.0' } });
  return { html: await res.text(), status: res.status };
}

function analyzeSEO(html, url) {
  const getTag = (t) => { const m = html.match(new RegExp('<' + t + '[^>]*>([^<]*)</' + t + '>', 'i')); return m ? m[1].trim() : ''; };
  const getMeta = (n) => { const m = html.match(new RegExp('<meta[^>]+name=[\"\\\']' + n + '[\"\\\'][^>]+content=[\"\\\']([^\"\\\']+)[\"\\\']', 'i')); return m ? m[1] : null; };
  const getLinks = () => [...html.matchAll(/<a[^>]+href=[\"\\']([^\"\\']+)[\"\\']/gi)].map(m => m[1]);
  const getImgs = () => [...html.matchAll(/<img[^>]+src=[\"\\']([^\"\\']+)[\"\\']/gi)].map(m => m[1]);

  const checks = [];
  let score = 100;
  const title = getTag('title');
  const desc = getMeta('description');
  const h1s = [...html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/gi)].map(m => m[1].trim());
  const h2s = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/gi)].map(m => m[1].trim());
  const h3s = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/gi)].map(m => m[1].trim());
  const canonical = (html.match(/<link[^>]+rel=[\"\\']canonical[\"\\'][^>]+href=[\"\\']([^\"\\']+)[\"\\']/i) || [])[1] || null;
  const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(' ').filter(Boolean).length;
  const links = getLinks();
  const host = new URL(url).hostname;
  const internalLinks = links.filter(l => l.startsWith('/') || l.includes(host));
  const imgs = getImgs();

  // Title
  if (!title) { checks.push({ check: 'Title Tag', status: 'FAIL', fix: 'Add <title> (50-60 chars)' }); score -= 15; }
  else if (title.length < 30) { checks.push({ check: 'Title Tag', status: 'WARN', detail: title.length + ' chars', fix: 'Expand to 50-60 chars' }); score -= 5; }
  else if (title.length > 70) { checks.push({ check: 'Title Tag', status: 'WARN', detail: title.length + ' chars', fix: 'Trim to under 60 chars' }); score -= 3; }
  else checks.push({ check: 'Title Tag', status: 'PASS', detail: title.length + ' chars' });

  // Meta Description
  if (!desc) { checks.push({ check: 'Meta Description', status: 'FAIL', fix: 'Add <meta name=description> (120-160 chars)' }); score -= 10; }
  else if (desc.length < 70) { checks.push({ check: 'Meta Description', status: 'WARN', detail: desc.length + ' chars', fix: 'Expand to 120-160 chars' }); score -= 3; }
  else checks.push({ check: 'Meta Description', status: 'PASS', detail: desc.length + ' chars' });

  // H1
  if (!h1s.length) { checks.push({ check: 'H1 Tag', status: 'FAIL', fix: 'Add one <h1>' }); score -= 10; }
  else if (h1s.length > 1) { checks.push({ check: 'H1 Tag', status: 'WARN', detail: h1s.length + ' H1s', fix: 'Use only one <h1>' }); score -= 5; }
  else checks.push({ check: 'H1 Tag', status: 'PASS', detail: h1s[0].substring(0, 60) });

  // Canonical
  if (!canonical) { checks.push({ check: 'Canonical URL', status: 'WARN', fix: 'Add <link rel=canonical>' }); score -= 4; }
  else checks.push({ check: 'Canonical URL', status: 'PASS', detail: canonical });

  // Mobile
  if (!html.includes('viewport')) { checks.push({ check: 'Mobile Ready', status: 'FAIL', fix: 'Add viewport meta tag' }); score -= 8; }
  else checks.push({ check: 'Mobile Ready', status: 'PASS' });

  // Content
  if (wordCount < 300) { checks.push({ check: 'Content Length', status: 'WARN', detail: wordCount + ' words', fix: 'Aim for 300+ words' }); score -= 5; }
  else checks.push({ check: 'Content Length', status: 'PASS', detail: wordCount + ' words' });

  // Links
  if (internalLinks.length < 3) { checks.push({ check: 'Internal Links', status: 'WARN', detail: internalLinks.length + ' internal', fix: 'Add more internal links' }); score -= 3; }
  else checks.push({ check: 'Internal Links', status: 'PASS', detail: internalLinks.length + ' internal / ' + links.length + ' total' });

  // HTTPS
  if (!url.startsWith('https://')) { checks.push({ check: 'HTTPS', status: 'FAIL', fix: 'Migrate to HTTPS' }); score -= 5; }
  else checks.push({ check: 'HTTPS', status: 'PASS' });

  // Headings
  if (!h2s.length) { checks.push({ check: 'Heading Structure', status: 'WARN', detail: 'no H2s', fix: 'Use H2/H3 hierarchy' }); score -= 3; }
  else checks.push({ check: 'Heading Structure', status: 'PASS', detail: 'H1:' + h1s.length + ' H2:' + h2s.length + ' H3:' + h3s.length });

  let grade = 'A';
  if (score < 60) grade = 'F'; else if (score < 70) grade = 'D'; else if (score < 80) grade = 'C'; else if (score < 90) grade = 'B';

  return { url, score: Math.max(0, score), grade, wordCount, images: imgs.length, links: links.length, checks,
    summary: checks.filter(c => c.status === 'FAIL' || c.status === 'WARN').map(c => '[' + c.status + '] ' + c.check + ': ' + (c.fix || c.detail)) };
}

// Vercel serverless handler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Stripe Subscribe
  if (req.url === '/api/subscribe') {
    const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + STRIPE_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'line_items[0][price]': PRICE_ID,
        'line_items[0][quantity]': 1,
        mode: 'subscription',
        success_url: DOMAIN + '/success',
        cancel_url: DOMAIN,
      }).toString()
    }).then(r => r.json());
    res.writeHead(302, { Location: session.url });
    return res.end();
  }

  // SEO Audit
  if (req.url === '/api/audit' && req.method === 'POST') {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    try {
      const page = await fetchPage(url);
      const analysis = analyzeSEO(page.html, url);
      return res.json(analysis);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Landing page
  const fs = await import('fs');
  const html = fs.readFileSync('./landing/index.html', 'utf8');
  res.setHeader('Content-Type', 'text/html');
  return res.end(html);
}

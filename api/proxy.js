/**
 * Vercel Serverless Proxy for BingX API
 * Usage: /api/proxy?path=/openApi/swap/v2/quote/ticker&symbol=BTC-USDT
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { path, ...params } = req.query;
  if (!path) { res.status(400).json({ error: 'Missing path param' }); return; }

  // Build upstream URL
  const qs = new URLSearchParams(params).toString();
  const url = `https://open-api.bingx.com${path}${qs ? '?' + qs : ''}`;

  try {
    const upstream = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}

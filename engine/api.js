/**
 * BingX API - routes through /api/proxy (Vercel serverless) to avoid CORS
 */
const BingXAPI = (() => {
  const BINGX = 'https://open-api.bingx.com';
  const CONCURRENCY = 6;
  const DELAY_MS = 80;
  let queue = [], running = 0;

  // Detect if we are on Vercel (use proxy) or local (try direct)
  const USE_PROXY = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  const PROXY_BASE = '/api/proxy';

  function _buildUrl(path, params = {}) {
    if (USE_PROXY) {
      const qs = new URLSearchParams({ path, ...params }).toString();
      return PROXY_BASE + '?' + qs;
    }
    const qs = new URLSearchParams(params).toString();
    return BINGX + path + (qs ? '?' + qs : '');
  }

  function _fetch(url, retries = 3) {
    return new Promise((resolve, reject) => {
      queue.push({ url, resolve, reject, retries });
      _drain();
    });
  }

  async function _drain() {
    if (running >= CONCURRENCY || queue.length === 0) return;
    const { url, resolve, reject, retries } = queue.shift();
    running++;
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      resolve(await r.json());
    } catch (e) {
      if (retries > 0) {
        const backoff = (4 - retries) * 1500; // 1.5s, 3.0s, 4.5s
        setTimeout(() => { queue.push({ url, resolve, reject, retries: retries - 1 }); _drain(); }, backoff);
      } else {
        reject(e);
      }
    } finally {
      running--;
      setTimeout(_drain, DELAY_MS);
      _drain();
    }
  }

  async function _safe(url) {
    try { return await _fetch(url); }
    catch (e) { console.warn('[API]', e.message); return null; }
  }

  async function getContracts() {
    const d = await _safe(_buildUrl('/openApi/swap/v2/quote/contracts'));
    return (d && d.data) ? d.data : [];
  }

  async function getKlines(symbol, interval, limit = 200) {
    const url = _buildUrl('/openApi/swap/v3/quote/klines', { symbol, interval, limit });
    const d = await _safe(url);
    if (!d || !d.data) return [];
    return d.data.map(k => ({
      time:   parseInt(k.time   ?? k[0]),
      open:   parseFloat(k.open   ?? k[1]),
      high:   parseFloat(k.high   ?? k[2]),
      low:    parseFloat(k.low    ?? k[3]),
      close:  parseFloat(k.close  ?? k[4]),
      volume: parseFloat(k.volume ?? k[5])
    })).filter(k => !isNaN(k.close) && k.close > 0)
      .sort((a, b) => a.time - b.time);
  }

  async function getAllTickers() {
    const d = await _safe(_buildUrl('/openApi/swap/v2/quote/ticker'));
    if (!d || !d.data) return [];
    const arr = Array.isArray(d.data) ? d.data : Object.values(d.data);
    return arr
      .filter(t => t.symbol && t.symbol.endsWith('-USDT'))
      .sort((a, b) => parseFloat(b.quoteVolume || b.volume || 0) - parseFloat(a.quoteVolume || a.volume || 0));
  }

  async function getPrice(symbol) {
    const d = await _safe(_buildUrl('/openApi/swap/v2/quote/price', { symbol }));
    return (d && d.data) ? parseFloat(d.data.price) : null;
  }

  async function batchKlines(symbols, intervals, limit, onProgress) {
    const results = {};
    let done = 0;
    await Promise.all(symbols.map(async sym => {
      results[sym] = {};
      await Promise.all(intervals.map(async tf => {
        try { results[sym][tf] = await getKlines(sym, tf, limit); }
        catch  { results[sym][tf] = []; }
      }));
      done++;
      if (onProgress) onProgress(done, symbols.length);
    }));
    return results;
  }

  return { getContracts, getKlines, getAllTickers, getPrice, batchKlines };
})();

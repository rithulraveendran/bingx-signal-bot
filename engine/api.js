/**
 * BingX Public API Wrapper
 * NOTE: BingX API requires HTTPS origin. Works on Vercel/GitHub Pages.
 * On localhost, use: npx http-server --cors (or deploy to get real data)
 */
const BingXAPI = (() => {
  const BASE = 'https://open-api.bingx.com';
  const CONCURRENCY = 6;
  const DELAY_MS = 80;
  let queue = [], running = 0;

  function _fetch(url) {
    return new Promise((resolve, reject) => {
      queue.push({ url, resolve, reject });
      _drain();
    });
  }

  async function _drain() {
    if (running >= CONCURRENCY || queue.length === 0) return;
    const { url, resolve, reject } = queue.shift();
    running++;
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      resolve(await r.json());
    } catch (e) { reject(e); } finally {
      running--;
      setTimeout(_drain, DELAY_MS);
      _drain();
    }
  }

  async function _safeFetch(url) {
    try { return await _fetch(url); }
    catch (e) { console.warn('[BingXAPI] Fetch failed:', e.message); return null; }
  }

  async function getContracts() {
    const d = await _safeFetch(BASE + '/openApi/swap/v2/quote/contracts');
    return (d && d.data) ? d.data : [];
  }

  async function getKlines(symbol, interval, limit = 200) {
    const url = BASE + '/openApi/swap/v3/quote/klines?symbol=' + encodeURIComponent(symbol) +
                '&interval=' + interval + '&limit=' + limit;
    const d = await _safeFetch(url);
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
    const d = await _safeFetch(BASE + '/openApi/swap/v2/quote/ticker');
    if (!d || !d.data) return [];
    const arr = Array.isArray(d.data) ? d.data : Object.values(d.data);
    return arr
      .filter(t => t.symbol && t.symbol.endsWith('-USDT'))
      .sort((a, b) => parseFloat(b.quoteVolume || b.volume || 0) - parseFloat(a.quoteVolume || a.volume || 0));
  }

  async function getPrice(symbol) {
    const d = await _safeFetch(BASE + '/openApi/swap/v2/quote/price?symbol=' + encodeURIComponent(symbol));
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

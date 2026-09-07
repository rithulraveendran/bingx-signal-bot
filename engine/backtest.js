/**
 * Backtest Engine - Signal Storage & Performance Tracking
 * Uses localStorage for persistence. Polls live prices to auto-close signals.
 */
const BacktestEngine = (() => {
  const KEY     = 'bingx_signals_v2';
  const MAX_SIG = 500;
  let pollTimer = null;

  function _save(signals) {
    try { localStorage.setItem(KEY, JSON.stringify(signals.slice(0, MAX_SIG))); } catch {}
  }

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }

  function saveSignal(sig) {
    const all = getAll();
    if (all.find(s => s.id === sig.id)) return;
    all.unshift(sig);
    _save(all);
  }

  function updateSignal(id, updates) {
    const all = getAll();
    const i = all.findIndex(s => s.id === id);
    if (i !== -1) { all[i] = { ...all[i], ...updates }; _save(all); }
  }

  function getSignal(id) { return getAll().find(s => s.id === id) || null; }

  async function checkOpenSignals() {
    const open = getAll().filter(s => s.status === 'OPEN');
    if (open.length === 0) return;

    for (const sig of open) {
      try {
        const price = await BingXAPI.getPrice(sig.symbol);
        if (!price) continue;
        const u = { lastChecked: Date.now(), currentPrice: price };
        const bull = sig.direction === 'bullish';

        if ((bull && price <= sig.sl) || (!bull && price >= sig.sl)) {
          Object.assign(u, { status:'CLOSED', result:'SL', slHit:true, pnlR:-1, closedAt:Date.now() });
        } else if ((bull && price >= sig.tp3) || (!bull && price <= sig.tp3)) {
          Object.assign(u, { tp1Hit:true, tp2Hit:true, tp3Hit:true, status:'CLOSED', result:'TP3', pnlR:4, closedAt:Date.now() });
        } else if ((bull && price >= sig.tp2) || (!bull && price <= sig.tp2)) {
          Object.assign(u, { tp1Hit:true, tp2Hit:true });
          if (!sig.tp2Hit) Object.assign(u, { result:'TP2', pnlR:2.5 });
        } else if ((bull && price >= sig.tp1) || (!bull && price <= sig.tp1)) {
          Object.assign(u, { tp1Hit:true });
          if (!sig.tp1Hit) Object.assign(u, { result:'TP1', pnlR:1.5 });
        }

        // Auto-close after 3 days if still open
        if (sig.status === 'OPEN' && Date.now() - sig.createdAt > 3 * 86400000) {
          Object.assign(u, { status:'EXPIRED', result:'EXPIRED', pnlR:0, closedAt:Date.now() });
        }

        updateSignal(sig.id, u);
      } catch {}
    }
  }

  function startPolling(intervalMs = 300000) { // every 5 min
    if (pollTimer) clearInterval(pollTimer);
    checkOpenSignals();
    pollTimer = setInterval(checkOpenSignals, intervalMs);
  }

  function getStats(signals) {
    const closed = (signals || getAll()).filter(s => s.status === 'CLOSED' || s.status === 'EXPIRED');
    if (closed.length === 0) return null;

    const wins = closed.filter(s => s.result !== 'SL' && s.result !== 'EXPIRED');
    const losses = closed.filter(s => s.result === 'SL');
    const winPnl = wins.reduce((a, s) => a + (s.pnlR||0), 0);
    const lossPnl = Math.abs(losses.reduce((a, s) => a + (s.pnlR||0), 0));

    const byPair = {};
    closed.forEach(s => {
      if (!byPair[s.symbol]) byPair[s.symbol] = { wins:0, losses:0, pnl:0, total:0 };
      byPair[s.symbol].total++;
      if (s.result !== 'SL' && s.result !== 'EXPIRED') byPair[s.symbol].wins++;
      else byPair[s.symbol].losses++;
      byPair[s.symbol].pnl += s.pnlR || 0;
    });

    const byDir = { bullish:{ w:0,l:0 }, bearish:{ w:0,l:0 } };
    closed.forEach(s => {
      const d = byDir[s.direction] || byDir.bullish;
      s.result !== 'SL' && s.result !== 'EXPIRED' ? d.w++ : d.l++;
    });

    return {
      total: closed.length,
      wins: wins.length,
      losses: losses.length,
      tp1: closed.filter(s=>s.result==='TP1').length,
      tp2: closed.filter(s=>s.result==='TP2').length,
      tp3: closed.filter(s=>s.result==='TP3').length,
      expired: closed.filter(s=>s.result==='EXPIRED').length,
      winRate: Math.round(wins.length / closed.length * 100),
      totalPnlR: parseFloat((winPnl - lossPnl).toFixed(2)),
      avgWinR: wins.length ? parseFloat((winPnl/wins.length).toFixed(2)) : 0,
      profitFactor: lossPnl > 0 ? parseFloat((winPnl/lossPnl).toFixed(2)) : wins.length > 0 ? 99 : 0,
      byPair, byDir,
      openCount: getAll().filter(s=>s.status==='OPEN').length,
    };
  }

  function exportCSV() {
    const all = getAll();
    const hdr = ['ID','Symbol','Direction','Confidence','Entry','SL','TP1','TP2','TP3','R:R','Status','Result','PnL_R','Confluences','Created','Closed'];
    const rows = all.map(s => [
      s.id, s.symbol, s.direction, s.confidence,
      s.entry, s.sl, s.tp1, s.tp2, s.tp3, s.rr,
      s.status, s.result||'', s.pnlR||'',
      '"' + (s.confluences||[]).join('; ') + '"',
      new Date(s.createdAt).toISOString(),
      s.closedAt ? new Date(s.closedAt).toISOString() : ''
    ]);
    const csv = [hdr, ...rows].map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})),
      download: `bingx-signals-${Date.now()}.csv`
    });
    a.click();
  }

  function clearAll() { localStorage.removeItem(KEY); }

  return { saveSignal, getAll, updateSignal, getSignal, checkOpenSignals, startPolling, getStats, exportCSV, clearAll };
})();

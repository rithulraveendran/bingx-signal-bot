/**
 * Dashboard Component
 */
const DashboardUI = (() => {
  let _tickers = [], _signals = [], _initialized = false;

  function render() {
    const root = document.getElementById('dashboardRoot');
    if (!root) return;
    root.innerHTML = `
      <div class="dash-header">
        <div>
          <h1 class="page-title">Market Intelligence</h1>
          <p class="page-sub">Real-time BingX Futures — Multi-timeframe ICT/SMC Analysis</p>
        </div>
        <div class="dash-header-actions">
          <div class="amd-card" id="amdCard">
            <div class="amd-phase" id="amdPhase">Loading…</div>
            <div class="amd-desc" id="amdDesc"></div>
          </div>
          <div class="utc-clock" id="utcClock">--:--:--</div>
        </div>
      </div>

      <div class="stats-row" id="marketStats">
        <div class="stat-card"><div class="stat-label">Total Signals (Today)</div><div class="stat-val" id="todaySig">—</div></div>
        <div class="stat-card"><div class="stat-label">Win Rate</div><div class="stat-val green" id="winRateStat">—</div></div>
        <div class="stat-card"><div class="stat-label">Profit Factor</div><div class="stat-val" id="pfStat">—</div></div>
        <div class="stat-card"><div class="stat-label">Open Signals</div><div class="stat-val cyan" id="openSig">—</div></div>
        <div class="stat-card"><div class="stat-label">BTC Dominance</div><div class="stat-val" id="btcDom">~52%</div></div>
        <div class="stat-card"><div class="stat-label">Market Bias</div><div class="stat-val" id="mktBias">—</div></div>
      </div>

      <div class="two-col">
        <div class="panel">
          <div class="panel-header">
            <span>🔥 Latest Signals</span>
            <button class="btn-sm" onclick="App.goTo('scanner')">Scan Now →</button>
          </div>
          <div id="latestSignals" class="signal-feed">
            <div class="empty-state">Run the scanner to generate signals</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header"><span>📊 Market Movers (Top Volume)</span></div>
          <div id="marketMovers" class="movers-list">
            <div class="loading-spinner"><div class="spinner"></div><span>Loading market data…</span></div>
          </div>
        </div>
      </div>

      <div class="panel mt16">
        <div class="panel-header"><span>🧭 AMD Session Guide</span></div>
        <div class="amd-guide">
          <div class="amd-step">
            <div class="amd-step-dot" style="background:#f59e0b"></div>
            <div><strong>ACCUMULATION — Asia Session (00:00–08:00 UTC)</strong><br>
              Smart money accumulates positions. Price consolidates in a range. Expect low volatility & fake breakouts. Best time to identify key levels for the day.</div>
          </div>
          <div class="amd-step">
            <div class="amd-step-dot" style="background:#3b82f6"></div>
            <div><strong>MANIPULATION — London Session (08:00–12:00 UTC)</strong><br>
              Price sweeps liquidity above or below the Asia range (stop hunts). This is the "trap" move. Wait for the sweep + reversal before entering.</div>
          </div>
          <div class="amd-step">
            <div class="amd-step-dot" style="background:#10b981"></div>
            <div><strong>DISTRIBUTION — New York Session (14:00–20:00 UTC)</strong><br>
              The real move happens here. Price expands in the true direction after manipulation. Entry signals at FVG/OB are highest probability during NY.</div>
          </div>
        </div>
      </div>`;

    startClock();
    updateAMD();
    updateStats();
    if (!_initialized) { loadMarketMovers(); _initialized = true; }
  }

  function startClock() {
    clearInterval(window._dashClockTimer);
    window._dashClockTimer = setInterval(() => {
      const el = document.getElementById('utcClock');
      if (el) el.textContent = new Date().toUTCString().slice(17,25) + ' UTC';
      updateAMD();
    }, 1000);
  }

  function updateAMD() {
    const s = ICT.getSession();
    const phase = document.getElementById('amdPhase');
    const desc  = document.getElementById('amdDesc');
    if (phase) { phase.textContent = s.emoji + ' ' + s.phase; phase.style.color = s.color; }
    if (desc)  desc.textContent = s.name;
  }

  async function loadMarketMovers() {
    try {
      const tickers = await BingXAPI.getAllTickers();
      _tickers = tickers.slice(0, 30);
      renderMovers(_tickers);
    } catch (e) {
      const el = document.getElementById('marketMovers');
      if (el) el.innerHTML = '<div class="empty-state">Failed to load market data. Check console.</div>';
    }
  }

  function renderMovers(tickers) {
    const el = document.getElementById('marketMovers');
    if (!el) return;
    const top20 = tickers.slice(0, 20);
    el.innerHTML = top20.map(t => {
      const chg = parseFloat(t.priceChangePercent || 0);
      const dir = chg >= 0 ? 'green' : 'red';
      const price = parseFloat(t.lastPrice || t.price || 0);
      return `<div class="mover-row" onclick="App.quickScan('${t.symbol}')">
        <span class="mover-sym">${t.symbol.replace('-USDT','')}<small>/USDT</small></span>
        <span class="mover-price">$${formatPrice(price)}</span>
        <span class="mover-chg ${dir}">${chg>=0?'+':''}${chg.toFixed(2)}%</span>
      </div>`;
    }).join('');

    // Market bias
    const bulls = top20.filter(t => parseFloat(t.priceChangePercent||0) > 0).length;
    const biasEl = document.getElementById('mktBias');
    if (biasEl) {
      const pct = Math.round(bulls / top20.length * 100);
      biasEl.textContent = pct >= 60 ? `🟢 BULLISH (${pct}%)` : pct <= 40 ? `🔴 BEARISH (${100-pct}%)` : `⚪ NEUTRAL`;
      biasEl.className = 'stat-val ' + (pct>=60?'green':pct<=40?'red':'');
    }
  }

  function updateStats() {
    const all = BacktestEngine.getAll();
    const today = all.filter(s => Date.now() - s.createdAt < 86400000);
    const stats  = BacktestEngine.getStats();
    setEl('todaySig', today.length);
    setEl('winRateStat', stats ? stats.winRate + '%' : '—');
    setEl('pfStat', stats ? stats.profitFactor : '—');
    setEl('openSig', all.filter(s=>s.status==='OPEN').length);
  }

  function updateSignals(signals) {
    _signals = signals || [];
    const el = document.getElementById('latestSignals');
    if (!el) return;
    const recent = [..._signals].sort((a,b)=>b.createdAt-a.createdAt).slice(0,8);
    if (recent.length === 0) {
      el.innerHTML = '<div class="empty-state">Run the scanner to generate signals</div>';
      return;
    }
    el.innerHTML = recent.map(s => signalCard(s)).join('');
  }

  function signalCard(s) {
    const bull = s.direction === 'bullish';
    const stored = BacktestEngine.getSignal(s.id);
    const actual = stored || s;
    const tp1Hit = actual.tp1Hit ? '✅' : '⬜';
    const tp2Hit = actual.tp2Hit ? '✅' : '⬜';
    const slHit  = actual.slHit  ? '❌' : '⬜';
    return `<div class="sig-card ${bull?'bull':'bear'}" onclick="App.showDetail('${s.id}')">
      <div class="sig-card-top">
        <span class="sig-pair">${s.pair}</span>
        <span class="sig-dir ${bull?'bull':'bear'}">${bull?'↑ LONG':'↓ SHORT'}</span>
        <span class="sig-conf">${s.grade ? s.grade.emoji + " " + s.grade.label + " · " : ""}${s.confidence}%</span>
      </div>
      <div class="sig-card-mid">
        <div class="sig-lvl"><span>Entry</span><strong>$${s.entry}</strong></div>
        <div class="sig-lvl"><span>SL</span><strong class="red">$${s.sl}</strong></div>
        <div class="sig-lvl"><span>TP1</span><strong class="green">$${s.tp1}</strong></div>
        <div class="sig-rr">1:${s.rr}</div>
      </div>
      <div class="sig-card-bot">
        <span class="sig-tag">${s.session.emoji} ${s.session.name}</span>
        <span class="sig-status">${tp1Hit}TP1 ${tp2Hit}TP2 ${slHit}SL</span>
      </div>
    </div>`;
  }

  function setEl(id, val) { const e = document.getElementById(id); if(e) e.textContent = val; }

  function formatPrice(p) {
    if (p >= 1000) return p.toLocaleString('en', {maximumFractionDigits:2});
    if (p >= 1)    return p.toFixed(4);
    return p.toFixed(6);
  }

  return { render, updateSignals, loadMarketMovers, updateStats };
})();


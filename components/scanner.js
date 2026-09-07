const ScannerUI = (() => {
  // Restore signals from localStorage so they survive page refresh
  let _signals = BacktestEngine ? BacktestEngine.getAll().filter(s => s.status === 'OPEN').slice(0, 200) : [];
  let _scanning = false, _cancelled = false;
  let _filter = { dir:'all', minConf:40, sort:'conf' };
  let _stats = { analyzed:0, total:0, ranging:0, noData:0, lowScore:0 };

  function render() {
    const root = document.getElementById('scannerRoot');
    if (!root) return;
    root.innerHTML = `
      <div class="scanner-header">
        <div>
          <h1 class="page-title">Signal Scanner</h1>
          <p class="page-sub">Scans all BingX USDT perpetual futures for ICT/SMC setups</p>
        </div>
        <div class="scanner-controls">
          <button class="btn btn-primary" id="scanBtn" onclick="ScannerUI.startScan()">⚡ Scan All Pairs</button>
          <button class="btn btn-ghost" id="cancelBtn" style="display:none" onclick="ScannerUI.cancelScan()">✕ Cancel</button>
        </div>
      </div>

      <div class="progress-wrap" id="progressWrap" style="display:none">
        <div class="progress-bar-bg"><div class="progress-bar-fill" id="progressFill"></div></div>
        <div class="progress-text" id="progressText">Initializing…</div>
        <div class="scan-stats" id="scanStats"></div>
      </div>

      <div class="filter-row">
        <div class="filter-group">
          <label>Direction</label>
          <select id="filterDir" onchange="ScannerUI.applyFilter()">
            <option value="all">All</option>
            <option value="bullish">🟢 Long</option>
            <option value="bearish">🔴 Short</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Min Confidence</label>
          <select id="filterConf" onchange="ScannerUI.applyFilter()">
            <option value="30">30%+</option>
            <option value="40" selected>40%+</option>
            <option value="50">50%+</option>
            <option value="60">60%+</option>
            <option value="70">70%+</option>
            <option value="80">80%+</option>
            <option value="90">90%+</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Sort By</label>
          <select id="filterSort" onchange="ScannerUI.applyFilter()">
            <option value="conf">Confidence ↓</option>
            <option value="rr">R:R ↓</option>
            <option value="time">Newest First</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Found</label>
          <span class="sig-count-badge" id="sigCount">0 signals</span>
        </div>
      </div>

      <div class="sig-table-wrap">
        <table class="sig-table" id="sigTable">
          <thead>
            <tr>
              <th>Pair</th><th>Dir</th><th>Confidence</th><th>Setup</th>
              <th>Entry</th><th>SL</th><th>TP1</th><th>TP2</th><th>R:R</th>
              <th>Session</th><th>Action</th>
            </tr>
          </thead>
          <tbody id="sigTbody">
            <tr><td colspan="11" class="empty-cell">Click "Scan All Pairs" to start</td></tr>
          </tbody>
        </table>
      </div>`;
  }

  async function startScan() {
    if (_scanning) return;
    _scanning = true; _cancelled = false;
    _signals = [];
    _stats = { analyzed:0, total:0, ranging:0, noData:0, lowScore:0 };

    const btn = document.getElementById('scanBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const pw = document.getElementById('progressWrap');
    if (btn) btn.disabled = true;
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (pw) pw.style.display = 'block';
    setProgress(0, 'Fetching BingX market data…');

    try {
      // Get all tickers sorted by volume
      setProgress(2, 'Loading all pairs from BingX…');
      const tickers = await BingXAPI.getAllTickers();
      const symbols = tickers
        .filter(t => t.symbol && t.symbol.endsWith('-USDT'))
        .map(t => t.symbol);

      _stats.total = symbols.length;
      setProgress(5, `Found ${symbols.length} pairs. Starting analysis…`);
      App.toast(`🔍 Scanning ${symbols.length} pairs…`, 'info');

      // Process in batches of 5 (conservative for proxy)
      const BATCH = 5;
      const TFS = ['1d','4h','1h','15m','5m'];

      for (let i = 0; i < symbols.length; i += BATCH) {
        if (_cancelled) break;
        const batch = symbols.slice(i, i + BATCH);

        await Promise.all(batch.map(async sym => {
          if (_cancelled) return;
          try {
            const cached = {};
            await Promise.all(TFS.map(async tf => {
              const limit = tf==='1d'?100:150;
              cached[tf] = await BingXAPI.getKlines(sym, tf, limit);
            }));

            // Check if we got data
            if (!cached['1h'] || cached['1h'].length < 20) {
              _stats.noData++; return;
            }

            const sig = await SignalEngine.analyzeSymbol(sym, cached);
            if (sig) {
              _signals.push(sig);
              BacktestEngine.saveSignal(sig);
              renderTable();
              DashboardUI.updateSignals(_signals);
              updateBadge();
            } else {
              _stats.lowScore++;
            }
          } catch(e) {
            _stats.noData++;
          } finally {
            _stats.analyzed++;
            const pct = Math.round(_stats.analyzed / _stats.total * 90) + 5;
            setProgress(pct,
              `Analyzed ${_stats.analyzed}/${_stats.total} pairs — 🟢 ${_signals.length} signals found`);
            updateScanStats();
          }
        }));

        // Small pause between batches
        if (!_cancelled) await new Promise(r => setTimeout(r, 50));
      }

    } catch (e) {
      App.toast('❌ Scan error: ' + e.message, 'error');
      console.error(e);
    }

    setProgress(100, `✅ Done! Analyzed ${_stats.analyzed} pairs — ${_signals.length} signals found`);
    setTimeout(() => { const pw2 = document.getElementById('progressWrap'); if(pw2) pw2.style.display='none'; }, 5000);
    _scanning = false;
    if (btn) btn.disabled = false;
    if (cancelBtn) cancelBtn.style.display = 'none';
    App.toast(`✅ Scan complete! ${_signals.length} signals found`, 'success');
    DashboardUI.updateStats();
  }

  function cancelScan() {
    _cancelled = true; _scanning = false;
    const btn = document.getElementById('scanBtn');
    const cb  = document.getElementById('cancelBtn');
    if (btn) btn.disabled = false;
    if (cb)  cb.style.display = 'none';
  }

  function updateScanStats() {
    const el = document.getElementById('scanStats');
    if (!el) return;
    el.innerHTML = `<span>✅ Signals: <strong>${_signals.length}</strong></span>
      <span>📊 Ranging: <strong>${_stats.ranging}</strong></span>
      <span>❌ No data: <strong>${_stats.noData}</strong></span>`;
  }

  function applyFilter() {
    _filter.dir     = document.getElementById('filterDir')?.value || 'all';
    _filter.minConf = parseInt(document.getElementById('filterConf')?.value || '40');
    _filter.sort    = document.getElementById('filterSort')?.value || 'conf';
    renderTable();
  }

  function renderTable() {
    const tbody = document.getElementById('sigTbody');
    if (!tbody) return;

    let sigs = [..._signals]
      .filter(s => _filter.dir === 'all' || s.direction === _filter.dir)
      .filter(s => s.confidence >= _filter.minConf);

    if (_filter.sort === 'conf') sigs.sort((a,b) => b.confidence - a.confidence);
    else if (_filter.sort === 'rr') sigs.sort((a,b) => b.rr - a.rr);
    else sigs.sort((a,b) => b.createdAt - a.createdAt);

    const count = document.getElementById('sigCount');
    if (count) count.textContent = sigs.length + ' signals';

    if (sigs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty-cell">${_scanning
        ? '⏳ Scanning in progress…'
        : 'No signals yet. Lower the confidence filter or run a scan.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = sigs.map(s => {
      const bull = s.direction === 'bullish';
      const conf = s.confidence;
      const confClass = conf>=65?'conf-high':conf>=45?'conf-mid':'conf-low';
      return `<tr class="sig-row ${bull?'bull-row':'bear-row'}" onclick="App.showDetail('${s.id}')">
        <td><strong>${s.pair}</strong></td>
        <td><span class="dir-badge ${bull?'bull':'bear'}">${bull?'↑ LONG':'↓ SHORT'}</span></td>
        <td>
          <div class="conf-bar-wrap">
            <div class="conf-bar ${confClass}" style="width:${conf}%"></div>
            <span>${conf}%</span>
          </div>
        </td>
        <td class="setup-col">${(s.setup||'').substring(0,40)}</td>
        <td class="mono">$${s.entry}</td>
        <td class="mono red">$${s.sl}</td>
        <td class="mono green">$${s.tp1}</td>
        <td class="mono green">$${s.tp2}</td>
        <td><span class="rr-badge">1:${s.rr}</span></td>
        <td><span style="color:${s.session?.color};font-size:.7rem">${s.session?.emoji} ${s.session?.name||''}</span></td>
        <td><button class="btn-xs" onclick="event.stopPropagation();App.showDetail('${s.id}')">View →</button></td>
      </tr>`;
    }).join('');
  }

  function setProgress(pct, text) {
    const fill = document.getElementById('progressFill');
    const textEl = document.getElementById('progressText');
    if (fill) fill.style.width = pct + '%';
    if (textEl) textEl.textContent = text;
  }

  function updateBadge() {
    const badge = document.getElementById('scannerBadge');
    if (!badge) return;
    badge.textContent = _signals.length;
    badge.style.display = _signals.length > 0 ? 'inline' : 'none';
  }

  function getSignals() { return _signals; }
  function quickScan(symbol) { render(); startScan(); }

  return { render, startScan, cancelScan, applyFilter, getSignals, quickScan };
})();

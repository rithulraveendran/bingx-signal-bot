/**
 * Scanner Component — Scans all BingX futures pairs
 */
const ScannerUI = (() => {
  let _signals = [], _allSymbols = [], _scanning = false, _cancelled = false;
  let _filter = { dir:'all', minConf:50, sort:'conf' };

  function render() {
    const root = document.getElementById('scannerRoot');
    if (!root) return;
    root.innerHTML = `
      <div class="scanner-header">
        <div>
          <h1 class="page-title">Signal Scanner</h1>
          <p class="page-sub">Scans all BingX USDT perpetual futures for high-confluence setups</p>
        </div>
        <div class="scanner-controls">
          <button class="btn btn-primary" id="scanBtn" onclick="ScannerUI.startScan()">⚡ Scan All Pairs</button>
          <button class="btn btn-ghost" id="cancelBtn" style="display:none" onclick="ScannerUI.cancelScan()">✕ Cancel</button>
        </div>
      </div>

      <div class="progress-wrap" id="progressWrap" style="display:none">
        <div class="progress-bar-bg"><div class="progress-bar-fill" id="progressFill"></div></div>
        <div class="progress-text" id="progressText">Initializing…</div>
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
            <option value="40">40%+</option>
            <option value="50" selected>50%+</option>
            <option value="60">60%+</option>
            <option value="70">70%+</option>
            <option value="80">80%+</option>
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
              <th>Confluences</th><th>Session</th><th>Action</th>
            </tr>
          </thead>
          <tbody id="sigTbody">
            <tr><td colspan="12" class="empty-cell">Click "Scan All Pairs" to start</td></tr>
          </tbody>
        </table>
      </div>`;
  }

  async function startScan() {
    if (_scanning) return;
    _scanning = true; _cancelled = false;
    _signals = [];

    const btn = document.getElementById('scanBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const progressWrap = document.getElementById('progressWrap');
    if (btn) btn.disabled = true;
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (progressWrap) progressWrap.style.display = 'block';

    setProgress(0, 'Fetching BingX market data…');
    App.toast('🔍 Starting full market scan…', 'info');

    try {
      // Step 1: Get all tickers + contracts
      const [tickers, contracts] = await Promise.all([
        BingXAPI.getAllTickers(),
        BingXAPI.getContracts()
      ]);

      // Build symbol list from tickers (all USDT pairs, sorted by volume)
      const symbols = tickers
        .filter(t => t.symbol && t.symbol.endsWith('-USDT'))
        .map(t => t.symbol);

      _allSymbols = symbols;
      setProgress(5, `Found ${symbols.length} pairs. Fetching candles…`);

      // Step 2: Fetch candles in batches
      const BATCH = 8;
      const TFS = ['1d','4h','1h','15m','5m'];
      let done = 0;
      const total = symbols.length;

      for (let i = 0; i < symbols.length; i += BATCH) {
        if (_cancelled) break;
        const batch = symbols.slice(i, i + BATCH);

        await Promise.all(batch.map(async sym => {
          try {
            if (_cancelled) return;
            const cached = {};
            await Promise.all(TFS.map(async tf => {
              cached[tf] = await BingXAPI.getKlines(sym, tf, tf==='1d'?100:150);
            }));

            const sig = await SignalEngine.analyzeSymbol(sym, cached);
            if (sig) {
              _signals.push(sig);
              BacktestEngine.saveSignal(sig);
              renderTable();
              DashboardUI.updateSignals(_signals);
              updateBadge();
            }
          } catch {}
        }));

        done += batch.length;
        const pct = Math.round(done / total * 95) + 5;
        setProgress(pct, `Analyzed ${done}/${total} pairs — ${_signals.length} signals found`);
      }

    } catch (e) {
      App.toast('❌ Scan failed: ' + e.message, 'error');
      console.error(e);
    }

    setProgress(100, `Scan complete — ${_signals.length} signals found`);
    setTimeout(() => {
      const pw = document.getElementById('progressWrap');
      if (pw) pw.style.display = 'none';
    }, 3000);

    _scanning = false;
    if (btn) btn.disabled = false;
    if (cancelBtn) cancelBtn.style.display = 'none';
    App.toast(`✅ Scan complete! ${_signals.length} signals found`, 'success');
    DashboardUI.updateStats();
  }

  function cancelScan() {
    _cancelled = true;
    _scanning = false;
    const btn = document.getElementById('scanBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    if (btn) btn.disabled = false;
    if (cancelBtn) cancelBtn.style.display = 'none';
    App.toast('Scan cancelled', 'info');
  }

  function applyFilter() {
    _filter.dir  = document.getElementById('filterDir')?.value || 'all';
    _filter.minConf = parseInt(document.getElementById('filterConf')?.value || '50');
    _filter.sort = document.getElementById('filterSort')?.value || 'conf';
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
      tbody.innerHTML = `<tr><td colspan="12" class="empty-cell">${_scanning ? 'Scanning…' : 'No signals found with current filters'}</td></tr>`;
      return;
    }

    tbody.innerHTML = sigs.map(s => {
      const bull = s.direction === 'bullish';
      const conf = s.confidence;
      const confClass = conf>=70?'conf-high':conf>=50?'conf-mid':'conf-low';
      const confs = (s.confluences||[]).slice(0,3).join(', ');
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
        <td class="confs-col"><small>${confs}</small></td>
        <td><span class="session-mini" style="color:${s.session?.color}">${s.session?.emoji} ${s.session?.name||''}</span></td>
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
  function addSignal(s) { _signals.push(s); BacktestEngine.saveSignal(s); renderTable(); updateBadge(); }
  function quickScan(symbol) {
    _signals = [];
    render();
    startScan();
  }

  return { render, startScan, cancelScan, applyFilter, getSignals, addSignal, quickScan };
})();

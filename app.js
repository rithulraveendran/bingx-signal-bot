/**
 * App Controller - Routing, Ticker, Toast
 */
const App = (() => {
  let _currentPage = 'dashboard';
  let _tickerTimer = null;
  let _signalStore = {};

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  async function init() {
    setupTabs();
    DashboardUI.render();
    ScannerUI.render();
    BacktestUI.render();
    startTicker();
    BacktestEngine.startPolling();
    DashboardUI.updateSignals(BacktestEngine.getAll().filter(s => s.status === 'OPEN'));
    // Store all signals in memory for detail lookup
    BacktestEngine.getAll().forEach(s => { _signalStore[s.id] = s; });
  }

  // ── Tab Navigation ───────────────────────────────────────────────────────────
  function setupTabs() {
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.page));
    });
  }

  function goTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    const pageEl = document.getElementById('page-' + page);
    const tabEl  = document.getElementById('tab-' + page);
    if (pageEl) pageEl.classList.add('active');
    if (tabEl)  tabEl.classList.add('active');
    _currentPage = page;

    // Re-render as needed
    if (page === 'dashboard') DashboardUI.render();
    if (page === 'scanner')   ScannerUI.render();
    if (page === 'backtest')  BacktestUI.render();
  }

  function showDetail(signalId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const pg = document.getElementById('page-detail');
    if (pg) pg.classList.add('active');
    _currentPage = 'detail';
    DetailUI.render(signalId);
  }

  function quickScan(symbol) {
    goTo('scanner');
    ScannerUI.quickScan(symbol);
  }

  // ── Ticker Strip ─────────────────────────────────────────────────────────────
  async function startTicker() {
    await refreshTicker();
    _tickerTimer = setInterval(refreshTicker, 30000);
  }

  async function refreshTicker() {
    try {
      const tickers = await BingXAPI.getAllTickers();
      const top = tickers.slice(0, 40);
      const inner = document.getElementById('tickerInner');
      if (!inner) return;

      const session = ICT.getSession();
      const sEl = document.getElementById('sessionLabel');
      const sDot = document.getElementById('sessionDot');
      if (sEl) sEl.textContent = session.emoji + ' ' + session.name + ' · ' + session.phase;
      if (sDot) sDot.style.background = session.color;

      const items = [...top, ...top].map(t => {
        const chg = parseFloat(t.priceChangePercent || 0);
        const price = parseFloat(t.lastPrice || t.price || 0);
        const cls = chg >= 0 ? 'tick-up' : 'tick-down';
        const arrow = chg >= 0 ? '▲' : '▼';
        return `<span class="tick-item ${cls}">
          <strong>${t.symbol.replace('-USDT','')}</strong>
          $${formatP(price)}
          <span>${arrow}${Math.abs(chg).toFixed(2)}%</span>
        </span>`;
      }).join('');

      inner.innerHTML = items;
    } catch (e) {
      console.warn('Ticker error:', e.message);
    }
  }

  function formatP(p) {
    if (p >= 1000) return p.toLocaleString('en',{maximumFractionDigits:2});
    if (p >= 1)    return p.toFixed(3);
    return p.toFixed(5);
  }

  // ── Toast ────────────────────────────────────────────────────────────────────
  function toast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(()=>t.remove(), 400); }, 4000);
  }

  window.addEventListener('DOMContentLoaded', init);
  return { goTo, showDetail, quickScan, toast };
})();

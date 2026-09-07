/**
 * Backtest / Performance UI Component
 */
const BacktestUI = (() => {

  function render() {
    const root = document.getElementById('backtestRoot');
    if (!root) return;
    const signals = BacktestEngine.getAll();
    const stats   = BacktestEngine.getStats(signals);

    root.innerHTML = `
      <div class="bt-header">
        <div>
          <h1 class="page-title">Performance Tracker</h1>
          <p class="page-sub">Auto-tracked signal outcomes from live BingX prices</p>
        </div>
        <div class="bt-actions">
          <button class="btn btn-ghost" onclick="BacktestEngine.checkOpenSignals().then(()=>BacktestUI.render())">🔄 Refresh</button>
          <button class="btn btn-ghost" onclick="BacktestEngine.exportCSV()">📥 Export CSV</button>
          <button class="btn btn-danger" onclick="if(confirm('Clear all signal history?')){BacktestEngine.clearAll();BacktestUI.render();}">🗑 Clear All</button>
        </div>
      </div>

      ${stats ? renderStats(stats) : `<div class="empty-state" style="padding:60px">
        <div style="font-size:3rem">📊</div>
        <div style="margin-top:12px">No completed signals yet.</div>
        <div style="color:#64748b;margin-top:8px">Run the scanner and wait for signals to close.</div>
      </div>`}

      ${signals.length > 0 ? renderTable(signals) : ''}`;
  }

  function renderStats(s) {
    const wr = s.winRate;
    const wrColor = wr>=60?'green':wr>=45?'':'red';
    const pf = s.profitFactor;
    const pfColor = pf>=1.5?'green':pf>=1?'':'red';

    return `
    <div class="stats-row bt-stats">
      ${statCard('Total Signals', s.total, '')}
      ${statCard('Wins', s.wins, 'green')}
      ${statCard('Losses', s.losses, 'red')}
      ${statCard('Win Rate', s.winRate + '%', wrColor)}
      ${statCard('Total PnL (R)', (s.totalPnlR>=0?'+':'')+s.totalPnlR+'R', s.totalPnlR>=0?'green':'red')}
      ${statCard('Profit Factor', s.profitFactor, pfColor)}
      ${statCard('Avg Win (R)', s.avgWinR + 'R', 'green')}
      ${statCard('Open Signals', s.openCount, 'cyan')}
    </div>

    <div class="bt-chart-row">
      <div class="panel">
        <div class="panel-header"><span>📈 TP Distribution</span></div>
        <div class="tp-dist">
          ${tpBar('TP3 (4R)', s.tp3, s.total, '#10b981')}
          ${tpBar('TP2 (2.5R)', s.tp2, s.total, '#3b82f6')}
          ${tpBar('TP1 (1.5R)', s.tp1, s.total, '#06b6d4')}
          ${tpBar('Stop Loss', s.losses, s.total, '#ef4444')}
          ${tpBar('Expired', s.expired, s.total, '#64748b')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><span>💡 Long vs Short</span></div>
        <div class="dir-stats">
          <div class="dir-row">
            <span class="bull">Long</span>
            <div class="dir-bar-wrap"><div class="dir-bar bull" style="width:${s.byDir?.bullish?.w && (s.byDir.bullish.w/(s.byDir.bullish.w+s.byDir.bullish.l)*100)||0}%"></div></div>
            <span>${s.byDir?.bullish?.w||0}W / ${s.byDir?.bullish?.l||0}L</span>
          </div>
          <div class="dir-row">
            <span class="red">Short</span>
            <div class="dir-bar-wrap"><div class="dir-bar bear" style="width:${s.byDir?.bearish?.w && (s.byDir.bearish.w/(s.byDir.bearish.w+s.byDir.bearish.l)*100)||0}%"></div></div>
            <span>${s.byDir?.bearish?.w||0}W / ${s.byDir?.bearish?.l||0}L</span>
          </div>
        </div>
        <div class="panel-header mt16"><span>🏆 Best Pairs</span></div>
        <div class="best-pairs">
          ${Object.entries(s.byPair||{}).sort(([,a],[,b])=>b.pnl-a.pnl).slice(0,5).map(([sym,d])=>`
            <div class="pair-perf">
              <span>${sym.replace('-USDT','/USDT')}</span>
              <span class="${d.pnl>=0?'green':'red'}">${(d.pnl>=0?'+':'')+d.pnl.toFixed(1)}R</span>
              <small>${d.wins}W ${d.losses}L</small>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  function statCard(label, val, cls) {
    return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-val ${cls}">${val}</div></div>`;
  }

  function tpBar(label, count, total, color) {
    const pct = total > 0 ? Math.round(count/total*100) : 0;
    return `<div class="tp-bar-row">
      <span class="tp-bar-label">${label}</span>
      <div class="tp-bar-track"><div class="tp-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="tp-bar-count">${count} (${pct}%)</span>
    </div>`;
  }

  function renderTable(signals) {
    return `
    <div class="panel mt16">
      <div class="panel-header">
        <span>📋 Signal History</span>
        <select id="btFilterStatus" onchange="BacktestUI.filterTable()">
          <option value="all">All Status</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>
      <div class="sig-table-wrap">
        <table class="sig-table" id="btTable">
          <thead>
            <tr>
              <th>Pair</th><th>Dir</th><th>Entry</th><th>SL</th><th>TP1</th>
              <th>R:R</th><th>Conf%</th><th>Status</th><th>Result</th><th>PnL</th>
              <th>TP1</th><th>TP2</th><th>Created</th><th>Action</th>
            </tr>
          </thead>
          <tbody id="btTbody">
            ${renderRows(signals)}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function renderRows(signals) {
    return signals.slice(0,200).map(s => {
      const bull = s.direction === 'bullish';
      const res  = s.result || '-';
      const pnl  = s.pnlR !== null && s.pnlR !== undefined ? (s.pnlR>=0?'+':'')+s.pnlR+'R' : '-';
      const pnlCls = s.pnlR > 0 ? 'green' : s.pnlR < 0 ? 'red' : '';
      const statusCls = s.status==='OPEN'?'cyan':s.status==='CLOSED'?'':'muted';
      const ago = timeAgo(s.createdAt);
      return `<tr onclick="App.showDetail('${s.id}')" style="cursor:pointer">
        <td><strong>${s.pair}</strong></td>
        <td><span class="dir-badge ${bull?'bull':'bear'}">${bull?'↑L':'↓S'}</span></td>
        <td class="mono">$${s.entry}</td>
        <td class="mono red">$${s.sl}</td>
        <td class="mono green">$${s.tp1}</td>
        <td><span class="rr-badge">1:${s.rr}</span></td>
        <td>${s.confidence}%</td>
        <td class="${statusCls}">${s.status}</td>
        <td>${res}</td>
        <td class="${pnlCls}">${pnl}</td>
        <td>${s.tp1Hit?'✅':'⬜'}</td>
        <td>${s.tp2Hit?'✅':'⬜'}</td>
        <td class="muted">${ago}</td>
        <td><button class="btn-xs" onclick="event.stopPropagation();App.showDetail('${s.id}')">View</button></td>
      </tr>`;
    }).join('');
  }

  function filterTable() {
    const val = document.getElementById('btFilterStatus')?.value || 'all';
    const all = BacktestEngine.getAll();
    const filtered = val === 'all' ? all : all.filter(s => s.status === val);
    const tbody = document.getElementById('btTbody');
    if (tbody) tbody.innerHTML = renderRows(filtered);
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff/60000);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m/60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h/24) + 'd ago';
  }

  return { render, filterTable };
})();

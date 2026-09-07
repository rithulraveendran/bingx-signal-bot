/**
 * Signal Detail Component
 * Full CSTI breakdown, checklist, TradingView chart, trade copy
 */
const DetailUI = (() => {
  let _currentSignal = null;

  function render(signalId) {
    const root = document.getElementById('detailRoot');
    if (!root) return;

    // Try scanner signals first, then localStorage
    let sig = ScannerUI.getSignals().find(s => s.id === signalId)
           || BacktestEngine.getSignal(signalId);

    if (!sig) {
      root.innerHTML = `<div class="empty-state" style="padding:60px">Signal not found. Return to <a href="#" onclick="App.goTo('scanner')">Scanner</a>.</div>`;
      return;
    }
    _currentSignal = sig;

    const bull  = sig.direction === 'bullish';
    const dirClass = bull ? 'bull' : 'bear';
    const icon = bull ? '📈' : '📉';
    const stored = BacktestEngine.getSignal(sig.id) || sig;

    root.innerHTML = `
      <div class="detail-back" onclick="App.goTo('scanner')">← Back to Scanner</div>

      <div class="detail-hero ${dirClass}">
        <div class="detail-hero-left">
          <div class="detail-pair">${sig.pair} <span class="detail-dir ${dirClass}">${bull?'↑ LONG':'↓ SHORT'}</span></div>
          <div class="detail-price">$${sig.entry}</div>
          <div class="detail-session">${sig.session?.emoji} ${sig.session?.name} · ${sig.session?.phase}</div>
        </div>
        <div class="detail-hero-right">
          <div class="conf-circle ${bull?'bull':'bear'}">
            <span class="conf-num">${sig.confidence}%</span>
            <span class="conf-lbl">Confidence</span>
          </div>
          <div class="score-info">${sig.score} pts · ${sig.passCount}/${sig.totalChecks} checks</div>
        </div>
      </div>

      <div class="detail-grid">
        <!-- CSTI Card -->
        <div class="panel csti-panel">
          <div class="panel-header"><span>🧩 CSTI Framework</span></div>
          <div class="csti-row">
            <div class="csti-label">📌 CONDITION</div>
            <div class="csti-val">${sig.condition}</div>
          </div>
          <div class="csti-row">
            <div class="csti-label">🎯 SETUP</div>
            <div class="csti-val">${sig.setup}</div>
          </div>
          <div class="csti-row">
            <div class="csti-label">⚡ TRIGGER</div>
            <div class="csti-val">${sig.trigger}</div>
          </div>
          <div class="csti-row">
            <div class="csti-label">❌ INVALIDATION</div>
            <div class="csti-val red">${sig.invalidation}</div>
          </div>
        </div>

        <!-- Trade Levels -->
        <div class="panel levels-panel">
          <div class="panel-header"><span>💰 Trade Levels</span></div>
          <div class="levels-grid">
            <div class="level-item entry"><span>Entry</span><strong>$${sig.entry}</strong><small>Current price</small></div>
            <div class="level-item tp tp1 ${stored.tp1Hit?'hit':''}"><span>TP1 ${stored.tp1Hit?'✅':''}</span><strong>$${sig.tp1}</strong><small>1:1.5 R:R</small></div>
            <div class="level-item tp tp2 ${stored.tp2Hit?'hit':''}"><span>TP2 ${stored.tp2Hit?'✅':''}</span><strong>$${sig.tp2}</strong><small>1:2.5 R:R</small></div>
            <div class="level-item tp tp3 ${stored.tp3Hit?'hit':''}"><span>TP3 ${stored.tp3Hit?'✅':''}</span><strong>$${sig.tp3}</strong><small>1:4 R:R</small></div>
            <div class="level-item sl ${stored.slHit?'hit':''}"><span>Stop Loss ${stored.slHit?'❌':''}</span><strong class="red">$${sig.sl}</strong><small>Risk: ${sig.riskPct}%</small></div>
            <div class="level-item rr-box"><span>Risk:Reward</span><strong class="cyan">1:${sig.rr}</strong><small>Minimum 1:${sig.rr}</small></div>
          </div>
          <button class="btn btn-full mt16" onclick="DetailUI.copyTrade()">📋 Copy Trade Parameters</button>
        </div>

        <!-- Position Size Calculator -->
        <div class="panel calc-panel">
          <div class="panel-header"><span>🧮 Position Size Calculator</span></div>
          <div class="calc-grid">
            <div class="calc-input">
              <label>Account Size (USDT)</label>
              <input type="number" id="calcAcc" value="1000" oninput="DetailUI.calcPos()">
            </div>
            <div class="calc-input">
              <label>Risk %</label>
              <input type="number" id="calcRisk" value="1" step="0.5" max="5" oninput="DetailUI.calcPos()">
            </div>
            <div class="calc-result">
              <label>Position Size (USDT)</label>
              <div id="calcRes" class="res-val mono cyan">$0.00</div>
            </div>
            <div class="calc-result">
              <label>Amount to Risk</label>
              <div id="calcRiskAmt" class="res-val mono red">$0.00</div>
            </div>
          </div>
        </div>

        <!-- Checklist -->
        <div class="panel">
          <div class="panel-header"><span>✅ Pre-Trade Checklist</span></div>
          <div class="checklist">
            ${(sig.checklist||[]).map(c => `
              <div class="check-item ${c.ok?'pass':'fail'}">
                <span class="check-icon">${c.ok?'✅':'⚠️'}</span>
                <div class="check-body">
                  <div class="check-label">${c.label}</div>
                  <div class="check-detail">${c.detail}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Indicators -->
        <div class="panel">
          <div class="panel-header"><span>📊 Technical Indicators</span></div>
          <div class="ind-grid">
            ${indItem('RSI 14', sig.indicators?.rsi, getRSIColor(sig.indicators?.rsi, bull))}
            ${indItem('MACD Line', sig.indicators?.macd, '')}
            ${indItem('ATR 14', sig.indicators?.atr, '')}
            ${indItem('Vol Ratio', sig.indicators?.volRatio + 'x', parseFloat(sig.indicators?.volRatio)>=1.5?'green':'')}
            ${indItem('EMA 9', sig.indicators?.ema9, '')}
            ${indItem('EMA 21', sig.indicators?.ema21, '')}
            ${indItem('EMA 50', sig.indicators?.ema50, '')}
          </div>
        </div>

        <!-- Confluence Factors -->
        <div class="panel">
          <div class="panel-header"><span>🔗 Confluence Factors</span></div>
          <div class="factor-list">
            ${(sig.factors||[]).map(f=>`
              <div class="factor-item">
                <span class="factor-pts">+${f.pts}</span>
                <span class="factor-lbl">${f.label}</span>
              </div>`).join('')}
          </div>
        </div>

        <!-- ICT Zones -->
        <div class="panel">
          <div class="panel-header"><span>🗺️ ICT / SMC Zones</span></div>
          <div class="zones-list">
            ${zoneCard('FVG', sig.zones?.fvg)}
            ${zoneCard('Order Block', sig.zones?.ob)}
            ${zoneCard('High-Prob FVG', sig.zones?.hpFVG)}
            ${sweepCard(sig.zones?.sweep)}
          </div>
        </div>
      </div>

      <!-- TradingView Chart -->
      <div class="panel mt16">
        <div class="panel-header">
          <span>📈 TradingView Chart</span>
          <select id="tvTfSelect" onchange="DetailUI.updateChart()">
            <option value="60">1 Hour</option>
            <option value="15">15 Minutes</option>
            <option value="D">Daily</option>
            <option value="240">4 Hours</option>
          </select>
        </div>
        <div id="tvChartWrap" class="tv-wrap">
          <iframe id="tvChart" style="width:100%;height:500px;border:none;border-radius:12px" src=""></iframe>
        </div>
      </div>`;

    updateChart();
    setTimeout(calcPos, 100);
  }

  function indItem(label, val, cls) {
    return `<div class="ind-item"><span class="ind-label">${label}</span><strong class="${cls}">${val||'N/A'}</strong></div>`;
  }

  function getRSIColor(rsi, bull) {
    const v = parseFloat(rsi);
    if (isNaN(v)) return '';
    if (bull) return v < 30 ? 'green' : v > 70 ? 'red' : '';
    return v > 70 ? 'red' : v < 30 ? 'green' : '';
  }

  function zoneCard(label, zone) {
    if (!zone) return `<div class="zone-item inactive"><span>${label}</span><span>Not detected</span></div>`;
    return `<div class="zone-item active">
      <span>${label}</span>
      <span class="mono">[${zone.bottom?.toFixed(4)||'?'} – ${zone.top?.toFixed(4)||'?'}]</span>
      ${zone.hpFactors ? `<small>${zone.hpFactors.join(', ')}</small>` : ''}
      ${zone.iofed ? '<span class="tag-sm">IOFED</span>' : ''}
      ${zone.ce_touched ? '<span class="tag-sm">CE Touched</span>' : ''}
    </div>`;
  }

  function sweepCard(sweep) {
    if (!sweep) return `<div class="zone-item inactive"><span>Liquidity Sweep</span><span>Not detected</span></div>`;
    return `<div class="zone-item active sweep">
      <span>${sweep.type} Sweep</span>
      <span class="mono">@ ${sweep.price?.toFixed(4)}</span>
    </div>`;
  }

  function updateChart() {
    const sig = _currentSignal;
    if (!sig) return;
    const tf = document.getElementById('tvTfSelect')?.value || '60';
    const tv = document.getElementById('tvChart');
    if (!tv) return;
    // Use BingX symbol on TradingView: BINGX:BTCUSDT
    const tvSym = 'BINGX:' + sig.symbol.replace('-','');
    tv.src = `https://s.tradingview.com/widgetembed/?frameElementId=tv_chart&symbol=${tvSym}&interval=${tf}&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=1e1e2d&theme=dark&style=1&timezone=exchange&withdateranges=1&hide_side_toolbar=0&allow_symbol_change=1&calendar=0&hotlist=0&news=0&show_popup_button=0&popup_width=1000&popup_height=650`;
  }

  function copyTrade() {
    const s = _currentSignal;
    if (!s) return;
    const text = `BingX Signal - ${s.pair} ${s.direction.toUpperCase()}
Entry:  $${s.entry}
SL:     $${s.sl}  (risk ${s.riskPct}%)
TP1:    $${s.tp1}
TP2:    $${s.tp2}
TP3:    $${s.tp3}
R:R:    1:${s.rr}
Confidence: ${s.confidence}%
Setup: ${s.setup}
Trigger: ${s.trigger}
Invalidation: ${s.invalidation}
📊 Generated by BingX Signal Bot`;
    navigator.clipboard.writeText(text).then(() => App.toast('✅ Trade parameters copied!', 'success'));
  }

  function calcPos() {
    if (!_currentSignal) return;
    const acc = parseFloat(document.getElementById('calcAcc')?.value || 0);
    const risk = parseFloat(document.getElementById('calcRisk')?.value || 0);
    const riskAmt = acc * (risk / 100);
    const slDistPct = _currentSignal.riskPct / 100;
    
    let posSize = 0;
    if (slDistPct > 0) {
      posSize = riskAmt / slDistPct;
    }
    
    document.getElementById('calcRiskAmt').innerText = `$${riskAmt.toFixed(2)}`;
    document.getElementById('calcRes').innerText = `$${posSize.toFixed(2)}`;
  }

  return { render, updateChart, copyTrade, calcPos };
})();

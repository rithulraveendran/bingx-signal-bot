/**
 * Signal Generation Engine — CSTI Framework
 * Multi-timeframe confluence scoring for swing trades (1-2 day holds)
 */
const SignalEngine = (() => {
  const MIN_SCORE = 7;
  const MIN_RR    = 1.5;

  // ── HTF Directional Bias ──────────────────────────────────────────────────
  function htfBias(daily, h4) {
    if (!daily || daily.length < 30) return { bias:'ranging', strength:0, score:0 };
    const closes = daily.map(c => c.close);
    const e21  = Indicators.ema(closes, 21);
    const e50  = Indicators.ema(closes, 50);
    const e200 = Indicators.ema(closes, Math.min(200, closes.length - 1));
    const n = closes.length - 1;
    const p = closes[n], e21n = e21[n], e50n = e50[n], e200n = e200[n];

    let sc = 0;
    if (p > e21n) sc++;  else sc--;
    if (e21n > e50n) sc++; else sc--;
    if (e50n > e200n) sc++; else sc--;
    if (p > e200n) sc++; else sc--;

    // 4H weight
    if (h4 && h4.length > 20) {
      const h4c = h4.map(c => c.close);
      const h4e = Indicators.ema(h4c, 21);
      const hn  = h4c.length - 1;
      sc += h4c[hn] > h4e[hn] ? 0.5 : -0.5;
    }

    const bias = sc > 1.5 ? 'bullish' : sc < -1.5 ? 'bearish' : 'ranging';
    const strength = Math.min(Math.abs(sc) / 4.5 * 100, 100);
    return { bias, strength: Math.round(strength), score: sc,
      ema21: e21n, ema50: e50n, ema200: e200n, price: p };
  }

  // ── Single-TF Analysis ────────────────────────────────────────────────────
  function analyzeTF(candles) {
    if (!candles || candles.length < 50) return null;
    const C = candles.map(c => c.close);
    const H = candles.map(c => c.high);
    const L = candles.map(c => c.low);
    const V = candles.map(c => c.volume);
    const n = C.length - 1;

    const rsiV   = Indicators.rsi(C, 14);
    const macdV  = Indicators.macd(C);
    const atrV   = Indicators.atr(H, L, C, 14);
    const volMA  = Indicators.volumeMA(V, 20);
    const e9     = Indicators.ema(C, 9);
    const e21    = Indicators.ema(C, 21);
    const e50    = Indicators.ema(C, 50);
    const bb     = Indicators.bollingerBands(C, 20, 2);
    const vwapV  = Indicators.vwap(candles);
    const stoch  = Indicators.stochasticRSI(C);

    const struct = ICT.detectStructure(candles);
    const fvgs   = ICT.detectFVGs(candles);
    const obs    = ICT.detectOrderBlocks(candles, struct);
    const sweeps = ICT.detectLiquiditySweeps(candles, struct.swingHighs, struct.swingLows);
    const hpfvg  = ICT.highProbFVGs(fvgs, obs, sweeps);
    const bo     = ICT.detectBreakout(candles, volMA);

    const price = C[n];

    // Nearest active zones
    const nearZone = (arr, cond) => arr.filter(cond).slice(-3).reverse()[0] || null;
    const bFVG  = nearZone(fvgs, f => f.type==='BULL' && f.top >= price*0.985 && f.bottom <= price*1.015);
    const rFVG  = nearZone(fvgs, f => f.type==='BEAR' && f.top >= price*0.985 && f.bottom <= price*1.015);
    const bOB   = nearZone(obs,  ob => !ob.swept && ob.type==='BULL_OB' && ob.top >= price*0.97 && ob.top <= price*1.015);
    const rOB   = nearZone(obs,  ob => !ob.swept && ob.type==='BEAR_OB' && ob.bottom <= price*1.03 && ob.bottom >= price*0.98);
    const hpFVG = nearZone(hpfvg, f => Math.abs(f.mid - price) / price < 0.025);
    const sweep = sweeps.filter(s => s.candleIndex >= n - 12).slice(-1)[0] || null;

    const lastBOS = struct.events.slice().reverse()[0] || null;
    const macdCrossB = n > 0 && macdV.line[n-1] < macdV.signal[n-1] && macdV.line[n] > macdV.signal[n];
    const macdCrossR = n > 0 && macdV.line[n-1] > macdV.signal[n-1] && macdV.line[n] < macdV.signal[n];

    return {
      price, rsi: rsiV[n], atr: atrV[n],
      macd: { line:macdV.line[n], sig:macdV.signal[n], hist:macdV.histogram[n] },
      macdCrossB, macdCrossR,
      vol: { cur:V[n], avg:volMA[n]||1, surge: V[n] > (volMA[n]||1)*1.5 },
      ema: { e9:e9[n], e21:e21[n], e50:e50[n] },
      bb: bb[n], vwap: vwapV[n],
      stoch: stoch.k ? stoch.k[stoch.k.length-1] : null,
      struct, lastBOS,
      fvgs, obs, sweeps, hpfvg,
      bFVG, rFVG, bOB, rOB, hpFVG, sweep,
      breakout: bo, trend: struct.trend,
      candles
    };
  }

  // ── Candle Pattern ────────────────────────────────────────────────────────
  function candlePattern(c, p, dir) {
    if (!c || !p) return dir==='bullish' ? '🟢 Price at Demand Zone' : '🔴 Price at Supply Zone';
    const body = c.close - c.open, pBody = p.close - p.open;
    const rng = c.high - c.low || 1;
    const lw = Math.min(c.open,c.close) - c.low;
    const uw = c.high - Math.max(c.open,c.close);
    if (dir==='bullish' && body>0 && pBody<0 && c.close>p.open && c.open<p.close) return '🕯️ Bullish Engulfing (15M)';
    if (dir==='bearish' && body<0 && pBody>0 && c.close<p.open && c.open>p.close) return '🕯️ Bearish Engulfing (15M)';
    if (dir==='bullish' && lw > rng*0.6 && uw < rng*0.2) return '🔨 Hammer Pin Bar (15M)';
    if (dir==='bearish' && uw > rng*0.6 && lw < rng*0.2) return '⭐ Shooting Star (15M)';
    if (c.high < p.high && c.low > p.low) return '📊 Inside Bar Compression (15M)';
    return dir==='bullish' ? '🟢 Bullish Momentum Candle' : '🔴 Bearish Momentum Candle';
  }

  // ── Build Checklist ───────────────────────────────────────────────────────
  function buildChecklist(dir, htf, h1, m15, rr, fvg, ob, sweep) {
    const bull = dir==='bullish';
    return [
      { label:'📈 HTF Trend Aligned (1D/4H)', ok: htf.bias!=='ranging',
        detail: `${htf.bias} — ${htf.strength}% strength` },
      { label:'🔄 Break of Structure / CHoCH', ok: !!h1.lastBOS,
        detail: h1.lastBOS ? h1.lastBOS.type.replace('_',' ') : 'Not confirmed' },
      { label:'🎯 Fair Value Gap at Entry', ok: !!fvg,
        detail: fvg ? `${fvg.type} FVG [${fvg.bottom.toFixed(4)}–${fvg.top.toFixed(4)}]` : 'Not present' },
      { label:'🟦 Order Block Confluence', ok: !!ob,
        detail: ob ? `${ob.type.replace('_',' ')} confirmed` : 'Not present' },
      { label:'💧 Liquidity Sweep', ok: !!sweep,
        detail: sweep ? `${sweep.type} swept at ${sweep.price.toFixed(4)}` : 'Not detected' },
      { label:'📊 RSI Confirmation', ok: bull ? h1.rsi < 55 : h1.rsi > 45,
        detail: `RSI: ${h1.rsi ? h1.rsi.toFixed(1) : 'N/A'}` },
      { label:'📉 MACD Aligned', ok: bull ? h1.macd.line > h1.macd.sig : h1.macd.line < h1.macd.sig,
        detail: `MACD ${bull ? 'positive' : 'negative'}` },
      { label:'🔊 Volume Confirms', ok: m15.vol.surge,
        detail: m15.vol.avg > 0 ? `${(m15.vol.cur/m15.vol.avg).toFixed(1)}x avg` : 'N/A' },
      { label:'⚖️ Risk/Reward ≥ 1:2', ok: rr >= 2,
        detail: `1:${rr.toFixed(2)} R:R` },
      { label:'📐 EMA Stack Aligned', ok: bull
        ? h1.ema.e9 > h1.ema.e21 && h1.ema.e21 > h1.ema.e50
        : h1.ema.e9 < h1.ema.e21 && h1.ema.e21 < h1.ema.e50,
        detail: `EMA9: ${h1.ema.e9.toFixed(2)}` },
    ];
  }

  // ── Main Analysis ─────────────────────────────────────────────────────────
  async function analyzeSymbol(symbol, cachedData) {
    try {
      let d1, d4h, d1h, d15m, d5m;
      if (cachedData) {
        d1=cachedData['1d']; d4h=cachedData['4h']; d1h=cachedData['1h'];
        d15m=cachedData['15m']; d5m=cachedData['5m'];
      } else {
        [d1,d4h,d1h,d15m,d5m] = await Promise.all([
          BingXAPI.getKlines(symbol,'1d',100),
          BingXAPI.getKlines(symbol,'4h',150),
          BingXAPI.getKlines(symbol,'1h',200),
          BingXAPI.getKlines(symbol,'15m',200),
          BingXAPI.getKlines(symbol,'5m',100),
        ]);
      }
      if (!d1h || d1h.length < 50) return null;

      const htf  = htfBias(d1, d4h);
      if (htf.bias === 'ranging') return null;

      const h1   = analyzeTF(d1h);
      const m15  = analyzeTF(d15m);
      const m5   = d5m ? analyzeTF(d5m) : null;

      if (!h1 || !m15) return null;

      return scoreSignal(symbol, htf, h1, m15, m5, d15m);
    } catch (e) {
      console.warn('[Signal]', symbol, e.message);
      return null;
    }
  }

  function scoreSignal(symbol, htf, h1, m15, m5, m15Candles) {
    const dir = htf.bias;
    const bull = dir === 'bullish';
    let score = 0;
    const factors = [], confluences = [];

    const add = (pts, label, conf) => {
      score += pts;
      factors.push({ label, pts });
      if (conf) confluences.push(conf);
    };

    // HTF Bias
    add(2, bull?'1D/4H Bullish Bias':'1D/4H Bearish Bias',
          bull?'Daily trend: BULLISH':'Daily trend: BEARISH');

    // BOS / CHoCH on 1H
    if (h1.lastBOS) {
      const t = h1.lastBOS.type;
      const ok = bull ? (t==='BOS_BULL'||t==='CHoCH_BULL') : (t==='BOS_BEAR'||t==='CHoCH_BEAR');
      if (ok) add(2, `1H ${t.replace('_',' ')}`, `1H ${t.replace('_',' ')} @ ${h1.lastBOS.price.toFixed(4)}`);
    }

    // FVG
    const fvg = bull ? h1.bFVG : h1.rFVG;
    if (fvg) add(2, 'FVG at Entry Zone', `1H ${fvg.type} FVG [${fvg.bottom.toFixed(4)}–${fvg.top.toFixed(4)}]`);

    // High-Prob FVG
    if (h1.hpFVG) {
      add(2, `High-Prob FVG (${h1.hpFVG.hpFactors.join(', ')})`, h1.hpFVG.hpFactors.join(' + '));
    }

    // Order Block
    const ob = bull ? h1.bOB : h1.rOB;
    if (ob && !ob.isBreaker) add(2, 'Order Block Confluence', `1H ${ob.type.replace('_',' ')}`);

    // Breaker Block
    const brk = h1.obs.find(o => o.isBreaker && (
      (bull && o.breakerType==='BULL' && o.top>=h1.price*0.97 && o.top<=h1.price*1.02) ||
      (!bull && o.breakerType==='BEAR' && o.bottom<=h1.price*1.03 && o.bottom>=h1.price*0.98)
    ));
    if (brk) add(1, 'Breaker Block', 'Breaker Block as ' + (bull?'Support':'Resistance'));

    // Liquidity Sweep
    if (h1.sweep) {
      const ok = (bull && h1.sweep.type==='SSL') || (!bull && h1.sweep.type==='BSL');
      if (ok) add(2, `${h1.sweep.type} Liquidity Sweep`, `${h1.sweep.type} swept @ ${h1.sweep.price.toFixed(4)}`);
    }

    // RSI
    if (bull && h1.rsi && h1.rsi < 40) add(1, `RSI Oversold (${h1.rsi.toFixed(1)})`, `1H RSI: ${h1.rsi.toFixed(1)}`);
    if (!bull && h1.rsi && h1.rsi > 60) add(1, `RSI Overbought (${h1.rsi.toFixed(1)})`, `1H RSI: ${h1.rsi.toFixed(1)}`);

    // MACD Cross
    if (bull && h1.macdCrossB) add(1, 'MACD Bullish Cross (1H)', '1H MACD Bullish Crossover');
    if (!bull && h1.macdCrossR) add(1, 'MACD Bearish Cross (1H)', '1H MACD Bearish Crossover');

    // Volume
    if (m15.vol.surge) add(1, `Volume Surge ${(m15.vol.cur/m15.vol.avg).toFixed(1)}x`, `15M Volume: ${(m15.vol.cur/m15.vol.avg).toFixed(1)}x avg`);

    // EMA alignment
    if (bull && h1.ema.e9>h1.ema.e21 && h1.ema.e21>h1.ema.e50) add(1, 'EMA Bull Stack 9>21>50', 'EMA aligned bullish');
    if (!bull && h1.ema.e9<h1.ema.e21 && h1.ema.e21<h1.ema.e50) add(1, 'EMA Bear Stack 9<21<50', 'EMA aligned bearish');

    // Breakout
    if (h1.breakout) {
      const ok = (bull && h1.breakout.type==='BULL_BO') || (!bull && h1.breakout.type==='BEAR_BO');
      if (ok) add(2, `Breakout ${h1.breakout.volMult}x Volume`, `Breakout of key level @ ${h1.breakout.level.toFixed(4)}`);
    }

    // 15M BOS confirmation
    if (m15.lastBOS) {
      const ok = bull ? (m15.lastBOS.type==='BOS_BULL'||m15.lastBOS.type==='CHoCH_BULL')
                      : (m15.lastBOS.type==='BOS_BEAR'||m15.lastBOS.type==='CHoCH_BEAR');
      if (ok) add(1, '15M Structure Confirms', '15M BOS confirmed');
    }

    // Stoch RSI
    if (bull && m15.stoch !== null && m15.stoch < 20) add(1, `StochRSI Oversold (${m15.stoch.toFixed(0)})`, '15M StochRSI < 20');
    if (!bull && m15.stoch !== null && m15.stoch > 80) add(1, `StochRSI Overbought (${m15.stoch.toFixed(0)})`, '15M StochRSI > 80');

    // 5M confirmation
    if (m5 && m5.lastBOS) {
      const ok = bull ? m5.lastBOS.type.includes('BULL') : m5.lastBOS.type.includes('BEAR');
      if (ok) add(1, '5M Micro-Structure Confirms', '5M entry confirmation');
    }

    if (score < MIN_SCORE) return null;

    // ── Entry / SL / TP Calculation ────────────────────────────────────────
    const price = h1.price;
    const atr   = h1.atr || price * 0.005;
    let entry, sl, tp1, tp2, tp3;

    if (bull) {
      entry = price;
      const slRef = ob ? ob.bottom : (h1.struct.swingLows.slice(-1)[0]?.price ?? price*0.97);
      sl  = slRef - atr * 0.5;
      const risk = entry - sl;
      tp1 = entry + risk * 1.5;
      tp2 = entry + risk * 2.5;
      tp3 = entry + risk * 4.0;
    } else {
      entry = price;
      const slRef = ob ? ob.top : (h1.struct.swingHighs.slice(-1)[0]?.price ?? price*1.03);
      sl  = slRef + atr * 0.5;
      const risk = sl - entry;
      tp1 = entry - risk * 1.5;
      tp2 = entry - risk * 2.5;
      tp3 = entry - risk * 4.0;
    }

    const risk = Math.abs(entry - sl);
    const rr   = Math.abs(tp1 - entry) / (risk || 1);
    if (rr < MIN_RR) return null;

    const MAX_SCORE = 25;
    const confidence = Math.min(Math.round(score / MAX_SCORE * 100), 95);

    const m15Last = m15Candles && m15Candles.length >= 2 ? m15Candles[m15Candles.length-1] : null;
    const m15Prev = m15Candles && m15Candles.length >= 2 ? m15Candles[m15Candles.length-2] : null;
    const trigger  = candlePattern(m15Last, m15Prev, dir);
    const session  = ICT.getSession();

    const checklist = buildChecklist(dir, htf, h1, m15, rr, fvg, ob, h1.sweep);
    const passCount = checklist.filter(c => c.ok).length;

    const fmt = (n, d=4) => isNaN(n) ? 'N/A' : parseFloat(n.toFixed(d));

    return {
      id:         `${symbol}-${Date.now()}`,
      symbol,
      pair:       symbol.replace('-USDT', '/USDT'),
      direction:  dir,
      confidence,
      score,
      passCount,
      totalChecks: checklist.length,

      // CSTI
      condition:    `${bull?'📈':'📉'} ${dir.toUpperCase()} | ${htf.bias} ${htf.strength}% strength`,
      setup:        confluences.slice(0,4).join(' + ') || 'Multi-confluence setup',
      trigger,
      invalidation: bull ? `Close below ${fmt(sl)}` : `Close above ${fmt(sl)}`,

      // Levels
      entry: fmt(entry), sl: fmt(sl),
      tp1: fmt(tp1), tp2: fmt(tp2), tp3: fmt(tp3),
      rr:  parseFloat(rr.toFixed(2)),
      riskPct: parseFloat(((Math.abs(entry-sl)/entry)*100).toFixed(2)),

      // Metadata
      htf, factors, confluences, session,
      checklist,
      indicators: {
        rsi:    h1.rsi?.toFixed(1) ?? 'N/A',
        macd:   h1.macd.line?.toFixed(4) ?? 'N/A',
        atr:    atr.toFixed(4),
        volRatio: (h1.vol.cur/h1.vol.avg).toFixed(2),
        ema9:   h1.ema.e9.toFixed(4),
        ema21:  h1.ema.e21.toFixed(4),
        ema50:  h1.ema.e50.toFixed(4),
      },
      zones: { fvg: fvg||null, ob: ob||null, sweep: h1.sweep||null, hpFVG: h1.hpFVG||null },

      status:    'OPEN',
      tp1Hit:    false, tp2Hit: false, tp3Hit: false, slHit: false,
      createdAt: Date.now(),
      pnlR:      null,
    };
  }

  return { analyzeSymbol, MIN_SCORE };
})();

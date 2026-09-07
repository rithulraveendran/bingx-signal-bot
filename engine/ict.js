/**
 * ICT / Smart Money Concepts Engine
 * FVG, Order Blocks, BOS/CHoCH, Breaker Blocks,
 * Liquidity Sweeps, AMD Session, Fibonacci, CE, IOFED
 */
const ICT = (() => {
  const LB = 3; // swing lookback bars each side

  // ── Swing Points ──────────────────────────────────────────────────────────
  function swingHighs(candles, lb = LB) {
    const out = [];
    for (let i = lb; i < candles.length - lb; i++) {
      let ok = true;
      for (let j = 1; j <= lb; j++) {
        if (candles[i-j].high >= candles[i].high || candles[i+j].high >= candles[i].high) { ok = false; break; }
      }
      if (ok) out.push({ index: i, price: candles[i].high, time: candles[i].time });
    }
    return out;
  }

  function swingLows(candles, lb = LB) {
    const out = [];
    for (let i = lb; i < candles.length - lb; i++) {
      let ok = true;
      for (let j = 1; j <= lb; j++) {
        if (candles[i-j].low <= candles[i].low || candles[i+j].low <= candles[i].low) { ok = false; break; }
      }
      if (ok) out.push({ index: i, price: candles[i].low, time: candles[i].time });
    }
    return out;
  }

  // ── Market Structure — BOS / CHoCH ────────────────────────────────────────
  function detectStructure(candles) {
    const sHigh = swingHighs(candles);
    const sLow  = swingLows(candles);
    const events = [];
    let prevHigh = null, prevLow = null, trend = 'neutral';

    for (let i = LB; i < candles.length; i++) {
      const c = candles[i];

      // Bullish BOS / CHoCH
      if (prevHigh && c.close > prevHigh.price) {
        const type = trend === 'bearish' ? 'CHoCH_BULL' : 'BOS_BULL';
        events.push({ index: i, type, price: prevHigh.price, time: c.time });
        trend = 'bullish';
      }
      // Bearish BOS / CHoCH
      if (prevLow && c.close < prevLow.price) {
        const type = trend === 'bullish' ? 'CHoCH_BEAR' : 'BOS_BEAR';
        events.push({ index: i, type, price: prevLow.price, time: c.time });
        trend = 'bearish';
      }

      const sh = sHigh.find(s => s.index === i);
      const sl = sLow.find(s => s.index === i);
      if (sh) prevHigh = sh;
      if (sl) prevLow = sl;
    }
    return { events, swingHighs: sHigh, swingLows: sLow, trend };
  }

  // ── Fair Value Gaps ───────────────────────────────────────────────────────
  function detectFVGs(candles) {
    const fvgs = [];
    for (let i = 2; i < candles.length; i++) {
      const [c0, c1, c2] = [candles[i-2], candles[i-1], candles[i]];

      if (c0.high < c2.low) { // Bullish FVG
        fvgs.push({ type:'BULL', top:c2.low, bottom:c0.high,
          mid:(c2.low+c0.high)/2, index:i, time:c2.time,
          size:c2.low-c0.high, filled:false, ce_touched:false, iofed:false });
      }
      if (c0.low > c2.high) { // Bearish FVG
        fvgs.push({ type:'BEAR', top:c0.low, bottom:c2.high,
          mid:(c0.low+c2.high)/2, index:i, time:c2.time,
          size:c0.low-c2.high, filled:false, ce_touched:false, iofed:false });
      }
    }

    // Mark fill status
    for (const fvg of fvgs) {
      for (let j = fvg.index + 1; j < candles.length; j++) {
        const c = candles[j];
        if (fvg.type === 'BULL') {
          if (c.low <= fvg.bottom) { fvg.filled = true; break; }
          if (!fvg.ce_touched && c.low <= fvg.mid) fvg.ce_touched = true;
          if (!fvg.iofed && c.low <= fvg.top && c.close > fvg.mid) fvg.iofed = true;
        } else {
          if (c.high >= fvg.top) { fvg.filled = true; break; }
          if (!fvg.ce_touched && c.high >= fvg.mid) fvg.ce_touched = true;
          if (!fvg.iofed && c.high >= fvg.bottom && c.close < fvg.mid) fvg.iofed = true;
        }
      }
    }
    return fvgs.filter(f => !f.filled);
  }

  // ── Order Blocks ──────────────────────────────────────────────────────────
  function detectOrderBlocks(candles, structure) {
    const obs = [];
    for (const bos of structure.events) {
      if (bos.type === 'BOS_BULL' || bos.type === 'CHoCH_BULL') {
        for (let i = bos.index - 1; i >= Math.max(0, bos.index - 30); i--) {
          if (candles[i].close < candles[i].open) {
            obs.push({
              type:'BULL_OB', top:candles[i].high, bottom:candles[i].open,
              mid:(candles[i].high+candles[i].open)/2,
              index:i, bosIndex:bos.index, time:candles[i].time,
              swept:false, isBreaker:false
            });
            break;
          }
        }
      }
      if (bos.type === 'BOS_BEAR' || bos.type === 'CHoCH_BEAR') {
        for (let i = bos.index - 1; i >= Math.max(0, bos.index - 30); i--) {
          if (candles[i].close > candles[i].open) {
            obs.push({
              type:'BEAR_OB', top:candles[i].close, bottom:candles[i].low,
              mid:(candles[i].close+candles[i].low)/2,
              index:i, bosIndex:bos.index, time:candles[i].time,
              swept:false, isBreaker:false
            });
            break;
          }
        }
      }
    }

    // Detect Breaker Blocks (OBs swept through)
    for (const ob of obs) {
      for (let j = ob.bosIndex; j < candles.length; j++) {
        if (ob.type === 'BULL_OB' && candles[j].close < ob.bottom) {
          ob.swept = true; ob.isBreaker = true; ob.breakerType = 'BEAR'; break;
        }
        if (ob.type === 'BEAR_OB' && candles[j].close > ob.top) {
          ob.swept = true; ob.isBreaker = true; ob.breakerType = 'BULL'; break;
        }
      }
    }
    return obs;
  }

  // ── Liquidity Sweeps ──────────────────────────────────────────────────────
  function detectLiquiditySweeps(candles, sHigh, sLow) {
    const sweeps = [];
    const start = Math.max(0, candles.length - 60);
    for (let i = start + 1; i < candles.length; i++) {
      const c = candles[i];
      // BSL sweep: wick above swing high, close back below
      for (const sh of sHigh) {
        if (sh.index < i && sh.index >= start - 20 &&
            c.high > sh.price && c.close < sh.price) {
          sweeps.push({ type:'BSL', price:sh.price, candleIndex:i, time:c.time });
          break;
        }
      }
      // SSL sweep: wick below swing low, close back above
      for (const sl of sLow) {
        if (sl.index < i && sl.index >= start - 20 &&
            c.low < sl.price && c.close > sl.price) {
          sweeps.push({ type:'SSL', price:sl.price, candleIndex:i, time:c.time });
          break;
        }
      }
    }
    return sweeps;
  }

  // ── High-Probability FVG ──────────────────────────────────────────────────
  function highProbFVGs(fvgs, obs, sweeps) {
    return fvgs.map(fvg => {
      const factors = [];
      let score = 0;

      // FVG + OB
      const ovOB = obs.find(ob => !ob.swept &&
        ((fvg.type==='BULL' && ob.type==='BULL_OB') || (fvg.type==='BEAR' && ob.type==='BEAR_OB')) &&
        ob.top >= fvg.bottom && ob.bottom <= fvg.top);
      if (ovOB) { score += 2; factors.push('FVG + Order Block'); }

      // FVG + Breaker
      const ovBrk = obs.find(ob => ob.isBreaker &&
        ((fvg.type==='BULL' && ob.breakerType==='BULL') || (fvg.type==='BEAR' && ob.breakerType==='BEAR')) &&
        ob.top >= fvg.bottom && ob.bottom <= fvg.top);
      if (ovBrk) { score += 2; factors.push('FVG + Breaker Block'); }

      // High/Low Sweep → FVG
      const swp = sweeps.find(s => s.candleIndex < fvg.index &&
        (fvg.index - s.candleIndex) <= 15 &&
        ((fvg.type==='BULL' && s.type==='SSL') || (fvg.type==='BEAR' && s.type==='BSL')));
      if (swp) { score += 2; factors.push('Liquidity Sweep → FVG'); }

      if (score === 0) return null;
      return { ...fvg, hpScore: score, hpFactors: factors };
    }).filter(Boolean);
  }

  // ── AMD / Session ─────────────────────────────────────────────────────────
  function getSession() {
    const h = new Date().getUTCHours();
    if (h >= 0  && h < 8)  return { name:'Asia Session',  color:'#f59e0b', phase:'ACCUMULATION',   emoji:'🌏' };
    if (h >= 7  && h < 12) return { name:'London Open',   color:'#3b82f6', phase:'MANIPULATION',   emoji:'🇬🇧' };
    if (h >= 12 && h < 17) return { name:'New York Open', color:'#10b981', phase:'DISTRIBUTION',   emoji:'🇺🇸' };
    if (h >= 17 && h < 21) return { name:'NY Afternoon',  color:'#8b5cf6', phase:'DISTRIBUTION',   emoji:'🌆' };
    return { name:'Off-Hours', color:'#64748b', phase:'CLOSING', emoji:'🌙' };
  }

  // ── Breakout Detection ────────────────────────────────────────────────────
  function detectBreakout(candles, volMA) {
    if (candles.length < 25) return null;
    const last = candles[candles.length - 1];
    const window = candles.slice(-25, -1);
    const hi = Math.max(...window.map(c => c.high));
    const lo = Math.min(...window.map(c => c.low));
    const avgVol = volMA[volMA.length - 1] || 1;
    const volSurge = last.volume > avgVol * 1.5;
    if (last.close > hi && volSurge) return { type:'BULL_BO', level:hi, volMult: (last.volume/avgVol).toFixed(1) };
    if (last.close < lo && volSurge) return { type:'BEAR_BO', level:lo, volMult: (last.volume/avgVol).toFixed(1) };
    return null;
  }

  return {
    swingHighs, swingLows, detectStructure, detectFVGs,
    detectOrderBlocks, detectLiquiditySweeps, highProbFVGs,
    getSession, detectBreakout
  };
})();

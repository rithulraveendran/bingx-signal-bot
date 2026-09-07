/**
 * Technical Indicators — Pure JS implementations
 * EMA, SMA, RSI, MACD, ATR, Bollinger Bands, Volume MA,
 * Stochastic RSI, VWAP, Pivot Points, Fibonacci
 */
const Indicators = (() => {

  function ema(values, period) {
    const k = 2 / (period + 1), result = [];
    let v = null;
    for (const x of values) {
      v = v === null ? x : x * k + v * (1 - k);
      result.push(v);
    }
    return result;
  }

  function sma(values, period) {
    return values.map((_, i) => {
      if (i < period - 1) return null;
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += values[j];
      return s / period;
    });
  }

  function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    if (closes.length < period + 1) return out;
    let avgG = 0, avgL = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      d > 0 ? avgG += d : avgL += Math.abs(d);
    }
    avgG /= period; avgL /= period;
    out[period] = 100 - 100 / (1 + avgG / (avgL || 1e-10));
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
      out[i] = 100 - 100 / (1 + avgG / (avgL || 1e-10));
    }
    return out;
  }

  function macd(closes, fast = 12, slow = 26, sig = 9) {
    const fastE = ema(closes, fast);
    const slowE = ema(closes, slow);
    const line = closes.map((_, i) => fastE[i] - slowE[i]);
    const sigLine = ema(line.slice(slow - 1), sig);
    const fullSig = new Array(slow - 1).fill(null).concat(sigLine);
    const hist = line.map((v, i) => fullSig[i] !== null ? v - fullSig[i] : null);
    return { line, signal: fullSig, histogram: hist };
  }

  function atr(highs, lows, closes, period = 14) {
    const tr = closes.map((c, i) => {
      if (i === 0) return highs[i] - lows[i];
      const pc = closes[i - 1];
      return Math.max(highs[i] - lows[i], Math.abs(highs[i] - pc), Math.abs(lows[i] - pc));
    });
    return ema(tr, period);
  }

  function bollingerBands(closes, period = 20, mult = 2) {
    const mid = sma(closes, period);
    return closes.map((_, i) => {
      if (mid[i] === null) return { upper: null, mid: null, lower: null };
      const slice = closes.slice(i - period + 1, i + 1);
      const m = mid[i];
      const sd = Math.sqrt(slice.reduce((s, v) => s + (v - m) ** 2, 0) / period) * mult;
      return { upper: m + sd, mid: m, lower: m - sd, bandwidth: (2 * sd) / m };
    });
  }

  function volumeMA(vols, period = 20) { return sma(vols, period); }

  function stochasticRSI(closes, rsiP = 14, stochP = 14, kS = 3, dS = 3) {
    const rsiV = rsi(closes, rsiP);
    const stK = rsiV.map((_, i) => {
      if (i < stochP - 1 || rsiV[i] === null) return null;
      const sl = rsiV.slice(i - stochP + 1, i + 1).filter(v => v !== null);
      const mn = Math.min(...sl), mx = Math.max(...sl);
      return mx === mn ? 50 : ((rsiV[i] - mn) / (mx - mn)) * 100;
    });
    const valid = stK.filter(v => v !== null);
    const ks = sma(valid, kS);
    const ds = sma(ks, dS);
    return { k: ks, d: ds };
  }

  function vwap(candles) {
    let cumV = 0, cumVP = 0;
    return candles.map(c => {
      const tp = (c.high + c.low + c.close) / 3;
      cumV += c.volume; cumVP += tp * c.volume;
      return cumVP / cumV;
    });
  }

  function pivots(high, low, close) {
    const pp = (high + low + close) / 3;
    return {
      pp,
      r1: 2*pp - low, r2: pp + (high - low), r3: high + 2*(pp - low),
      s1: 2*pp - high, s2: pp - (high - low), s3: low - 2*(high - pp)
    };
  }

  function fibonacci(swingHigh, swingLow, dir = 'bull') {
    const r = swingHigh - swingLow;
    const base = dir === 'bull' ? swingLow : swingHigh;
    const sign = dir === 'bull' ? 1 : -1;
    return {
      f0:    base,
      f236:  base + sign * r * 0.236,
      f382:  base + sign * r * 0.382,
      f5:    base + sign * r * 0.5,
      f618:  base + sign * r * 0.618,
      f705:  base + sign * r * 0.705,
      f786:  base + sign * r * 0.786,
      f1:    base + sign * r,
      ext1272: base + sign * r * 1.272,
      ext1618: base + sign * r * 1.618,
    };
  }

  return { ema, sma, rsi, macd, atr, bollingerBands, volumeMA, stochasticRSI, vwap, pivots, fibonacci };
})();

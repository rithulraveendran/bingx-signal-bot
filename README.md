# BingX Signal Bot 📈

> **Real-time BingX Futures Trading Signal Platform**

A fully browser-based trading signal scanner for BingX perpetual futures. No backend required. Powered by ICT/SMC analysis, multi-timeframe confluence scoring, and the CSTI signal framework.

## ✨ Features

- **Full BingX Scan** - All 400+ USDT perpetual futures pairs
- **ICT/SMC Engine** - FVG, Order Blocks, BOS/CHoCH, Liquidity Sweeps, Breaker Blocks
- **Multi-Timeframe** - 1D→4H (direction), 1H→15M (trend/entry), 5M (confirmation)
- **CSTI Framework** - Condition, Setup, Trigger, Invalidation for every signal
- **Confluence Scoring** - 15+ factors scored for high-probability setups
- **Swing Trade Focus** - 1-2 day hold targets with TP1/TP2/TP3
- **Performance Tracker** - Auto-closes signals via live price, tracks win rate/PnL
- **TradingView Charts** - Embedded chart for every signal
- **GitHub Pages / Vercel Ready** - Zero backend, pure static

## 🚀 Deploy

### Option 1: Vercel (Recommended - shareable link)
```bash
npx vercel --prod
```

### Option 2: GitHub Pages
1. Push to GitHub repo
2. Settings → Pages → Deploy from main branch

### Option 3: Run Locally
```bash
npx http-server . -p 3000 --cors
# Open http://localhost:3000
```

> **Note**: BingX API requires an HTTPS origin. Works on Vercel/GitHub Pages automatically.

## 📊 Signal Scoring

Each signal is scored from 0–25 points based on:

| Factor | Points |
|--------|--------|
| HTF Trend Aligned (1D/4H) | +2 |
| Break of Structure / CHoCH (1H) | +2 |
| Fair Value Gap at Entry | +2 |
| High-Probability FVG | +2 |
| Order Block Confluence | +2 |
| Liquidity Sweep Before Entry | +2 |
| Breakout with Volume | +2 |
| MACD Cross | +1 |
| RSI Oversold/Overbought | +1 |
| Volume Surge | +1 |
| EMA Stack Alignment | +1 |
| Breaker Block | +1 |
| 15M Structure Confirms | +1 |
| Stochastic RSI Extreme | +1 |
| 5M Micro-Structure | +1 |

**Minimum score to generate signal: 7 points**

## 🧩 ICT Concepts Implemented

- **FVG** (Fair Value Gap) - 3-candle imbalance detection
- **Consequent Encroachment (CE)** - FVG midpoint
- **IOFED** - Institutional Order Flow Entry Drill
- **Order Blocks** - Last opposing candle before BOS
- **Breaker Blocks** - Failed OBs that flip polarity
- **BOS / CHoCH** - Break of Structure / Change of Character
- **Liquidity Sweeps** - BSL/SSL detection
- **AMD** - Accumulation/Manipulation/Distribution session framework
- **High-Prob FVG** - FVG + OB, FVG + Breaker, Sweep → FVG

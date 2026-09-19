import type { Candle } from './market-generator';

export type StrategyType = 'trend_following' | 'mean_reversion' | 'momentum';

export interface StrategySignal {
  type: 'BUY' | 'SELL' | 'HOLD';
  price: number;
  time: number;
  reason: string;
}

export interface IndicatorData {
  smaFast?: number;
  smaSlow?: number;
  bollingerUpper?: number;
  bollingerLower?: number;
  bollingerMiddle?: number;
  rsi?: number;
}

export interface StrategyConfig {
  lookback: number; // base window parameter
}

export function calculateSMA(candles: Candle[], window: number): number | undefined {
  if (candles.length < window) return undefined;
  const slice = candles.slice(-window);
  const sum = slice.reduce((acc, c) => acc + c.close, 0);
  return Number((sum / window).toFixed(2));
}

export function calculateBollingerBands(
  candles: Candle[],
  window: number,
  k: number = 2
): { upper: number; middle: number; lower: number } | undefined {
  if (candles.length < window) return undefined;
  const slice = candles.slice(-window);
  const mean = slice.reduce((acc, c) => acc + c.close, 0) / window;
  const variance = slice.reduce((acc, c) => acc + (c.close - mean) ** 2, 0) / window;
  const std = Math.sqrt(variance);

  return {
    upper: Number((mean + k * std).toFixed(2)),
    middle: Number(mean.toFixed(2)),
    lower: Number((mean - k * std).toFixed(2)),
  };
}

export function calculateRSI(candles: Candle[], window: number = 14): number | undefined {
  if (candles.length <= window) return undefined;
  let gains = 0;
  let losses = 0;

  for (let i = candles.length - window; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }

  const avgGain = gains / window;
  const avgLoss = losses / window;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(1));
}

export function evaluateStrategy(
  strategy: StrategyType,
  candles: Candle[],
  config: StrategyConfig,
  currentPosition: 'FLAT' | 'LONG'
): { signal: StrategySignal; indicators: IndicatorData } {
  const lastCandle = candles[candles.length - 1];
  const price = lastCandle.close;
  const time = lastCandle.time;

  if (strategy === 'trend_following') {
    const fastWindow = Math.max(5, Math.floor(config.lookback / 2));
    const slowWindow = Math.max(10, config.lookback);
    const smaFast = calculateSMA(candles, fastWindow);
    const smaSlow = calculateSMA(candles, slowWindow);

    let type: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let reason = 'Holding position';

    if (smaFast !== undefined && smaSlow !== undefined) {
      if (smaFast > smaSlow && currentPosition === 'FLAT') {
        type = 'BUY';
        reason = `Fast SMA (${smaFast}) crossed above Slow SMA (${smaSlow})`;
      } else if (smaFast < smaSlow && currentPosition === 'LONG') {
        type = 'SELL';
        reason = `Fast SMA (${smaFast}) crossed below Slow SMA (${smaSlow})`;
      }
    }

    return {
      signal: { type, price, time, reason },
      indicators: { smaFast, smaSlow },
    };
  }

  if (strategy === 'mean_reversion') {
    const bb = calculateBollingerBands(candles, config.lookback, 2);
    let type: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let reason = 'Within normal bands';

    if (bb) {
      if (price <= bb.lower && currentPosition === 'FLAT') {
        type = 'BUY';
        reason = `Price (${price}) touched lower band (${bb.lower})`;
      } else if (price >= bb.upper && currentPosition === 'LONG') {
        type = 'SELL';
        reason = `Price (${price}) touched upper band (${bb.upper})`;
      }
    }

    return {
      signal: { type, price, time, reason },
      indicators: {
        bollingerUpper: bb?.upper,
        bollingerMiddle: bb?.middle,
        bollingerLower: bb?.lower,
      },
    };
  }

  // Momentum / RSI
  const rsi = calculateRSI(candles, config.lookback);
  let type: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let reason = 'RSI neutral';

  if (rsi !== undefined) {
    if (rsi < 30 && currentPosition === 'FLAT') {
      type = 'BUY';
      reason = `RSI (${rsi}) oversold (< 30)`;
    } else if (rsi > 70 && currentPosition === 'LONG') {
      type = 'SELL';
      reason = `RSI (${rsi}) overbought (> 70)`;
    }
  }

  return {
    signal: { type, price, time, reason },
    indicators: { rsi },
  };
}

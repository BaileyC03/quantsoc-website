export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  midPrice: number;
}

export class MarketGenerator {
  private currentPrice: number;
  private drift: number;
  private volatility: number;
  private dt: number;
  private lastTimestamp: number;
  private currentCandle: Candle | null = null;
  private candleIntervalSeconds: number;

  constructor(
    initialPrice: number = 100,
    volatility: number = 0.25,
    drift: number = 0.0,
    candleIntervalSeconds: number = 60
  ) {
    this.currentPrice = initialPrice;
    this.volatility = volatility;
    this.drift = drift;
    this.candleIntervalSeconds = candleIntervalSeconds;
    // Align to nearest interval
    const now = Math.floor(Date.now() / 1000);
    this.lastTimestamp = now - (now % candleIntervalSeconds);
    this.dt = 1 / (252 * 24 * 60); // approx minute scale in annual terms
  }

  public setVolatility(vol: number): void {
    this.volatility = Math.max(0.05, Math.min(1.0, vol));
  }

  public setDrift(drift: number): void {
    this.drift = Math.max(-0.5, Math.min(0.5, drift));
  }

  /**
   * Standard normal random variable using Box-Muller transform
   */
  private sampleGaussian(): number {
    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  /**
   * Generates a history of candles using Geometric Brownian Motion
   */
  public generateHistory(count: number = 120): Candle[] {
    const history: Candle[] = [];
    const startTime = this.lastTimestamp - count * this.candleIntervalSeconds;
    let price = this.currentPrice;

    for (let i = 0; i < count; i++) {
      const candleTime = startTime + i * this.candleIntervalSeconds;
      const open = price;
      let high = open;
      let low = open;

      // Simulate 5 sub-steps per candle
      for (let s = 0; s < 5; s++) {
        const z = this.sampleGaussian();
        const shock = Math.exp((this.drift - 0.5 * this.volatility ** 2) * this.dt + this.volatility * Math.sqrt(this.dt) * z);
        price = Math.max(1, price * shock);
        if (price > high) high = price;
        if (price < low) low = price;
      }

      const close = price;
      const volume = Math.floor(100 + Math.random() * 500);

      history.push({
        time: candleTime,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume,
      });
    }

    this.currentPrice = price;
    this.currentCandle = { ...history[history.length - 1] };
    return history;
  }

  /**
   * Advance simulation by one tick. Updates current candle or opens a new one.
   */
  public tick(): { candle: Candle; isNewCandle: boolean; lastPrice: number } {
    const now = Math.floor(Date.now() / 1000);
    const z = this.sampleGaussian();
    const shock = Math.exp((this.drift - 0.5 * this.volatility ** 2) * this.dt + this.volatility * Math.sqrt(this.dt) * z);
    this.currentPrice = Math.max(1, Number((this.currentPrice * shock).toFixed(2)));

    let isNewCandle = false;

    if (!this.currentCandle) {
      this.currentCandle = {
        time: now - (now % this.candleIntervalSeconds),
        open: this.currentPrice,
        high: this.currentPrice,
        low: this.currentPrice,
        close: this.currentPrice,
        volume: Math.floor(10 + Math.random() * 20),
      };
      isNewCandle = true;
    } else {
      const currentSlot = now - (now % this.candleIntervalSeconds);
      if (currentSlot > this.currentCandle.time) {
        // Open new candle
        this.currentCandle = {
          time: currentSlot,
          open: this.currentPrice,
          high: this.currentPrice,
          low: this.currentPrice,
          close: this.currentPrice,
          volume: Math.floor(10 + Math.random() * 20),
        };
        isNewCandle = true;
      } else {
        // Update current candle
        this.currentCandle.close = this.currentPrice;
        if (this.currentPrice > this.currentCandle.high) this.currentCandle.high = this.currentPrice;
        if (this.currentPrice < this.currentCandle.low) this.currentCandle.low = this.currentPrice;
        this.currentCandle.volume += Math.floor(5 + Math.random() * 15);
      }
    }

    return {
      candle: { ...this.currentCandle },
      isNewCandle,
      lastPrice: this.currentPrice,
    };
  }

  /**
   * Generate Level-2 Order Book around current price
   */
  public generateOrderBook(levels: number = 7): OrderBook {
    const mid = this.currentPrice;
    const spread = Math.max(0.02, Number((mid * 0.0004 + (Math.random() * 0.02)).toFixed(2)));
    const halfSpread = spread / 2;

    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    let bidTotal = 0;
    let askTotal = 0;

    for (let i = 0; i < levels; i++) {
      const tickOffset = i * 0.05;
      const bidPrice = Number((mid - halfSpread - tickOffset).toFixed(2));
      const askPrice = Number((mid + halfSpread + tickOffset).toFixed(2));

      // Poisson/exponential size simulation
      const bidSize = Math.floor(50 + Math.exp(Math.random() * 3) * 30);
      const askSize = Math.floor(50 + Math.exp(Math.random() * 3) * 30);

      bidTotal += bidSize;
      askTotal += askSize;

      bids.push({ price: bidPrice, size: bidSize, total: bidTotal });
      asks.push({ price: askPrice, size: askSize, total: askTotal });
    }

    return {
      bids,
      asks,
      spread: Number(spread.toFixed(2)),
      midPrice: mid,
    };
  }
}

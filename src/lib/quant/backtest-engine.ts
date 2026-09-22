import type { StrategySignal } from './strategies';

export interface TradeRecord {
  id: string;
  time: number;
  type: 'BUY' | 'SELL';
  price: number;
  pnl?: number;
  pnlPercent?: number;
  reason: string;
}

export interface EquityPoint {
  time: number;
  value: number;
}

export interface BacktestMetrics {
  totalPnL: number;
  totalPnLPercent: number;
  winRate: number;
  totalTrades: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  portfolioValue: number;
  currentPosition: 'FLAT' | 'LONG';
}

export class BacktestEngine {
  private initialCapital: number;
  private cash: number;
  private position: 'FLAT' | 'LONG' = 'FLAT';
  private entryPrice: number = 0;
  private shares: number = 0;
  private trades: TradeRecord[] = [];
  private equityCurve: EquityPoint[] = [];
  private peakEquity: number;
  private maxDrawdown: number = 0;
  private returns: number[] = [];

  constructor(initialCapital: number = 10000) {
    this.initialCapital = initialCapital;
    this.cash = initialCapital;
    this.peakEquity = initialCapital;
  }

  public reset(initialCapital?: number): void {
    if (initialCapital) this.initialCapital = initialCapital;
    this.cash = this.initialCapital;
    this.position = 'FLAT';
    this.entryPrice = 0;
    this.shares = 0;
    this.trades = [];
    this.equityCurve = [];
    this.peakEquity = this.initialCapital;
    this.maxDrawdown = 0;
    this.returns = [];
  }

  public getPosition(): 'FLAT' | 'LONG' {
    return this.position;
  }

  public getTrades(): TradeRecord[] {
    return this.trades;
  }

  public getEquityCurve(): EquityPoint[] {
    return this.equityCurve;
  }

  public processSignal(signal: StrategySignal, currentPrice: number): TradeRecord | null {
    let executedTrade: TradeRecord | null = null;

    if (signal.type === 'BUY' && this.position === 'FLAT') {
      // Allocate 95% of cash
      const allocation = this.cash * 0.95;
      this.shares = Math.floor(allocation / currentPrice);
      if (this.shares > 0) {
        const cost = this.shares * currentPrice;
        this.cash -= cost;
        this.position = 'LONG';
        this.entryPrice = currentPrice;

        executedTrade = {
          id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          time: signal.time,
          type: 'BUY',
          price: currentPrice,
          reason: signal.reason,
        };
        this.trades.push(executedTrade);
      }
    } else if (signal.type === 'SELL' && this.position === 'LONG') {
      const revenue = this.shares * currentPrice;
      const pnl = revenue - (this.shares * this.entryPrice);
      const pnlPercent = (pnl / (this.shares * this.entryPrice)) * 100;

      this.cash += revenue;
      this.position = 'FLAT';

      executedTrade = {
        id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        time: signal.time,
        type: 'SELL',
        price: currentPrice,
        pnl: Number(pnl.toFixed(2)),
        pnlPercent: Number(pnlPercent.toFixed(2)),
        reason: signal.reason,
      };
      this.trades.push(executedTrade);

      this.shares = 0;
      this.entryPrice = 0;
    }

    return executedTrade;
  }

  public updateEquity(time: number, currentPrice: number): BacktestMetrics {
    const portfolioValue = this.position === 'LONG'
      ? this.cash + this.shares * currentPrice
      : this.cash;

    // Track returns
    if (this.equityCurve.length > 0) {
      const prev = this.equityCurve[this.equityCurve.length - 1].value;
      const ret = (portfolioValue - prev) / prev;
      this.returns.push(ret);
      if (this.returns.length > 250) this.returns.shift();
    }

    this.equityCurve.push({ time, value: Number(portfolioValue.toFixed(2)) });
    if (this.equityCurve.length > 250) this.equityCurve.shift();

    if (portfolioValue > this.peakEquity) {
      this.peakEquity = portfolioValue;
    }

    const currentDrawdown = (this.peakEquity - portfolioValue) / this.peakEquity;
    if (currentDrawdown > this.maxDrawdown) {
      this.maxDrawdown = currentDrawdown;
    }

    return this.getMetrics(portfolioValue);
  }

  public getMetrics(currentPortfolioValue?: number): BacktestMetrics {
    const portVal = currentPortfolioValue ?? (
      this.equityCurve.length > 0
        ? this.equityCurve[this.equityCurve.length - 1].value
        : this.initialCapital
    );

    const totalPnL = portVal - this.initialCapital;
    const totalPnLPercent = (totalPnL / this.initialCapital) * 100;

    const closedTrades = this.trades.filter((t) => t.type === 'SELL');
    const winningTrades = closedTrades.filter((t) => (t.pnl ?? 0) > 0);
    const winRate = closedTrades.length > 0
      ? (winningTrades.length / closedTrades.length) * 100
      : 0;

    // Calculate Sharpe Ratio
    let sharpeRatio = 0;
    if (this.returns.length > 5) {
      const mean = this.returns.reduce((a, b) => a + b, 0) / this.returns.length;
      const variance = this.returns.reduce((a, b) => a + (b - mean) ** 2, 0) / this.returns.length;
      const std = Math.sqrt(variance);
      if (std > 0) {
        // Annualize with sqrt(252 * 390) for minute ticks in trading year
        sharpeRatio = (mean / std) * Math.sqrt(252 * 390);
      }
    }

    return {
      totalPnL: Number(totalPnL.toFixed(2)),
      totalPnLPercent: Number(totalPnLPercent.toFixed(2)),
      winRate: Number(winRate.toFixed(1)),
      totalTrades: closedTrades.length,
      maxDrawdownPercent: Number((this.maxDrawdown * 100).toFixed(2)),
      sharpeRatio: Number(sharpeRatio.toFixed(2)),
      portfolioValue: Number(portVal.toFixed(2)),
      currentPosition: this.position,
    };
  }
}

import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  ColorType,
  type IChartApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { MarketGenerator, type Candle, type OrderBook } from './market-generator';
import {
  evaluateStrategy,
  calculateSMA,
  calculateBollingerBands,
  calculateRSI,
  type StrategyType,
  type StrategyConfig,
} from './strategies';
import { BacktestEngine, type BacktestMetrics, type TradeRecord } from './backtest-engine';

export function initTerminal(rootElement: HTMLElement): void {
  // Prevent duplicate initialization
  if (rootElement.dataset.initialized === 'true') return;
  rootElement.dataset.initialized = 'true';

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Simulation & Engine instances
  const market = new MarketGenerator(100, 0.25, 0.0, 60);
  const backtest = new BacktestEngine(10000);

  let currentStrategy: StrategyType = 'trend_following';
  let strategyConfig: StrategyConfig = { lookback: 20 };
  let isPlaying = !prefersReducedMotion;
  let speedMultiplier = 1; // 1x, 2x, 5x
  let timerId: number | null = null;

  // DOM references
  const chartContainer = rootElement.querySelector<HTMLElement>('#terminal-chart-container');
  const priceDisplay = rootElement.querySelector<HTMLElement>('#terminal-current-price');
  const priceChange = rootElement.querySelector<HTMLElement>('#terminal-price-change');
  const signalBadge = rootElement.querySelector<HTMLElement>('#terminal-signal-badge');
  const orderBookBids = rootElement.querySelector<HTMLElement>('#orderbook-bids');
  const orderBookAsks = rootElement.querySelector<HTMLElement>('#orderbook-asks');
  const orderBookSpread = rootElement.querySelector<HTMLElement>('#orderbook-spread');
  const playPauseBtn = rootElement.querySelector<HTMLButtonElement>('#btn-play-pause');
  const speedBtn = rootElement.querySelector<HTMLButtonElement>('#btn-speed');
  const lookbackSlider = rootElement.querySelector<HTMLInputElement>('#slider-lookback');
  const lookbackVal = rootElement.querySelector<HTMLElement>('#val-lookback');
  const volSlider = rootElement.querySelector<HTMLInputElement>('#slider-volatility');
  const volVal = rootElement.querySelector<HTMLElement>('#val-volatility');

  // Metrics DOM
  const metricPnl = rootElement.querySelector<HTMLElement>('#metric-pnl');
  const metricSharpe = rootElement.querySelector<HTMLElement>('#metric-sharpe');
  const metricDrawdown = rootElement.querySelector<HTMLElement>('#metric-drawdown');
  const metricWinrate = rootElement.querySelector<HTMLElement>('#metric-winrate');
  const metricTradesCount = rootElement.querySelector<HTMLElement>('#metric-trades');
  const tradesTape = rootElement.querySelector<HTMLElement>('#terminal-trades-tape');

  if (!chartContainer) return;

  if (playPauseBtn && !isPlaying) {
    playPauseBtn.textContent = '▶ Play';
    playPauseBtn.setAttribute('aria-label', 'Play simulation');
  }

  // 2. Setup Lightweight Charts
  const chart: IChartApi = createChart(chartContainer, {
    layout: {
      background: { type: ColorType.Solid, color: '#171928' },
      textColor: '#DFE6EE',
      fontFamily: '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif',
    },
    grid: {
      vertLines: { color: 'rgba(223, 230, 238, 0.08)' },
      horzLines: { color: 'rgba(223, 230, 238, 0.08)' },
    },
    crosshair: {
      vertLine: { color: '#CED846', width: 1, style: 3 },
      horzLine: { color: '#CED846', width: 1, style: 3 },
    },
    rightPriceScale: {
      borderColor: 'rgba(223, 230, 238, 0.15)',
    },
    timeScale: {
      borderColor: 'rgba(223, 230, 238, 0.15)',
      timeVisible: true,
      secondsVisible: false,
    },
    autoSize: true,
  });

  // Candlestick series
  const candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#CED846',
    downColor: '#FF5252',
    borderVisible: false,
    wickUpColor: '#CED846',
    wickDownColor: '#FF5252',
  });

  // Indicator lines
  const indicatorLine1 = chart.addSeries(LineSeries, {
    color: '#DFE6EE',
    lineWidth: 1,
    title: 'Fast SMA',
  });

  const indicatorLine2 = chart.addSeries(LineSeries, {
    color: '#BAC73B',
    lineWidth: 1,
    title: 'Slow SMA',
  });

  // Series markers primitive
  const markersPlugin = createSeriesMarkers(candleSeries, []);
  let markersList: SeriesMarker<Time>[] = [];

  // Generate initial history
  let candles = market.generateHistory(100);
  const initialPrice = candles[0].open;

  candleSeries.setData(
    candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
  );

  // Initial indicator setup
  updateIndicatorLines(candles);

  // Resize handling
  const resizeObserver = new ResizeObserver((entries) => {
    if (!entries.length || !entries[0].contentRect) return;
    const { width, height } = entries[0].contentRect;
    chart.applyOptions({ width, height });
  });
  resizeObserver.observe(chartContainer);

  // 3. Render functions
  function renderOrderBook(book: OrderBook): void {
    if (!orderBookBids || !orderBookAsks || !orderBookSpread) return;

    orderBookSpread.textContent = `SPREAD: $${book.spread.toFixed(2)}`;

    const maxAskTotal = Math.max(...book.asks.map((a) => a.total), 1);
    const maxBidTotal = Math.max(...book.bids.map((b) => b.total), 1);

    // Asks (reversed order so lowest ask is closest to spread)
    const asksHtml = [...book.asks]
      .reverse()
      .map((a) => {
        const pct = Math.min(100, Math.round((a.total / maxAskTotal) * 100));
        return `
        <div class="orderbook-row ask-row">
          <span class="depth-bar ask-bar" style="width: ${pct}%"></span>
          <span class="price">${a.price.toFixed(2)}</span>
          <span class="size">${a.size}</span>
          <span class="total">${a.total}</span>
        </div>`;
      })
      .join('');
    orderBookAsks.innerHTML = asksHtml;

    // Bids
    const bidsHtml = book.bids
      .map((b) => {
        const pct = Math.min(100, Math.round((b.total / maxBidTotal) * 100));
        return `
        <div class="orderbook-row bid-row">
          <span class="depth-bar bid-bar" style="width: ${pct}%"></span>
          <span class="price">${b.price.toFixed(2)}</span>
          <span class="size">${b.size}</span>
          <span class="total">${b.total}</span>
        </div>`;
      })
      .join('');
    orderBookBids.innerHTML = bidsHtml;
  }

  function renderMetrics(metrics: BacktestMetrics): void {
    if (!metricPnl || !metricSharpe || !metricDrawdown || !metricWinrate || !metricTradesCount) return;

    const sign = metrics.totalPnL >= 0 ? '+' : '';
    metricPnl.textContent = `${sign}$${metrics.totalPnL.toFixed(2)} (${sign}${metrics.totalPnLPercent.toFixed(1)}%)`;
    metricPnl.className = `metric-value ${metrics.totalPnL >= 0 ? 'accent-lime' : 'accent-crimson'}`;

    metricSharpe.textContent = metrics.sharpeRatio.toFixed(2);
    metricDrawdown.textContent = `${metrics.maxDrawdownPercent.toFixed(1)}%`;
    metricWinrate.textContent = `${metrics.winRate.toFixed(1)}%`;
    metricTradesCount.textContent = `${metrics.totalTrades}`;
  }

  function addTradeToTape(trade: TradeRecord): void {
    if (!tradesTape) return;

    const row = document.createElement('div');
    row.className = `trade-tape-row ${trade.type.toLowerCase()}`;
    const pnlText = trade.pnl !== undefined ? `(${trade.pnl >= 0 ? '+' : ''}$${trade.pnl})` : '';

    const timeStr = new Date(trade.time * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    row.innerHTML = `
      <span class="tape-time">${timeStr}</span>
      <span class="tape-type ${trade.type === 'BUY' ? 'accent-lime' : 'accent-crimson'}">${trade.type}</span>
      <span class="tape-price">$${trade.price.toFixed(2)}</span>
      <span class="tape-pnl">${pnlText}</span>
    `;

    tradesTape.insertBefore(row, tradesTape.firstChild);
    while (tradesTape.children.length > 8) {
      tradesTape.removeChild(tradesTape.lastChild as Node);
    }
  }

  function updateIndicatorLines(candlesList: Candle[]): void {
    if (currentStrategy === 'trend_following') {
      indicatorLine1.applyOptions({ visible: true, title: 'SMA Fast' });
      indicatorLine2.applyOptions({ visible: true, title: 'SMA Slow' });

      const fastWindow = Math.max(5, Math.floor(strategyConfig.lookback / 2));
      const slowWindow = Math.max(10, strategyConfig.lookback);

      const fastData: { time: UTCTimestamp; value: number }[] = [];
      const slowData: { time: UTCTimestamp; value: number }[] = [];

      for (let i = 0; i < candlesList.length; i++) {
        const slice = candlesList.slice(0, i + 1);
        const smaF = calculateSMA(slice, fastWindow);
        const smaS = calculateSMA(slice, slowWindow);
        if (smaF !== undefined) {
          fastData.push({ time: slice[slice.length - 1].time as UTCTimestamp, value: smaF });
        }
        if (smaS !== undefined) {
          slowData.push({ time: slice[slice.length - 1].time as UTCTimestamp, value: smaS });
        }
      }

      indicatorLine1.setData(fastData);
      indicatorLine2.setData(slowData);
    } else if (currentStrategy === 'mean_reversion') {
      indicatorLine1.applyOptions({ visible: true, title: 'BB Upper' });
      indicatorLine2.applyOptions({ visible: true, title: 'BB Lower' });

      const window = strategyConfig.lookback;
      const upperData: { time: UTCTimestamp; value: number }[] = [];
      const lowerData: { time: UTCTimestamp; value: number }[] = [];

      for (let i = 0; i < candlesList.length; i++) {
        const slice = candlesList.slice(0, i + 1);
        const bb = calculateBollingerBands(slice, window, 2);
        if (bb) {
          upperData.push({ time: slice[slice.length - 1].time as UTCTimestamp, value: bb.upper });
          lowerData.push({ time: slice[slice.length - 1].time as UTCTimestamp, value: bb.lower });
        }
      }

      indicatorLine1.setData(upperData);
      indicatorLine2.setData(lowerData);
    } else {
      // Momentum / RSI
      indicatorLine1.applyOptions({ visible: true, title: 'RSI (Scaled)' });
      indicatorLine2.applyOptions({ visible: false });

      const window = strategyConfig.lookback;
      const rsiData: { time: UTCTimestamp; value: number }[] = [];

      for (let i = 0; i < candlesList.length; i++) {
        const slice = candlesList.slice(0, i + 1);
        const rsiVal = calculateRSI(slice, window);
        if (rsiVal !== undefined) {
          // Scale RSI (0-100) around current candle price for visual alignment
          rsiData.push({ time: slice[slice.length - 1].time as UTCTimestamp, value: rsiVal });
        }
      }

      indicatorLine1.setData(rsiData);
    }
  }

  // 4. Main Simulation Step
  function stepSimulation(): void {
    const { candle, isNewCandle, lastPrice } = market.tick();

    if (isNewCandle) {
      candles.push(candle);
      if (candles.length > 150) candles.shift();
    } else {
      candles[candles.length - 1] = candle;
    }

    candleSeries.update({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });

    // Update Header Price
    if (priceDisplay && priceChange) {
      priceDisplay.textContent = `$${lastPrice.toFixed(2)}`;
      const change = ((lastPrice - initialPrice) / initialPrice) * 100;
      const sign = change >= 0 ? '+' : '';
      priceChange.textContent = `${sign}${change.toFixed(2)}%`;
      priceChange.className = `price-change ${change >= 0 ? 'accent-lime' : 'accent-crimson'}`;
    }

    // Run Strategy & Backtest
    const { signal } = evaluateStrategy(currentStrategy, candles, strategyConfig, backtest.getPosition());

    if (signalBadge) {
      signalBadge.textContent = `${signal.type} // ${signal.reason}`;
      signalBadge.className = `signal-badge ${
        signal.type === 'BUY' ? 'badge-buy' : signal.type === 'SELL' ? 'badge-sell' : 'badge-hold'
      }`;
    }

    const executedTrade = backtest.processSignal(signal, lastPrice);
    if (executedTrade) {
      addTradeToTape(executedTrade);

      // Add marker to chart (cap to 25 markers to prevent memory leaks)
      const marker: SeriesMarker<Time> = {
        time: executedTrade.time as UTCTimestamp,
        position: executedTrade.type === 'BUY' ? 'belowBar' : 'aboveBar',
        color: executedTrade.type === 'BUY' ? '#CED846' : '#FF5252',
        shape: executedTrade.type === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: executedTrade.type,
      };
      markersList.push(marker);
      if (markersList.length > 25) markersList.shift();
      markersPlugin.setMarkers([...markersList]);
    }

    // Update equity metrics
    const metrics = backtest.updateEquity(candle.time, lastPrice);
    renderMetrics(metrics);

    // Update Order Book
    const book = market.generateOrderBook(9);
    renderOrderBook(book);
  }

  // Timer loop
  function startLoop(): void {
    if (timerId !== null) clearInterval(timerId);
    const intervalMs = Math.max(200, Math.floor(1000 / speedMultiplier));
    timerId = window.setInterval(() => {
      stepSimulation();
    }, intervalMs);
  }

  function stopLoop(): void {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  // 5. Wire User Controls
  playPauseBtn?.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playPauseBtn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
    playPauseBtn.setAttribute('aria-label', isPlaying ? 'Pause simulation' : 'Play simulation');
    if (isPlaying) {
      startLoop();
    } else {
      stopLoop();
    }
  });

  speedBtn?.addEventListener('click', () => {
    if (speedMultiplier === 1) speedMultiplier = 2;
    else if (speedMultiplier === 2) speedMultiplier = 5;
    else speedMultiplier = 1;

    speedBtn.textContent = `${speedMultiplier}x`;
    if (isPlaying) startLoop();
  });

  lookbackSlider?.addEventListener('input', (e) => {
    const val = Number((e.target as HTMLInputElement).value);
    strategyConfig.lookback = val;
    if (lookbackVal) lookbackVal.textContent = `${val}`;
    updateIndicatorLines(candles);
  });

  volSlider?.addEventListener('input', (e) => {
    const val = Number((e.target as HTMLInputElement).value);
    market.setVolatility(val / 100);
    if (volVal) volVal.textContent = `${val}%`;
  });

  // Strategy preset selector buttons
  const presetButtons = rootElement.querySelectorAll<HTMLButtonElement>('.strategy-preset-btn');
  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      currentStrategy = btn.dataset.strategy as StrategyType;

      // Reset backtest state and clear markers on preset switch
      backtest.reset();
      markersList = [];
      markersPlugin.setMarkers([]);
      renderMetrics(backtest.getMetrics());
      if (tradesTape) tradesTape.innerHTML = '';

      // Adjust default lookback for preset
      if (currentStrategy === 'trend_following') {
        strategyConfig.lookback = 20;
        if (lookbackSlider) lookbackSlider.value = '20';
        if (lookbackVal) lookbackVal.textContent = '20';
      } else if (currentStrategy === 'mean_reversion') {
        strategyConfig.lookback = 20;
        if (lookbackSlider) lookbackSlider.value = '20';
        if (lookbackVal) lookbackVal.textContent = '20';
      } else {
        strategyConfig.lookback = 14;
        if (lookbackSlider) lookbackSlider.value = '14';
        if (lookbackVal) lookbackVal.textContent = '14';
      }

      updateIndicatorLines(candles);
    });
  });

  // Mobile Tab Switcher
  const tabButtons = rootElement.querySelectorAll<HTMLButtonElement>('.terminal-tab-btn');
  const panels = rootElement.querySelectorAll<HTMLElement>('.terminal-panel');

  tabButtons.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabButtons.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const targetPanel = tab.dataset.tab;
      panels.forEach((panel) => {
        if (panel.id === targetPanel) {
          panel.classList.add('active-panel');
        } else {
          panel.classList.remove('active-panel');
        }
      });

      // Trigger chart resize if chart panel became visible
      if (targetPanel === 'panel-chart') {
        chart.applyOptions({
          width: chartContainer.clientWidth,
          height: chartContainer.clientHeight,
        });
      }
    });
  });

  // Initial order book & loop start
  const initialBook = market.generateOrderBook(9);
  renderOrderBook(initialBook);
  if (isPlaying) {
    startLoop();
  }
}


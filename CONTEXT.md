# QuantSoc Website Context

Brochure website and interactive quant trading terminal for Swansea University Quantitative Finance Society.

## Language

**Trading Terminal**:
The homepage multi-panel interface displaying simulated market activity and strategy analytics.
_Avoid_: Widget, crypto tracker, financial dashboard

**Synthetic Market Generator**:
A client-side stochastic process (e.g. Geometric Brownian Motion) generating realistic tick and candle price data locally without external APIs.
_Avoid_: Mock API, fake server, live feed

**Backtest Engine**:
A client-side model evaluating algorithmic strategy performance (PnL, Sharpe ratio, max drawdown) across simulated price paths.
_Avoid_: Paper trader, trade simulator

**Order Book**:
A market depth component showing simulated bids, asks, and current spread.
_Avoid_: Depth table, trade ladder

**Strategy Preset**:
A pre-configured algorithmic trading strategy (Trend Following, Mean Reversion, Momentum) with tunable parameters.
_Avoid_: Algorithm mode, bot profile

**Simulation Controls**:
Interactive play, pause, speed, and parameter adjustment mechanisms controlling the synthetic market and backtest runner.
_Avoid_: Player bar, settings panel

**Trade Marker**:
A visual flag on the chart and order book indicating where an algorithmic strategy executed a simulated buy or sell order.
_Avoid_: Alert, trade icon, signal pin

**Hero Backdrop**:
An ambient, blurred instance of the market chart rendered behind the homepage hero on desktop viewports to create visual depth without competing with copy.
_Avoid_: Hero background, video wallpaper




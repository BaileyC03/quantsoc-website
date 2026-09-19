# 0002: TradingView Lightweight Charts for Terminal

We decided to use TradingView's `lightweight-charts` library for rendering financial charts within the homepage trading terminal.

While the baseline site targets zero client-side JavaScript, this library delivers an authentic financial terminal experience (crisp canvas rendering, crosshairs, price scales) at ~45KB gzipped, well within the project's <100KB budget, without requiring a frontend framework like React.

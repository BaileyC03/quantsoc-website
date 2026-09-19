# 0003: Lazy Loaded Terminal Execution

We decided to defer loading and initializing the trading terminal and `lightweight-charts` bundle until the section scrolls into the viewport via `IntersectionObserver`.

This preserves the site's zero initial client JavaScript budget, sub-2.0s mobile LCP, and 95+ Lighthouse performance score while providing a full interactive trading simulation for visitors who scroll to explore.

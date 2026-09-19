# 0004: Hero Ambient Terminal Backdrop

We decided to add an ambient, blurred market chart directly behind the homepage hero section on desktop viewports (>=48rem), while retaining the full interactive terminal in its dedicated section below.

The backdrop uses a `filter: blur(6px)` with an `rgba(23, 25, 40, 0.75)` semi-transparent navy overlay and `pointer-events: none`. This provides instant quantitative finance atmosphere upon landing while guaranteeing strict WCAG text contrast (>11:1) for hero copy and preserving mobile performance.

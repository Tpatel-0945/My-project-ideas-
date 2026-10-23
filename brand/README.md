# AURA logo

**The mark:** a bold, sharp **A** whose crossbar is an **orbit** that weaves in front of one leg and behind the other, with a glowing **scan point** riding the ring. The A is AURA; the orbit and point stand for continuous monitoring and the 3D face scan; the apricot-to-teal-to-lavender colours are the app's skin, hair and instrument colours.

| File | Use |
| --- | --- |
| `aura-logo-horizontal.svg` / `-light` / `-white` / `-black` | main logo: mark + AURA + MONITOR (dark backgrounds / light / one-colour) |
| `aura-logo-compact.svg` / `-light` | mark + AURA only, for small spaces (app top bar, lock screen) |
| `aura-logo-stacked.svg` / `-light` | centred version for splash screens and posters |
| `aura-mark.svg` / `-light` / `-white` / `-black` | the symbol alone (favicons, avatars, watermarks) |
| `aura-splash.svg` | the stacked logo split into parts for the app's opening animation (scan point orbits and draws the ring, the A rises and catches the light, letters settle, a scan beam passes) |
| `aura-app-icon.svg`, `aura-app-icon-1024.png` | the mark on a deep-space rounded square, ready as an app icon |
| `*@3x.png`, `*-1024.png`, `*-512.png` | transparent PNG exports |

**Colours:** apricot `#FFE2C6 → #FFB27A → #F07A45` (the A), teal `#8FDED0` → lavender `#B8A6FF` (the orbit), space `#05060A`, ivory `#F4EFE9`.
**Type:** wordmark from Unbounded SemiBold, sub-line JetBrains Mono Medium, converted to outlines (no fonts needed).
**Clear space:** keep at least the height of the scan point's glow (about 1/10 of the mark) free on all sides. Smallest size: 16 px for the mark, 80 px wide for the compact logo.

Regenerate everything with `tools/make_logo.py brand <fonts-folder>` (needs fontTools and the two TTFs from Google Fonts). To use the mark as the home-screen/desktop app icon instead of the portrait: `python3 tools/make_icons.py brand/aura-app-icon-1024.png --favicon brand/aura-mark-1024.png`.

"""AURA logo generator: emblem + outlined wordmark, in several lockups and colourways."""
import sys, math
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
OUT = sys.argv[1]; FD = sys.argv[2]

def text_path(font, text, size, tracking=0.0):
    """Outline text as one SVG path. Returns (d, width, cap_top, baseline_y) in px; origin at baseline-left."""
    f = TTFont(font); gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm; k = size / upm
    pen = SVGPathPen(gs); x = 0.0
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (k, 0, 0, -k, x, 0)); gs[g].draw(tp)
        x += gs[g].width * k + (tracking * size if i < len(text) - 1 else 0)
    bp = BoundsPen(gs); xx = 0.0
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]; tp = TransformPen(bp, (k, 0, 0, -k, xx, 0)); gs[g].draw(tp); xx += gs[g].width * k + (tracking * size if i < len(text) - 1 else 0)
    return pen.getCommands(), x, bp.bounds

# ---------- the emblem (designed on a 120 x 120 grid) ----------
A_PATH = 'M60 8 L98 108 L79 108 L60 56 L41 108 L22 108 Z'           # bold A with a sharp apex and open counter
ORBIT = dict(cx=60, cy=66, rx=52, ry=14, rot=-14)                   # the crossbar is an orbit
def ellipse_pt(t):
    a = math.radians(ORBIT['rot']); x, y = ORBIT['rx'] * math.cos(t), ORBIT['ry'] * math.sin(t)
    return ORBIT['cx'] + x * math.cos(a) - y * math.sin(a), ORBIT['cy'] + x * math.sin(a) + y * math.cos(a)
def arc(t0, t1, n=64):
    pts = [ellipse_pt(t0 + (t1 - t0) * i / n) for i in range(n + 1)]
    return 'M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in pts)
FRONT = arc(0.12, math.pi - 0.12)          # lower half passes in front of the A
BACK = arc(math.pi, 2 * math.pi)           # upper half passes behind
NODE = ellipse_pt(0.5)                     # the scan point riding the orbit

def emblem(uid, a_fill, orbit_stroke, node_fill, glow=True, sw=6):
    gap = sw + 7
    return f'''<defs>
  <linearGradient id="ga{uid}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#ffe2c6"/><stop offset=".45" stop-color="#ffb27a"/><stop offset="1" stop-color="#f07a45"/></linearGradient>
  <linearGradient id="go{uid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fded0"/><stop offset="1" stop-color="#b8a6ff"/></linearGradient>
  <radialGradient id="gn{uid}"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#fff6ea"/><stop offset="1" stop-color="#fff6ea" stop-opacity="0"/></radialGradient>
  <mask id="m{uid}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="160" height="160"><rect x="-20" y="-20" width="160" height="160" fill="#fff"/><path d="{FRONT}" fill="none" stroke="#000" stroke-width="{gap}" stroke-linecap="round"/></mask>
</defs>
<path d="{BACK}" fill="none" stroke="{orbit_stroke}" stroke-width="{sw}" stroke-linecap="round" opacity=".9"/>
<path d="{A_PATH}" fill="{a_fill}" stroke="{a_fill}" stroke-width="2.4" stroke-linejoin="round" mask="url(#m{uid})"/>
<path d="{FRONT}" fill="none" stroke="{orbit_stroke}" stroke-width="{sw}" stroke-linecap="round"/>
{f'<circle cx="{NODE[0]:.2f}" cy="{NODE[1]:.2f}" r="11" fill="url(#gn{uid})"/>' if glow else ''}
<circle cx="{NODE[0]:.2f}" cy="{NODE[1]:.2f}" r="4.6" fill="{node_fill}"/>'''

STYLES = {
    'color':  dict(a='url(#ga{u})', o='url(#go{u})', n='#ffffff', word='#f4efe9', sub='#8e95a6', bg='#05060a', glow=True),
    'light':  dict(a='url(#ga{u})', o='url(#go{u})', n='#1b1d26', word='#14151c', sub='#6b7080', bg='#f6f1ea', glow=False),
    'mono-white': dict(a='#ffffff', o='#ffffff', n='#ffffff', word='#ffffff', sub='#ffffff', bg='#05060a', glow=False),
    'mono-black': dict(a='#0b0c10', o='#0b0c10', n='#0b0c10', word='#0b0c10', sub='#0b0c10', bg='#ffffff', glow=False),
}
def em(style, u):
    s = STYLES[style]; return emblem(u, s['a'].format(u=u), s['o'].format(u=u), s['n'], s['glow'])

WORD_D, WORD_W, WORD_B = text_path(f'{FD}/Unbounded.ttf', 'AURA', 100, tracking=0.08)
SUB_D, SUB_W, SUB_B = text_path(f'{FD}/JBMono.ttf', 'MONITOR', 100, tracking=0.42)

def svg(w, h, body, bg=None, title='AURA Monitor'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}"><title>{title}</title>{f"<rect width=\"100%\" height=\"100%\" fill=\"{bg}\"/>" if bg else ""}{body}</svg>'

def horizontal(style, bg=False, sub=True):
    s = STYLES[style]; cap = WORD_B[3] - WORD_B[1]       # cap height in px at size 100
    E = 120
    # emblem 120 tall; wordmark cap height 0.40 of emblem (0.46 when compact), sub line below, block centred on emblem
    k = (E * (0.40 if sub else 0.46)) / cap; sk = k * 0.30
    block = cap * k + (14 + (SUB_B[3] - SUB_B[1]) * sk if sub else 0)
    top = (E - block) / 2
    x0 = E + 26
    body = f'<g>{em(style, "h" + style)}</g>'
    body += f'<path transform="translate({x0},{top + -WORD_B[1] * k:.2f}) scale({k:.4f})" d="{WORD_D}" fill="{s["word"]}"/>'
    if sub: body += f'<path transform="translate({x0 + 3},{top + cap * k + 14 + -SUB_B[1] * sk:.2f}) scale({sk:.4f})" d="{SUB_D}" fill="{s["sub"]}"/>'
    W = x0 + max(WORD_W * k, SUB_W * sk if sub else 0) + 6
    return svg(W, E, body, s['bg'] if bg else None)

def stacked(style, bg=False):
    s = STYLES[style]; cap = WORD_B[3] - WORD_B[1]; E = 160
    k = 52 / cap; sk = k * 0.32; ww, sw_ = WORD_W * k, SUB_W * sk
    W = max(ww, sw_, E) + 40; x_e = (W - E) / 2
    y_w = E + 34 + -WORD_B[1] * k; y_s = E + 34 + cap * k + 18 + -SUB_B[1] * sk
    H = y_s + 20
    body = f'<g transform="translate({x_e:.2f},0) scale({E/120:.4f})">{em(style, "s" + style)}</g>'
    body += f'<path transform="translate({(W - ww) / 2:.2f},{y_w:.2f}) scale({k:.4f})" d="{WORD_D}" fill="{s["word"]}"/>'
    body += f'<path transform="translate({(W - sw_) / 2:.2f},{y_s:.2f}) scale({sk:.4f})" d="{SUB_D}" fill="{s["sub"]}"/>'
    return svg(W, H, body, s['bg'] if bg else None)

def mark(style, bg=False, pad=0):
    s = STYLES[style]
    return svg(120 + 2 * pad, 120 + 2 * pad, f'<g transform="translate({pad},{pad})">{em(style, "m" + style)}</g>', s['bg'] if bg else None)

def app_icon():
    """Emblem on a deep-space rounded square (for icons and avatars)."""
    body = f'''<defs><radialGradient id="bgI" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="#1d1a24"/><stop offset=".6" stop-color="#0b0c12"/><stop offset="1" stop-color="#05060a"/></radialGradient>
<radialGradient id="glI" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#ff9a5c" stop-opacity=".28"/><stop offset="1" stop-color="#ff9a5c" stop-opacity="0"/></radialGradient></defs>
<rect width="512" height="512" rx="112" fill="url(#bgI)"/><circle cx="256" cy="270" r="230" fill="url(#glI)"/>
<g transform="translate(76,72) scale(3)">{em("color", "i")}</g>'''
    return svg(512, 512, body)

files = {
    'aura-logo-horizontal.svg': horizontal('color'), 'aura-logo-horizontal-light.svg': horizontal('light'),
    'aura-logo-horizontal-white.svg': horizontal('mono-white'), 'aura-logo-horizontal-black.svg': horizontal('mono-black'),
    'aura-logo-compact.svg': horizontal('color', sub=False), 'aura-logo-compact-light.svg': horizontal('light', sub=False),
    'aura-logo-stacked.svg': stacked('color'), 'aura-logo-stacked-light.svg': stacked('light'),
    'aura-mark.svg': mark('color'), 'aura-mark-light.svg': mark('light'), 'aura-mark-white.svg': mark('mono-white'), 'aura-mark-black.svg': mark('mono-black'),
    'aura-app-icon.svg': app_icon(),
}
for n, c in files.items(): open(f'{OUT}/{n}', 'w').write(c)
print('wrote', len(files), 'files; word width', round(WORD_W), 'cap', WORD_B)

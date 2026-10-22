"""Make every app icon AURA needs from one square image.

    python3 tools/make_icons.py path/to/your-icon.png     # use your own icon
    python3 tools/make_icons.py                            # draw the default AURA orb
    python3 tools/make_icons.py icon.png --favicon brand/aura-mark-1024.png   # browser-tab icon from the logo

Writes into icons/: icon-192.png, icon-512.png, maskable-512.png (Android adaptive icon,
artwork kept inside the safe zone), apple-touch-icon.png (iPhone/iPad home screen, 180 px)
favicon-32.png and favicon.ico (16-256 px, used for Windows desktop shortcuts). Needs Pillow (pip install pillow). Use a square PNG of at least 512 px.
"""
import sys, os, math
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
BG = (5, 6, 10, 255)


def default_art(n=1024):
    """The AURA mark: a warm glowing orb with a tilted ring, on deep space."""
    im = Image.new('RGBA', (n, n), BG)
    glow = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for r, a in ((0.46, 40), (0.38, 60), (0.31, 90)):
        g.ellipse([n * (0.5 - r), n * (0.5 - r), n * (0.5 + r), n * (0.5 + r)], fill=(255, 150, 90, a))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(n * 0.06)))
    # orb with a soft highlight (radial gradient)
    orb = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    px = orb.load()
    cx, cy, R = n * 0.5, n * 0.5, n * 0.27
    hx, hy = cx - R * 0.35, cy - R * 0.4
    for y in range(int(cy - R), int(cy + R) + 1):
        for x in range(int(cx - R), int(cx + R) + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= R * R:
                t = min(1, math.hypot(x - hx, y - hy) / (R * 1.7))
                c0, c1, c2 = (255, 243, 230), (255, 178, 122), (138, 75, 42)
                c = [int(c0[i] + (c1[i] - c0[i]) * t / 0.45) if t < 0.45 else int(c1[i] + (c2[i] - c1[i]) * (t - 0.45) / 0.55) for i in range(3)]
                px[x, y] = (*c, 255)
    im.alpha_composite(orb)
    # tilted ring in front of / behind the orb
    ring = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    d.ellipse([n * 0.12, n * 0.4, n * 0.88, n * 0.6], outline=(255, 220, 190, 210), width=max(2, n // 90))
    ring = ring.rotate(18, resample=Image.BICUBIC, center=(n / 2, n / 2))
    im.alpha_composite(ring)
    return im


def fit(src, size, scale=1.0, bg=BG):
    canvas = Image.new('RGBA', (size, size), bg)
    s = int(size * scale)
    art = src.copy(); art.thumbnail((s, s), Image.LANCZOS)
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def main():
    os.makedirs(OUT, exist_ok=True)
    args = sys.argv[1:]; fav = None
    if '--favicon' in args: i = args.index('--favicon'); fav = Image.open(args[i + 1]).convert('RGBA'); del args[i:i + 2]
    if args:
        src = Image.open(args[0]).convert('RGBA')
        w, h = src.size; m = min(w, h)
        src = src.crop(((w - m) // 2, (h - m) // 2, (w - m) // 2 + m, (h - m) // 2 + m))   # centre square
    else:
        src = default_art()
    fit(src, 512).save(os.path.join(OUT, 'icon-512.png'))
    fit(src, 192).save(os.path.join(OUT, 'icon-192.png'))
    # Android crops the maskable icon to a circle/squircle: a full photo can fill it edge to edge (keep the face central);
    # artwork with transparency is shrunk into the safe zone instead
    photo = src.getchannel('A').getextrema()[0] == 255
    fit(src, 512, scale=1.0 if photo else 0.78).save(os.path.join(OUT, 'maskable-512.png'))
    fit(src, 180).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))  # iOS ignores transparency
    tab = fav or src; clear = (0, 0, 0, 0) if fav else BG
    fit(tab, 32, bg=clear).save(os.path.join(OUT, 'favicon-32.png'))
    fit(tab, 256, bg=clear).save(os.path.join(OUT, '..', 'favicon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print('Icons written to', os.path.normpath(OUT))


if __name__ == '__main__':
    main()

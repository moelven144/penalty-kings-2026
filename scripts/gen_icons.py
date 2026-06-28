#!/usr/bin/env python3
"""Generate app icons, favicon and splash for Penalty World Cup 2026."""
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = "/Users/gora/Soccer"
WWW = ROOT + "/www"
ASSETS = ROOT + "/assets"

SS = 4  # supersample factor for crisp edges


def radial_bg(size, inner, outer):
    """Radial gradient built small then upscaled (smooth + fast)."""
    g = 256
    img = Image.new("RGB", (g, g))
    px = img.load()
    cx = cy = (g - 1) / 2
    maxd = math.hypot(cx, cy)
    for y in range(g):
        for x in range(g):
            t = math.hypot(x - cx, y - cy) / maxd
            t = min(1.0, t)
            px[x, y] = tuple(int(inner[i] + (outer[i] - inner[i]) * t) for i in range(3))
    return img.resize((size, size), Image.LANCZOS)


def pentagon(cx, cy, r, rot):
    return [(cx + r * math.cos(rot + i * 2 * math.pi / 5),
             cy + r * math.sin(rot + i * 2 * math.pi / 5)) for i in range(5)]


def draw_logo(base, cx, cy, R, ring=True):
    """Draw a soccer ball badge centred at (cx,cy) with ball radius R."""
    size = base.size[0]
    # faint pitch centre-circle behind the ball
    d = ImageDraw.Draw(base, "RGBA")
    d.ellipse([cx - R * 1.7, cy - R * 1.7, cx + R * 1.7, cy + R * 1.7],
              outline=(255, 255, 255, 40), width=max(2, int(R * 0.03)))

    # gold ring frame around the ball
    if ring:
        rr = R * 1.30
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  outline=(255, 200, 61, 255), width=max(3, int(R * 0.07)))
        rr2 = R * 1.30 + R * 0.10
        d.ellipse([cx - rr2, cy - rr2, cx + rr2, cy + rr2],
                  outline=(255, 200, 61, 70), width=max(1, int(R * 0.02)))

    # ball on its own RGBA layer so the pattern is clipped to the circle
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    dl = ImageDraw.Draw(layer)
    dl.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(255, 255, 255, 255))

    black = (20, 22, 26, 255)
    seam_w = max(2, int(R * 0.045))
    rot0 = -math.pi / 2
    center_r = R * 0.34
    out_d = R * 0.66
    out_r = R * 0.24
    cpts = pentagon(cx, cy, center_r, rot0)
    # seams + outer pentagons
    for i in range(5):
        phi = rot0 + i * 2 * math.pi / 5
        ox, oy = cx + out_d * math.cos(phi), cy + out_d * math.sin(phi)
        dl.line([cpts[i], (ox, oy)], fill=black, width=seam_w)
        dl.polygon(pentagon(ox, oy, out_r, phi + math.pi), fill=black)
    # centre pentagon last (on top of seams)
    dl.polygon(cpts, fill=black)

    # clip to ball circle
    mask = Image.new("L", base.size, 0)
    ImageDraw.Draw(mask).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)

    # shading: soft highlight top-left, soft shadow bottom-right (blurred)
    shade = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(shade)
    ds.ellipse([cx - R * 0.95, cy - R * 0.95, cx + R * 0.25, cy + R * 0.25], fill=(255, 255, 255, 75))
    ds.ellipse([cx - R * 0.1, cy - R * 0.1, cx + R * 1.05, cy + R * 1.05], fill=(0, 0, 0, 70))
    shade = shade.filter(ImageFilter.GaussianBlur(R * 0.22))
    layer = Image.alpha_composite(layer, shade)

    combined = Image.composite(layer.split()[3], Image.new("L", base.size, 0), mask)
    base.paste(layer, (0, 0), combined)


def make_icon(size):
    s = size * 1  # already large; supersample by rendering big then down
    big = max(size, 256) * SS
    bg = radial_bg(big, (20, 99, 64), (10, 18, 36)).convert("RGBA")
    draw_logo(bg, big / 2, big / 2, big * 0.30, ring=True)
    return bg.convert("RGB").resize((size, size), Image.LANCZOS)


def make_splash(size, dark=False):
    big = 1024
    inner = (12, 40, 70) if not dark else (8, 14, 28)
    bg = radial_bg(big, inner, (8, 12, 24)).convert("RGBA")
    draw_logo(bg, big / 2, big * 0.42, big * 0.16, ring=True)
    # title text
    try:
        font_path = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
        f1 = ImageFont.truetype(font_path, 70)
        f2 = ImageFont.truetype(font_path, 44)
        d = ImageDraw.Draw(bg)
        def ctext(y, txt, fnt, col):
            w = d.textlength(txt, font=fnt)
            d.text((big / 2 - w / 2, y), txt, font=fnt, fill=col)
        ctext(big * 0.62, "PENALTY", f1, (255, 255, 255, 255))
        ctext(big * 0.70, "WORLD CUP 2026", f2, (255, 200, 61, 255))
    except Exception as e:
        print("splash font skipped:", e)
    return bg.convert("RGB").resize((size, size), Image.LANCZOS)


# ---- app icon source (1024, opaque, square) ----
icon1024 = make_icon(1024)
icon1024.save(ASSETS + "/icon.png")
print("wrote assets/icon.png")

# ---- web / PWA icons ----
for sz, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"),
                 (167, "icon-167.png"), (152, "icon-152.png"), (120, "icon-120.png")]:
    icon1024.resize((sz, sz), Image.LANCZOS).save(WWW + "/icons/" + name)
icon1024.resize((180, 180), Image.LANCZOS).save(WWW + "/apple-touch-icon.png")
print("wrote web icons")

# ---- maskable icon (extra padding so it survives circular masks) ----
mask_icon = Image.new("RGB", (512, 512), (11, 23, 51))
core = make_icon(512).resize((400, 400), Image.LANCZOS)
mask_icon.paste(core, (56, 56))
mask_icon.save(WWW + "/icons/icon-512-maskable.png")
print("wrote maskable icon")

# ---- favicons ----
fav = icon1024.resize((64, 64), Image.LANCZOS)
fav.save(WWW + "/favicon.png")
icon1024.resize((32, 32), Image.LANCZOS).save(WWW + "/icons/favicon-32.png")
# multi-size .ico
icon1024.save(WWW + "/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("wrote favicons")

# ---- splash screens for Capacitor ----
make_splash(2732).save(ASSETS + "/splash.png")
make_splash(2732, dark=True).save(ASSETS + "/splash-dark.png")
print("wrote splashes")
print("DONE")

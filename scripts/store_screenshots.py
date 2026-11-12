"""Compose captioned App Store screenshots from raw game captures.
Usage: python3 scripts/store_screenshots.py <raw_dir> [out_dir]
  raw_dir holds iphone/<scene>.png and ipad/<scene>.png (or <scene>.png for both), taken from the
  real game by scripts/store-shots.sh. Writes iphone69-NN-scene.png (1320x2868) and
  ipad13-NN-scene.png (2048x2732) to out_dir (default screenshots/v3/)."""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

RAW = sys.argv[1].rstrip('/') + '/'
OUT = (sys.argv[2].rstrip('/') if len(sys.argv) > 2 else 'screenshots/v3') + '/'
os.makedirs(OUT, exist_ok=True)
FONT = '/System/Library/Fonts/HelveticaNeue.ttc'
FONT_INDEX = 1  # Helvetica Neue Bold
SHOTS = [
    ('flight', 'SWIPE. BEND.', 'SCORE.'),
    ('save', 'THEN DIVE', 'TO SAVE IT'),
    ('end', 'SEND IT TO', 'YOUR MATES'),
    ('party', 'RELIVE IT', 'IN SLOW MOTION'),
    ('map', '300 LEVELS', 'ROAD TO GLORY'),
    ('title', '100% FREE.', 'NO ADS. NOTHING TO BUY.'),
]

def compose(W, H, name, l1, l2, idx, prefix, sub):
    bg = Image.new('RGB', (W, H), (6, 16, 31))
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((-W * 0.2, -H * 0.25, W * 1.2, H * 0.35), fill=70)
    bg = Image.composite(Image.new('RGB', (W, H), (40, 70, 140)), bg, glow.filter(ImageFilter.GaussianBlur(W * 0.08)))
    d = ImageDraw.Draw(bg)
    top = int(H * 0.2)
    size = int(W * 0.095) if W < 1600 else int(W * 0.07)
    f1 = ImageFont.truetype(FONT, size, index=FONT_INDEX)
    f2 = ImageFont.truetype(FONT, int(size * (0.62 if len(l2) > 14 else 1)), index=FONT_INDEX)
    d.text((W / 2, top * 0.42), l1, font=f1, fill=(255, 255, 255), anchor='mm')
    d.text((W / 2, top * 0.42 + size * 1.05), l2, font=f2, fill=(255, 204, 51), anchor='mm')
    path = RAW + sub + '/' + name + '.png'
    im = Image.open(path if os.path.exists(path) else RAW + name + '.png').convert('RGB')
    scale = min((H - top - int(H * 0.03)) / im.height, (W * 0.9) / im.width)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    r = int(im.width * 0.06)
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=r, fill=255)
    x, y = (W - im.width) // 2, top + int(H * 0.01)
    shadow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((x, y + 20, x + im.width, y + im.height + 20), radius=r, fill=150)
    bg = Image.composite(Image.new('RGB', (W, H), (0, 0, 0)), bg, shadow.filter(ImageFilter.GaussianBlur(30)))
    bg.paste(im, (x, y), mask)
    bg.save(f'{OUT}{prefix}-{idx:02d}-{name}.png')

for i, (n, a, b) in enumerate(SHOTS, 1):
    compose(1320, 2868, n, a, b, i, 'iphone69', 'iphone')
    compose(2048, 2732, n, a, b, i, 'ipad13', 'ipad')

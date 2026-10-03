"""Prepare throw and trophy art from the 1024x1024 Drive originals.

    python3 scripts/art.py <folder with Rock.jpg, Paper.jpg, Scissors.jpg and the five trophy .jpg files>

Removes the flat cream background (flood fill from the edges, so cream INSIDE an outline survives),
trims to the drawing plus a margin, and writes transparent WebP files to assets/art/.
"""
import sys, os
from collections import deque
from PIL import Image, ImageFilter

FILES = {
    'Rock.jpg': 'move-R', 'Paper.jpg': 'move-P', 'Scissors.jpg': 'move-S',
    'Centurion.jpg': 'award-100', 'How is this stuff fun for you.jpg': 'award-200',
    'Your hand called it wants a break.jpg': 'award-300', 'Get yourself checked out.jpg': 'award-400',
    'We are legally required to ask you if you are okay.jpg': 'award-500',
}
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'art')

def cutout(im, tol=34):
    im = im.convert('RGB'); w, h = im.size; px = im.load()
    # background colour = median of the border
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    dist = lambda c: max(abs(c[0] - bg[0]), abs(c[1] - bg[1]), abs(c[2] - bg[2]))
    mask = Image.new('L', (w, h), 255); m = mask.load()
    seen = bytearray(w * h); q = deque()
    for x in range(w): q.extend([(x, 0), (x, h - 1)])
    for y in range(h): q.extend([(0, y), (w - 1, y)])
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]: continue
        seen[i] = 1
        if dist(px[x, y]) > tol: continue
        m[x, y] = 0
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    # soften the cut edge a touch so outlines stay anti-aliased
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = im.convert('RGBA'); out.putalpha(mask)
    return out

def trim_square(im, pad=0.06):
    bbox = im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    x0, y0, x1, y1 = bbox; side = max(x1 - x0, y1 - y0); side = int(side * (1 + 2 * pad))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im.crop((int(cx - side / 2), int(cy - side / 2), int(cx - side / 2) + side, int(cy - side / 2) + side)), (0, 0))
    return canvas

def main(src, size=256):
    os.makedirs(OUT, exist_ok=True)
    missing = [f for f in FILES if not os.path.exists(os.path.join(src, f))]
    if missing: raise SystemExit(f'missing originals: {missing}')
    for f, name in FILES.items():
        im = trim_square(cutout(Image.open(os.path.join(src, f)))).resize((size, size), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86, method=6)
    print(f'wrote {len(FILES)} images to assets/art')

if __name__ == '__main__':
    main(sys.argv[1])

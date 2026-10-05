"""Prepare throw and trophy art from the 1024x1024 Drive originals.

    python3 scripts/art.py <folder with Rock.jpg, Paper.jpg, Scissors.jpg and the five trophy .jpg files>

Throws: the flat cream background is removed (flood fill from the edges), then the drawing is centred on its
visual weight (not its bounding box: the scissors' splayed handles and the paper's back sheet made bbox-centring
look off) and written as transparent WebP.
Trophies: the background is KEPT (cutting it out left cream trapped inside handles and jagged edges); each is
cropped square around the trophy with a margin and shown as a small cream card.
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

def centred_square(im, pad=0.06):
    """Square canvas centred on the drawing's visual weight (mean of opaque pixels), big enough that nothing clips."""
    a = im.getchannel('A'); w, h = im.size; px = a.load()
    sx = sy = n = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if px[x, y] > 40: sx += x; sy += y; n += 1
    cx, cy = sx / n, sy / n
    x0, y0, x1, y1 = a.point(lambda v: 255 if v > 40 else 0).getbbox()
    half = max(cx - x0, x1 - cx, cy - y0, y1 - cy) * (1 + pad)
    side = int(2 * half)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, (int(round(half - cx)), int(round(half - cy))))
    return canvas

def trophy_card(im, pad=0.08, tol=34):
    """Crop square around the trophy, keeping the original background."""
    im = im.convert('RGB'); w, h = im.size
    bg = im.getpixel((4, 4))
    diff = Image.eval(im.convert('L'), lambda v: 0)
    px = im.load(); d = diff.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if max(abs(c[0] - bg[0]), abs(c[1] - bg[1]), abs(c[2] - bg[2])) > tol: d[x, y] = 255
    x0, y0, x1, y1 = diff.getbbox()
    side = int(max(x1 - x0, y1 - y0) * (1 + 2 * pad))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = int(min(max(0, cx - side / 2), w - side)); top = int(min(max(0, cy - side / 2), h - side))
    side = min(side, w, h)
    return im.crop((left, top, left + side, top + side))

def main(src, size=256):
    os.makedirs(OUT, exist_ok=True)
    missing = [f for f in FILES if not os.path.exists(os.path.join(src, f))]
    if missing: raise SystemExit(f'missing originals: {missing}')
    for f, name in FILES.items():
        src_im = Image.open(os.path.join(src, f))
        if name.startswith('move-'):
            im = centred_square(cutout(src_im)).resize((size, size), Image.LANCZOS)
        else:
            im = trophy_card(src_im).resize((size, size), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86, method=6)
    print(f'wrote {len(FILES)} images to assets/art')

if __name__ == '__main__':
    main(sys.argv[1])

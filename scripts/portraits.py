"""Crop the 1024x1024 opponent portraits (from the Drive folder "Rock Paper Scissors Roguelite")
to face-centred squares and write assets/portraits/<opponent id>.jpg at 256x256.

    python3 scripts/portraits.py <folder with Name.jpg originals>

Crop boxes are (centre x, centre y, side) in 256-px units of the original (x4 for pixels), chosen by eye so
the head fills most of the tile. Tweak a number and re-run to adjust one face.
"""
import sys, os
from PIL import Image

CROPS = {  # name: (opponent id, cx, cy, side)
    'Gary': ('repeater', 128, 108, 200), 'Hank': ('rock-enjoyer', 140, 104, 184),
    'Pam': ('paper-pusher', 130, 108, 190), 'Cassie': ('scissor-sister', 128, 112, 200),
    'Otto': ('cycler', 132, 96, 198), 'Polly': ('mimic', 126, 104, 206),
    'Lenny': ('loop', 136, 98, 192), 'Sal': ('superstitious', 128, 112, 196),
    'Connor': ('contrarian', 138, 102, 190), 'Pete': ('hot-hand', 128, 112, 196),
    'Olga': ('cold-hand', 128, 96, 198), 'Carl': ('collector', 128, 104, 186),
    'Lou': ('gambler', 118, 108, 204), 'Sigrid': ('psychologist', 138, 104, 202),
    'Miranda': ('mirror', 128, 104, 190), 'Kai': ('chaos-engine', 128, 116, 210),
    'Moira': ('mood-swings', 130, 118, 212), 'Delphine': ('oracle', 140, 106, 190),
    'Felix': ('bluffer', 148, 100, 196), 'John': ('nash', 132, 106, 186),
}
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'portraits')

def crop(src_dir, out_dir=OUT, size=256):
    os.makedirs(out_dir, exist_ok=True)
    missing = [n for n in CROPS if not os.path.exists(os.path.join(src_dir, n + '.jpg'))]
    if missing: raise SystemExit(f'missing originals: {missing}')
    for name, (oid, cx, cy, side) in CROPS.items():
        im = Image.open(os.path.join(src_dir, name + '.jpg')).convert('RGB')
        k = im.width / 256
        half = side * k / 2
        x0, y0 = max(0, cx * k - half), max(0, cy * k - half)
        x0, y0 = min(x0, im.width - side * k), min(y0, im.height - side * k)
        box = tuple(round(v) for v in (x0, y0, x0 + side * k, y0 + side * k))
        im.crop(box).resize((size, size), Image.LANCZOS).save(os.path.join(out_dir, oid + '.jpg'), quality=84, optimize=True, progressive=True)
    return [c[0] for c in CROPS.values()]

if __name__ == '__main__':
    print(f'wrote {len(crop(sys.argv[1]))} portraits')

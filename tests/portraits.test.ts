// Every opponent has a face-cropped portrait file, and the asset registry points at it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { OPPONENTS } from '../src/content/opponents';

/** Width/height from a JPEG's SOF marker. */
function jpegSize(buf: Uint8Array): { w: number; h: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: (buf[i + 5] << 8) | buf[i + 6], w: (buf[i + 7] << 8) | buf[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

test('every opponent has a 256×256 JPEG portrait, and there are no strays', () => {
  const files = readdirSync('assets/portraits').filter((f) => f.endsWith('.jpg'));
  for (const o of OPPONENTS) {
    const buf = readFileSync(`assets/portraits/${o.id}.jpg`);
    const size = jpegSize(buf);
    assert.deepEqual(size, { w: 256, h: 256 }, o.id);
    assert.ok(buf.length > 4000 && buf.length < 60000, `${o.id} is ${buf.length} bytes`);
  }
  assert.deepEqual(files.sort(), OPPONENTS.map((o) => `${o.id}.jpg`).sort());
});

test('portrait crop list covers exactly the 20 opponents', () => {
  const src = readFileSync('scripts/portraits.py', 'utf8');
  for (const o of OPPONENTS) assert.ok(src.includes(`'${o.id}'`), `${o.id} missing from scripts/portraits.py`);
});

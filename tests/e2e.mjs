// Browser end-to-end checks on the built page (dist/index.html).
// Run: npm run build && node tests/e2e.mjs   (needs Playwright + Chromium installed)
// Prints PASS/FAIL per check and exits non-zero on any failure. Screenshots go to $E2E_SHOTS if set.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = await import(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
}
const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;
const SHOTS = process.env.E2E_SHOTS;
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); if (!ok) failures++; };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];

async function open(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  return page;
}
const inView = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel); if (!el) return false;
  const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
}, sel);
const noPageScroll = (page) => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2 && document.documentElement.scrollWidth <= innerWidth + 2);
const debug = async (page, fn) => { await page.keyboard.press('`'); await fn(); await page.keyboard.press('`'); };
const addUp = async (page, id) => { await page.selectOption('#dbg-up', id); await page.click('#dbg-add'); };

// ---------- title, hard mode, shelf ----------
{
  const page = await open(1366, 768);
  check('title: trophy shelf shows 5 locked awards', (await page.$$('.medal.locked')).length === 5);
  check('title: fits 1366×768 without scrolling', await noPageScroll(page));
  await shot(page, 'title');
  await page.keyboard.press('m');
  check('title: M toggles Hard Mode on', await page.isChecked('#hard-mode'));
  await page.keyboard.press('Enter');
  check('hard run: HUD shows HARD', (await page.textContent('.hud')).includes('HARD'));
  check('hard run: 0 Extra Lives', (await page.textContent('[data-fx="lives"]')).includes('0'));
  await page.close();
}

// ---------- hunch, cold read, toggles, build panel ----------
{
  const page = await open(1366, 768);
  await page.fill('#seed-input', 'e2e-reads'); await page.click('#start-seed'); // seeded: deterministic
  await debug(page, async () => { for (const id of ['spreadsheet', 'thick-skull', 'muscle-memory', 'cold-read', 'cold-read']) await addUp(page, id); });
  check('Hunch appears right after buying Spreadsheet', !!(await page.$('.read-item.hunch')));
  check('throw buttons show estimate odds', (await page.$$('.odds')).length === 3);
  await page.click('.read-item.hunch .read-hide');
  check('× hides the Hunch', !(await page.$('.read-item.hunch')));
  check('hiding the Hunch also hides estimate odds', (await page.$$('.odds')).length === 0);
  await page.click('.build-item[data-id="spreadsheet"] summary');
  await page.check('#show-spreadsheet');
  check('build panel switch brings the Hunch back', !!(await page.$('.read-item.hunch')));
  const orderBefore = await page.$$eval('.build-item[data-tree="rock"]', (els) => els.map((e) => e.dataset.id));
  await page.hover(`.build-item[data-id="${orderBefore[1]}"]`);
  await page.click(`.build-item[data-id="${orderBefore[1]}"] button[aria-label^="Move"][aria-label$="up"]`);
  const orderAfter = await page.$$eval('.build-item[data-tree="rock"]', (els) => els.map((e) => e.dataset.id));
  check('▲ reorders within a tree', orderAfter[0] === orderBefore[1] && orderAfter[1] === orderBefore[0], orderAfter.join(','));
  await page.click('#tree-toggle-rock');
  check('tree header collapses its list', (await page.$$('.build-item[data-tree="rock"]')).length === 0);
  await page.click('#build-toggle');
  check('build panel collapses to a rail', !!(await page.$('.build-panel.rail')));
  await page.reload();
  check('layout choices survive a reload', !!(await page.$('#resume')));
  await page.click('#resume');
  check('…collapsed rail remembered', !!(await page.$('.build-panel.rail')));
  await page.keyboard.press('b');
  check('B re-opens the build panel', !(await page.$('.build-panel.rail')));
  check('…upgrades survive the reload', (await page.$$('.build-item[data-tree="paper"]')).length === 2);
  check('…rock tree still collapsed after reload', !!(await page.$('#tree-toggle-rock')) && (await page.$$('.build-item[data-tree="rock"]')).length === 0);
  await debug(page, async () => { for (let k = 0; k < 8; k++) await page.click('text=+1 life'); await page.fill('#dbg-stage', '9'); await page.click('#dbg-jump'); });
  for (let i = 0; i < 60 && !(await page.$('.read-item.cold')); i++) { if (await page.$('#go-store') || await page.$('#go-over')) break; await page.keyboard.press('p'); }
  if (await page.$('.read-item.cold')) {
    const txt = await page.textContent('.read-item.cold');
    check('Cold Read says what it means', /Not .+\. They picked .+ or .+\./.test(txt), txt.trim());
    check('button odds include the cold read', (await page.textContent('.your-move')).includes('cold read'));
  } else check('Cold Read appeared within 60 rounds', false, JSON.stringify(await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('rps-roguelite.run.v1') || '{}'); return { prefs: localStorage.getItem('rps-roguelite.prefs.v1'), owned: (st.owned || []).map((u) => u.id + 'x' + u.stacks), ruled: st.ruledOut }; })));
  await shot(page, 'run-reads');
  await page.close();
}

// ---------- store: name, stickers, reroll wording ----------
for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]]) {
  const page = await open(w, h);
  await page.keyboard.press('Enter');
  await page.keyboard.press('r');
  await page.keyboard.press('Enter');
  const tag = `${w}x${h}`;
  check(`${tag} store: named Secondhand Store`, (await page.textContent('.store-head h1')).includes('Secondhand'));
  check(`${tag} store: rarity stickers on every card`, (await page.$$('.up-card .rarity-sticker')).length === (await page.$$('.up-card')).length);
  const btn = (await page.textContent('#reroll-store')).replace(/\s+/g, ' ');
  check(`${tag} store: reroll says what it rerolls, price kept apart`, /Reroll all four unsold offers/.test(btn) && !!(await page.$('#reroll-store .price-chip')), btn);
  check(`${tag} store: Continue and all four Buy buttons visible`, (await inView(page, '#leave-store')) && (await inView(page, '#buy-3')));
  check(`${tag} store: no page scroll`, await noPageScroll(page));
  await shot(page, `store-${tag}`);
  await debug(page, async () => { await page.click('text=+1000¢'); });
  for (const k of ['1', '2', '3']) await page.keyboard.press(k);
  const one = (await page.textContent('#reroll-store')).replace(/\s+/g, ' ');
  check(`${tag} store: one left reads "one unsold offer"`, one.includes('Reroll one unsold offer'), one);
  await page.keyboard.press('4');
  check(`${tag} store: sold out → "Nothing left to reroll" and disabled`, (await page.textContent('#reroll-store')).includes('Nothing left') && await page.$eval('#reroll-store', (b) => b.disabled));
  await page.keyboard.press('Enter');
  check(`${tag} run: throws visible, no page scroll`, (await inView(page, '#throw-S')) && (await noPageScroll(page)));
  await page.close();
}

// ---------- awards unlock live ----------
{
  const page = await open(1366, 768);
  await page.keyboard.press('Enter');
  await debug(page, async () => {
    await page.click('text=+1 life'); await page.click('text=+1 life');
    await page.fill('#dbg-stage', '10'); await page.click('#dbg-jump');
    await page.fill('#dbg-n', '100'); await page.click('text=Skip N rounds (tie)');
  });
  await page.keyboard.press('r');
  const toast = (await page.textContent('.toast').catch(() => '')) ?? '';
  check('award toast appears when a run passes round 100', toast.includes('Award unlocked'), toast);
  await page.reload();
  check('award is on the shelf after a reload', (await page.$$('.medal.won')).length === 1);
  await shot(page, 'shelf-won');
  await page.close();
}

// ---------- sound: music per screen, throw sounds, purchase, life lost, mute ----------
{
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  // Record every <audio> play() call (src + volume) without needing real speakers.
  await page.addInitScript(() => {
    window.__plays = [];
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__plays.push({ src: this.src.split('/').pop(), vol: this.volume, loop: this.loop }); return orig.call(this).catch(() => undefined); };
  });
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const plays = () => page.evaluate(() => window.__plays.map((p) => p.src));
  check('silent until the player interacts', (await plays()).length === 0);
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);
  check('title music starts after the first interaction, looping', (await page.evaluate(() => window.__plays.some((p) => p.src === 'music-title.mp3' && p.loop))));
  await page.keyboard.press('h');
  await page.waitForTimeout(100);
  check('How to Play keeps the title music (no restart)', (await plays()).filter((x) => x === 'music-title.mp3').length === 1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('rounds music on the run screen', (await plays()).includes('music-rounds.mp3'));
  await page.keyboard.press('r');
  await page.waitForTimeout(100);
  check('Rock plays RockSelect', (await plays()).includes('rock-select.mp3'));
  await page.keyboard.press('Enter'); // round 1 → store
  await page.waitForTimeout(200);
  check('store music in the store', (await plays()).includes('music-store.mp3'));
  await page.keyboard.press('1');
  await page.waitForTimeout(100);
  check('buying plays PurchaseSuccess', (await plays()).includes('purchase.mp3'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('back to rounds music after the store', (await plays()).filter((x) => x === 'music-rounds.mp3').length >= 2);
  await page.keyboard.press('p'); await page.waitForTimeout(80);
  await page.keyboard.press('s'); await page.waitForTimeout(80);
  const p = await plays();
  check('Paper and Scissors play their own sounds', p.includes('paper-select.mp3') && p.includes('scissors-select.mp3'));
  // force a loss with a life left
  await page.keyboard.press('`');
  await page.click('text=+1 life');
  await page.fill('#dbg-stage', '9'); await page.click('#dbg-jump');
  await page.click('text=LOSS if you throw R');
  await page.keyboard.press('`');
  await page.keyboard.press('r');
  await page.waitForTimeout(150);
  check('losing an Extra Life plays LossOfLife', (await plays()).includes('life-lost.mp3'));
  const musicVol = await page.evaluate(() => Math.max(...[...document.querySelectorAll('audio')].map((a) => a.volume), ...Array.from({ length: 0 })));
  void musicVol;
  await page.click('#sound-toggle');
  check('sound dock opens with music/effects sliders', !!(await page.$('#vol-music')) && !!(await page.$('#vol-sfx')));
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  check('V mutes (button says Muted)', (await page.textContent('#sound-toggle')).includes('Muted'));
  const before = (await plays()).length;
  await page.keyboard.press('r'); await page.waitForTimeout(100);
  check('muted: throws make no sound', (await plays()).length === before);
  await page.reload();
  check('mute is remembered after reload', (await page.textContent('#sound-toggle')).includes('Muted'));
  await page.keyboard.press('v');
  check('V unmutes', !(await page.textContent('#sound-toggle')).includes('Muted'));
  await page.close();
}

// ---------- rarity stickers: pips visible, rare is not paper-blue ----------
{
  const page = await open(1366, 768);
  await page.keyboard.press('Enter');
  await page.keyboard.press('r');
  await page.keyboard.press('Enter');
  const ok = await page.$$eval('.rarity-sticker', (els) => els.every((el) => {
    const pips = el.querySelector('.pips');
    return pips && getComputedStyle(pips).color !== getComputedStyle(el).backgroundColor;
  }));
  check('rarity sticker pips are a different colour from the sticker', ok);
  const rare = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--r-rare').trim());
  const paper = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
  check('rare colour differs from Paper blue', rare !== paper && rare.toLowerCase() === '#ff74b8', `${rare} vs ${paper}`);
  await page.close();
}

// ---------- round 5: the Bluffer announces, Mood Swings shows a mood ----------
for (const [w, hgt] of [[1366, 768], [390, 844]]) {
  const page = await open(w, hgt);
  await page.keyboard.press('Enter');
  await debug(page, async () => { await page.click('text=+1 life'); await page.fill('#dbg-stage', '9'); await page.click('#dbg-jump'); await page.selectOption('#dbg-opp', 'bluffer'); await page.click('#dbg-setopp'); });
  const says = await page.$('#opp-says');
  check(`${w}px: Felix announces a throw before you choose`, !!says && /Felix says/.test(await says.textContent()));
  check(`${w}px: the announcement is on screen without scrolling`, await inView(page, '#opp-says') && (w < 500 || await noPageScroll(page)));
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/r5-felix-${w}.png` });
  await page.keyboard.press('p'); await page.waitForTimeout(150);
  if (await page.$('#throw-P:not([disabled])')) {
    check(`${w}px: history shows a Said row`, (await page.$$eval('.ht-said .ht-cell.said', (els) => els.length)) >= 1);
  }
  await debug(page, async () => { await page.selectOption('#dbg-opp', 'mood-swings'); await page.click('#dbg-setopp'); });
  const mood = await page.$('#opp-mood');
  check(`${w}px: Moira shows her mood and when it swings`, !!mood && /Stubborn|Spiteful/.test(await mood.textContent()) && /swing/i.test(await mood.textContent()));
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/r5-${w}.png` });
  await page.close();
}

// ---------- portraits: every opponent shows its picture, everywhere; missing files fall back to initials ----------
for (const [w, hgt] of [[1366, 768], [390, 844]]) {
  const page = await open(w, hgt);
  await page.keyboard.press('Enter');
  await debug(page, async () => { await page.click('text=+1 life'); await page.fill('#dbg-stage', '9'); await page.click('#dbg-jump'); });
  let ids = [];
  await debug(page, async () => { ids = await page.$$eval('#dbg-opp option', (os) => os.map((o) => o.value)); });
  const bad = [];
  for (const id of ids) {
    await debug(page, async () => { await page.selectOption('#dbg-opp', id); await page.click('#dbg-setopp'); });
    const ok = await page.waitForFunction(() => { const i = document.querySelector('.opp-head .portrait img.asset-img'); return i && i.complete && i.naturalWidth === 256 ? i.getAttribute('src') : false; }, null, { timeout: 3000 }).then((h) => h.jsonValue()).catch(() => null);
    if (ok !== `portraits/${id}.jpg`) bad.push(`${id}:${ok}`);
  }
  check(`${w}px: all ${ids.length} opponents show their own portrait in the opponent panel`, ids.length === 20 && bad.length === 0, bad.join(' '));
  const box = await page.$eval('.opp-head .portrait', (el) => { const r = el.getBoundingClientRect(); const i = el.querySelector('img').getBoundingClientRect(); return [r.width, r.height, i.width, i.height]; });
  check(`${w}px: portrait image fills its square tile`, box[0] >= 56 && Math.abs(box[0] - box[1]) < 1 && Math.abs(box[2] - box[0]) < 1 && Math.abs(box[3] - box[1]) < 1, box.join(','));
  check(`${w}px: still no page scroll on desktop with portraits`, w < 500 || await noPageScroll(page));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/portrait-run-${w}.png` });
  // store: next-opponent portrait
  await debug(page, async () => { await page.click('text=Skip to store'); });
  const storeImg = await page.waitForFunction(() => { const i = document.querySelector('.service .portrait img.asset-img'); return !!(i && i.complete && i.naturalWidth === 256); }, null, { timeout: 3000 }).then(() => true).catch(() => false);
  check(`${w}px: store shows the next opponent's portrait`, storeImg);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/portrait-store-${w}.png` });
  await page.close();
}
{
  // game over: tiny portraits of everyone met
  const page = await open(1366, 768);
  await page.keyboard.press('Enter');
  await debug(page, async () => { await page.fill('#dbg-stage', '9'); await page.click('#dbg-jump'); await page.click('text=LOSS if you throw R'); });
  while (await page.$('#throw-R:not([disabled])') && !(await page.$('#go-over'))) { await debug(page, async () => { await page.click('text=LOSS if you throw R'); }); await page.keyboard.press('r'); await page.waitForTimeout(60); }
  await page.click('#go-over');
  const n = await page.waitForFunction(() => { const im = [...document.querySelectorAll('.opp-list .portrait img.asset-img')]; return im.length && im.every((i) => i.complete && i.naturalWidth === 256) ? im.length : 0; }, null, { timeout: 3000 }).then((h) => h.jsonValue()).catch(() => 0);
  check('game over lists opponents with their portraits', n >= 1, `${n}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/portrait-over.png` });
  await page.close();
}
{
  // a copy of index.html without its portraits folder still works: initials appear instead
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/portraits\//, (r) => r.abort());
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(PAGE); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const txt = await page.$eval('.opp-head .portrait', (el) => ({ img: !!el.querySelector('img'), text: el.textContent.trim() }));
  check('missing portrait files fall back to initials (no broken image)', !txt.img && /^[A-Z]{2}$/.test(txt.text), JSON.stringify(txt));
  await page.close();
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);

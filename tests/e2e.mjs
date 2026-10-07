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
// The test build (.e2e/) has the debug panel; the published dist/ build does not.
const PAGE = pathToFileURL(path.resolve('.e2e/index.html')).href;
const PUBLIC_PAGE = pathToFileURL(path.resolve('dist/index.html')).href;
const SHOTS = process.env.E2E_SHOTS;
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); if (!ok) failures++; };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];

async function open(w, h) {
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: w, height: h } });
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
  // The Opponents Defeated collection is open by default, so the title page may scroll a little; what matters is
  // that the actions, the trophy shelf and the start of the collection are all on the first screen.
  check('title: Start, trophy shelf and the collection heading are on the first screen at 1366×768', await inView(page, '#start') && await inView(page, '.medals') && await inView(page, '#foes > summary'));
  check('title: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
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
  const rockIds = await page.$$eval('.build-item[data-tree="rock"]', (els) => els.map((e) => e.dataset.id));
  check('build list is in purchase order, with no reorder controls', rockIds.join(',') === 'thick-skull,muscle-memory' && (await page.$$('.reorder, .build-item[draggable="true"]')).length === 0, rockIds.join(','));
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
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1366, height: 768 } });
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
  check('music is off by default: nothing plays after the first interaction', !(await plays()).some((x) => x.startsWith('music')));
  check('title offers “Turn on epic music?”', (await page.textContent('#title-music-on'))?.includes('Turn on epic music?'));
  await page.click('#title-music-on');
  await page.waitForTimeout(200);
  check('turning it on starts the one looping track', (await page.evaluate(() => window.__plays.some((p) => p.src === 'music-title.mp3' && p.loop))));
  check('the title prompt goes away once music is on', !(await page.$('#title-music-on')));
  await page.click('#howto');
  await page.waitForTimeout(100);
  check('How to Play keeps the same music (no restart)', (await plays()).filter((x) => x === 'music-title.mp3').length === 1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.press('r');
  await page.waitForTimeout(100);
  check('Rock plays RockSelect', (await plays()).includes('rock-select.mp3'));
  await page.keyboard.press('Enter'); // round 1 → store
  await page.waitForTimeout(200);
  await page.keyboard.press('1');
  await page.waitForTimeout(100);
  check('buying plays PurchaseSuccess', (await plays()).includes('purchase.mp3'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('one track across title, rounds and store (no other music files)', !(await plays()).some((x) => x.startsWith('music') && x !== 'music-title.mp3'));
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
  await page.click('#settings-toggle');
  check('sound dock opens with music/effects sliders (music is on)', !!(await page.$('#vol-music')) && !!(await page.$('#vol-sfx')));
  await page.click('#music-on');
  await page.waitForTimeout(100);
  check('music can be switched off again (the opt-in button returns)', !(await page.$('#vol-music')) && !!(await page.$('#sd-music-on')) && (await page.evaluate(() => window.__fx.audio.current)) === null);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  check('V mutes (button says Muted)', (await page.textContent('#settings-toggle')).includes('Muted'));
  const before = (await plays()).length;
  await page.keyboard.press('r'); await page.waitForTimeout(100);
  check('muted: throws make no sound', (await plays()).length === before);
  await page.reload();
  check('mute is remembered after reload', (await page.textContent('#settings-toggle')).includes('Muted'));
  await page.keyboard.press('v');
  check('V unmutes', !(await page.textContent('#settings-toggle')).includes('Muted'));
  await page.close();
}

// ---------- rarity stickers: pips visible, rare is not paper-blue ----------
{
  const page = await open(1366, 768);
  await page.keyboard.press('Enter');
  await page.keyboard.press('r');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.screen.store .rarity-sticker', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(100);
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
  // a veteran: every opponent met once (the store only shows portraits of opponents you've faced)
  await page.addInitScript(() => { if (sessionStorage.getItem('vet')) return; sessionStorage.setItem('vet', '1'); const foes = {}; for (const id of 'repeater,rock-enjoyer,paper-pusher,scissor-sister,cycler,mimic,loop,superstitious,contrarian,hot-hand,cold-hand,collector,gambler,psychologist,mirror,chaos-engine,mood-swings,oracle,bluffer,nash'.split(',')) foes[id] = { met: 1, beaten: 0 }; localStorage.setItem('rps-roguelite.awards.v1', JSON.stringify({ best: 0, bestHard: 0, runs: 0, unlocked: {}, foes })); });
  await page.reload();
  check(`${w}px: (setup) veteran progress loaded`, (await page.innerText('#foes-count')).includes('20 met'));
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
  check(`${w}px: store shows the next opponent's portrait (once met)`, storeImg, storeImg ? '' : (await page.$eval('.next-opp', (e) => e.innerHTML.slice(0, 200)).catch((e) => String(e))));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/portrait-store-${w}.png` });
  await page.close();
}
{
  // game over: tiny portraits of everyone met
  const page = await open(1366, 768);
  await page.keyboard.press('Enter');
  await debug(page, async () => { await page.fill('#dbg-stage', '9'); await page.click('#dbg-jump'); await page.click('text=LOSS if you throw R'); });
  while (await page.$('#throw-R:not([disabled])') && !(await page.$('#go-over'))) { await debug(page, async () => { await page.click('text=LOSS if you throw R'); }); await page.keyboard.press('r'); await page.waitForTimeout(60); }
  await page.waitForSelector('.screen.over', { timeout: 4000 }); // death now moves on by itself
  const n = await page.waitForFunction(() => { const im = [...document.querySelectorAll('.opp-list .portrait img.asset-img')]; return im.length && im.every((i) => i.complete && i.naturalWidth === 256) ? im.length : 0; }, null, { timeout: 3000 }).then((h) => h.jsonValue()).catch(() => 0);
  check('game over lists opponents with their portraits', n >= 1, `${n}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/portrait-over.png` });
  await page.close();
}
{
  // a copy of index.html without its portraits folder still works: initials appear instead
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1366, height: 768 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/portraits\//, (r) => r.abort());
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(PAGE); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const txt = await page.$eval('.opp-head .portrait', (el) => ({ img: !!el.querySelector('img'), text: el.textContent.trim() }));
  check('missing portrait files fall back to initials (no broken image)', !txt.img && /^[A-Z]{2}$/.test(txt.text), JSON.stringify(txt));
  await page.close();
}

// ---------- round 6 ----------
const imgsLoaded = (page, sel) => page.waitForFunction((sel) => { const im = [...document.querySelectorAll(sel)]; return im.length && im.every((i) => i.complete && i.naturalWidth > 0) ? im.length : 0; }, sel, { timeout: 4000 }).then((h) => h.jsonValue()).catch(() => 0);
{
  // (1) the PUBLISHED build has no debug mode at all
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1366, height: 768 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(PUBLIC_PAGE); await page.evaluate(() => localStorage.clear()); await page.reload();
  check('public build: no "Press ` for debug mode" hint', !(await page.innerText('body')).includes('debug mode'));
  await page.keyboard.press('Enter'); await page.keyboard.press('`'); await page.waitForTimeout(150);
  check('public build: ` does not open a debug panel', !(await page.$('.debug')) && !!(await page.$('#throw-R')));
  const html = (await import('node:fs')).readFileSync(new URL(PUBLIC_PAGE), 'utf8');
  check('public build: debug code is not in the file', !/debug mode|dbg-jump/i.test(html));
  // (2) throw art on the title, throw buttons and result
  await page.goto(PUBLIC_PAGE);
  check('title shows the three throw pictures', (await imgsLoaded(page, '.title-hands img.asset-img')) === 3);
  // (3) trophy art (locked trophies are dimmed silhouettes)
  check('trophy shelf shows five trophy pictures', (await imgsLoaded(page, '.medal-art img.asset-img')) === 5);
  // (4) seed suggestion
  check('seed box suggests “lizard spock”', (await page.getAttribute('#seed-input', 'placeholder')).includes('lizard spock'));
  await page.keyboard.press('Enter');
  check('throw buttons show the throw pictures', (await imgsLoaded(page, '.throw-art img.asset-img')) === 3);
  await page.keyboard.press('r'); await page.waitForTimeout(150);
  check('result shows throw pictures', (await imgsLoaded(page, '.result img.asset-img')) >= 2);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r6-run-public.png` });
  await page.close();
}
{
  // (5) phone: after the store, the next round starts at the top of the page
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(PAGE); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.tap('#start');
  await debug(page, async () => { await page.click('text=+1 life'); await page.click('text=+1 life'); await page.fill('#dbg-stage', '6'); await page.click('#dbg-jump'); await page.click('text=Skip to store'); });
  check('phone: in the store', !!(await page.$('.screen.store')));
  // (6) pinned wallet: scroll to the bottom; coins + lives stay on screen
  const cont = await page.$('text=Continue'); await cont.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
  const scrolled = await page.evaluate(() => scrollY);
  const bar = await page.$eval('#wallet-bar', (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vis: getComputedStyle(el).display !== 'none', text: el.textContent }; });
  check('phone store: wallet bar stays pinned at the top after scrolling down', scrolled > 400 && bar.vis && bar.top >= -1 && bar.bottom < 90, JSON.stringify({ scrolled, ...bar }));
  const coins = await page.$eval('#wallet-coins', (e) => e.textContent.replace(/\D/g, ''));
  const lifeBtn = await page.$('#buy-life:not([disabled])');
  if (lifeBtn) {
    await lifeBtn.scrollIntoViewIfNeeded(); await lifeBtn.tap(); await page.waitForTimeout(150);
    const after = await page.$eval('#wallet-coins', (e) => e.textContent.replace(/\D/g, ''));
    const barTop = await page.$eval('#wallet-bar', (el) => el.getBoundingClientRect().top);
    check('phone store: pinned wallet updates after a purchase while scrolled', Number(after) < Number(coins) && barTop >= -1 && barTop < 40, `${coins}→${after}`);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r6-store-pinned-390.png` });
  await (await page.$('#leave-store')).scrollIntoViewIfNeeded();
  await page.tap('#leave-store'); await page.waitForTimeout(250);
  check('phone: next round starts scrolled to the top (was: stuck at the build panel)', (await page.evaluate(() => scrollY)) === 0 && !!(await page.$('#throw-R')));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r6-after-store-390.png` });
  await ctx.close();
  // desktop store: the head shows the wallet, no extra bar
  const dp = await open(1366, 768);
  await dp.keyboard.press('Enter');
  await debug(dp, async () => { await dp.click('text=Skip to store'); });
  check('desktop store: wallet in the header, pinned bar hidden', await dp.$eval('#wallet-bar', (e) => getComputedStyle(e).display === 'none') && await dp.$eval('.store-head .wallet', (e) => getComputedStyle(e).display !== 'none'));
  await dp.close();
}
{
  // New feature: Opponents Defeated collection
  const page = await open(1366, 768);
  check('collection: OPEN by default, 0 of 20', (await page.$eval('#foes', (d) => d.open)) && (await page.textContent('#foes-count')).startsWith('0 of 20'));
  check('collection: visible on the first screen at 1366×768 without scrolling', await page.$eval('#foes .foe-grid', (el) => el.getBoundingClientRect().top < innerHeight));
  check('collection: opens; all 20 are mystery tiles at first', (await page.$$('.foe-unknown .foe-mystery')).length === 20 && (await page.$$('.foe .asset-img')).length === 0);
  await page.keyboard.press('Enter');
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('rps-roguelite.save.v1') ?? localStorage.getItem(Object.keys(localStorage).find((k) => k.includes('save')) ?? '') ?? 'null')?.opponentId ?? null);
  await debug(page, async () => { await page.click('text=WIN if you throw R'); });
  await page.keyboard.press('r'); await page.waitForTimeout(200); // gap 1: this win reaches the store
  check('collection: first defeat shows a toast', /New in your collection: .+ defeated/.test((await page.textContent('.toast').catch(() => '')) ?? ''));
  await page.click('#go-store').catch(() => {});
  await page.keyboard.press('Enter'); await page.waitForTimeout(150); // leave store → next opponent
  await page.keyboard.press('r'); await page.waitForTimeout(150);   // play one round vs opponent #2 (met)
  await page.evaluate(() => { location.hash = ''; });
  await page.reload();
  const states = await page.$$eval('.foe', (els) => els.map((e) => e.className.match(/foe-(unknown|met|defeated)/)[1]));
  const count = (k) => states.filter((x) => x === k).length;
  check('collection: one defeated, one met (not yet defeated), the rest unknown', count('defeated') === 1 && count('met') === 1 && count('unknown') === 18, `${count('defeated')}/${count('met')}/${count('unknown')}`);
  check('collection: still open after reload', await page.$eval('#foes', (d) => d.open));
  await page.click('#foes > summary'); await page.waitForTimeout(80); await page.reload();
  check('collection: closing it is remembered', !(await page.$eval('#foes', (d) => d.open)));
  await page.click('#foes > summary'); await page.waitForTimeout(80);
  check('collection: defeated card is crossed off and stamped', !!(await page.$('.foe-defeated .foe-stamp')) && await page.$eval('.foe-defeated .foe-name', (e) => getComputedStyle(e).textDecorationLine.includes('line-through')));
  check('collection: met card shows portrait and “Not yet defeated”', (await imgsLoaded(page, '.foe-met img.asset-img')) === 1 && (await page.textContent('.foe-met .foe-state')) === 'Not yet defeated');
  check('collection: count updates', (await page.textContent('#foes-count')).startsWith('1 of 20 defeated · 2 met'));
  void first;
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r6-collection-1366.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  check('collection: no horizontal scroll on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (SHOTS) { await (await page.$('#foes')).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/r6-collection-390.png` }); }
  await page.close();
}

// ---------- round 7 ----------
{
  const page = await open(1366, 768);
  await page.click('#start');
  check('normal mode starts with 3 Extra Lives', (await page.textContent('[data-fx="lives"] .hud-num')).replace(/\D/g, '') === '3');
  await page.keyboard.press('r'); await page.waitForTimeout(120);
  check('history header says “Rounds ago”', (await page.textContent('.ht-head .ht-label')).trim() === 'Rounds ago' && !(await page.innerText('body')).includes('Turns ago'));
  check('history note no longer says “counts rounds in this table”', !(await page.innerText('body')).includes('counts rounds in this table'));
  const art = await page.$$eval('.throw-art img.asset-img', (im) => im.map((i) => { const a = i.getBoundingClientRect(), p = i.parentElement.getBoundingClientRect(); return Math.abs((a.left + a.right) / 2 - (p.left + p.right) / 2) + Math.abs((a.top + a.bottom) / 2 - (p.top + p.bottom) / 2); }));
  check('throw pictures sit centred in their discs', art.length === 3 && art.every((d) => d < 1.5), art.map((d) => d.toFixed(1)).join(','));
  await page.close();
  const hp = await open(1366, 768);
  await hp.click('#hard-mode'); await hp.click('#start');
  check('Hard Mode still starts with 0 Extra Lives', (await hp.textContent('[data-fx="lives"] .hud-num')).replace(/\D/g, '') === '0');
  await hp.close();
}
{
  // phones: pinned HUD while scrolling the run screen; bought cards collapse in the store
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(PAGE); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.tap('#start');
  await debug(page, async () => { await page.click('text=+1 life'); await page.fill('#dbg-stage', '9'); await page.click('#dbg-jump'); for (const id of ['thick-skull', 'spreadsheet', 'snip-snip']) await addUp(page, id); });
  for (let i = 0; i < 4; i++) { await page.tap('#throw-P'); await page.waitForTimeout(80); }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(120);
  const hud = await page.$eval('.hud', (el) => { const r = el.getBoundingClientRect(); return { top: r.top, h: r.height, y: scrollY, text: el.innerText }; });
  check('phone: HUD (round, coins, lives, progress) stays pinned when scrolled to the build panel', hud.y > 600 && hud.top >= -1 && hud.top < 2 && hud.h < 120 && /to store/.test(hud.text), JSON.stringify(hud));
  check('phone: pinned HUD keeps the progress bar visible', await page.$eval('.hud .progress-track', (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < 130 && r.width > 200; }));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r7-hud-pinned-390.png` });
  await debug(page, async () => { await page.click('text=+1 life'); await page.click('text=+1000¢'); await page.click('text=Skip to store'); });
  const tall = await page.$eval('.offers .up-card', (el) => el.getBoundingClientRect().height);
  const buy = await page.$('.offers .up-card .btn.primary:not([disabled]), .offers .up-card button:not([disabled])');
  await buy.scrollIntoViewIfNeeded(); await buy.tap(); await page.waitForTimeout(150);
  const sold = await page.$eval('.offers .sold-card', (el) => ({ h: el.getBoundingClientRect().height, text: el.innerText }));
  check('phone store: a bought offer collapses to one short line', sold.h < 70 && sold.h < tall / 2 && /bought/i.test(sold.text), `${tall.toFixed(0)}→${sold.h.toFixed(0)}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r7-store-sold-390.png`, fullPage: true });
  await ctx.close();
  const dp = await open(1366, 768);
  await dp.keyboard.press('Enter');
  check('desktop: HUD not sticky, seed visible', await dp.$eval('.hud', (el) => getComputedStyle(el).position !== 'sticky') && await dp.$eval('.hud-seed', (el) => getComputedStyle(el).display !== 'none'));
  await debug(dp, async () => { await dp.click('text=+1000¢'); await dp.click('text=Skip to store'); });
  await dp.locator('.offers .up-card button:not([disabled])').first().click(); await dp.waitForTimeout(120);
  check('desktop store: bought card keeps its full size (grid stays aligned)', await dp.$eval('.offers .sold-card', (el) => el.getBoundingClientRect().height > 150));
  await dp.close();
}

// ---------- title tidy-up ----------
for (const [w, hgt] of [[1366, 768], [390, 844]]) {
  const page = await open(w, hgt);
  check(`${w}px title: the facts list is gone`, !(await page.$('.title-facts')) && !(await page.innerText('body')).includes('meta-progression'));
  const gap = await page.evaluate(() => document.querySelector('.seed-help').getBoundingClientRect().top - document.querySelector('.seed-form').getBoundingClientRect().bottom);
  check(`${w}px title: seed note has breathing room below the seed box`, gap >= 6, `${gap.toFixed(1)}px`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/title-tidy-${w}.png` });
  await page.click('#howto');
  const pages = [];
  for (let i = 0; i < 12; i++) {
    pages.push({ title: await page.innerText('.howto-card h2'), body: await page.innerText('.howto-body'), of: await page.innerText('.howto-card .eyebrow') });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/howto-${i + 1}-${w}.png` });
    if (!(await page.$('#howto-next'))) break;
    await page.click('#howto-next'); await page.waitForTimeout(40);
  }
  const titles = pages.map((p) => p.title.toLowerCase());
  const want = ['it’s rock, paper, scissors – duh', 'earn and spend coins', 'build up', 'losing ends the run', 'play 20 unique opponents', 'the gaps grow', 'nothing is rigged', 'go play'];
  check(`${w}px How to Play: 8 pages in the new order`, titles.join('|') === want.join('|') && /of 8/i.test(pages[0].of), titles.join(' | '));
  check(`${w}px How to Play: page texts`, pages[0].body.startsWith('The opponent locks in its throw before you choose. Keep playing rounds until you reach a store and then buy power-ups.')
    && pages[1].body.startsWith('A win pays 12 coins. A tie pays 5 coins.')
    && /^51 upgrades across 3 skill trees\./.test(pages[2].body)
    && /^Beat 20 unique opponents\./.test(pages[4].body) && !/streak upgrades/.test(pages[4].body)
    && pages[6].body.endsWith('Every opponent appears once before anyone repeats.')
    && /^Zero meta-progression/.test(pages[7].body) && /beat all 20 opponents/.test(pages[7].body) && /One more run\?$/.test(pages[7].body), pages.map((p) => p.body.slice(0, 40)).join(' | '));
  check(`${w}px How to Play: the last page starts a run`, !!(await page.$('#howto-start')));
  await page.close();
}

// ---------- round 10: Settings menu with Return to title screen ----------
for (const [w, hgt, mobile] of [[1366, 768, false], [390, 844, true]]) {
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: w, height: hgt }, hasTouch: mobile, isMobile: mobile });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(PAGE); await page.evaluate(() => localStorage.clear()); await page.reload();
  const press = (sel) => (mobile ? page.tap(sel) : page.click(sel));
  check(`${w}px: the corner button is Settings`, /settings/i.test(await page.innerText('#settings-toggle')));
  await press('#settings-toggle');
  check(`${w}px title: Settings has sound + display, but no Return to title`, !!(await page.$('#vol-sfx')) && !!(await page.$('#reduce-anim')) && !(await page.$('#exit-to-title')));
  await press('#settings-toggle');
  await press('#start');
  await page.keyboard.press('`'); await page.fill('#dbg-stage', '6'); await page.click('#dbg-jump'); await page.keyboard.press('`');
  await press('#throw-R'); await page.waitForTimeout(100);
  await press('#throw-P'); await page.waitForTimeout(100);
  const before = await page.evaluate(() => ({ round: document.querySelector('.hud-stat .hud-num').textContent, coins: document.querySelector('[data-fx="coins"] .hud-num').textContent }));
  await press('#settings-toggle');
  check(`${w}px run: Settings offers Return to title screen`, /Return to title screen/.test(await page.innerText('#settings-panel')));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r10-settings-run-${w}.png` });
  await press('#exit-to-title');
  await page.waitForSelector('.screen.title');
  check(`${w}px: back on the title with Resume run and Start run, settings closed`, !!(await page.$('#resume')) && !!(await page.$('#start')) && !(await page.$('#settings-panel')));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r10-title-resume-${w}.png` });
  await press('#resume');
  await page.waitForSelector('.screen.run');
  const after = await page.evaluate(() => ({ round: document.querySelector('.hud-stat .hud-num').textContent, coins: document.querySelector('[data-fx="coins"] .hud-num').textContent }));
  check(`${w}px: Resume picks the run up where you left it`, JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  // from the store too, and a new run replaces the saved one
  await page.keyboard.press('`'); await page.click('text=Skip to store'); await page.keyboard.press('`');
  await page.waitForSelector('.screen.store');
  await press('#settings-toggle'); await press('#exit-to-title');
  await page.waitForSelector('.screen.title');
  await press('#resume');
  check(`${w}px: exiting from a store resumes in that store`, !!(await page.waitForSelector('.screen.store', { timeout: 2000 }).catch(() => null)));
  await press('#settings-toggle'); await press('#exit-to-title');
  await press('#start');
  await page.waitForSelector('.screen.run');
  check(`${w}px: Start run from the title begins a fresh run`, (await page.evaluate(() => document.querySelector('.hud-stat .hud-num').textContent)).trim() === '1' && /0 to store|1 to store/.test(await page.innerText('.progress')));
  await page.close();
}

// ---------- round 9: music volume on phones, no shortcut chips, equal throws, mystery opponent ----------
{
  // Served over http (like GitHub Pages / claude.ai): music runs through a Web Audio gain node, which is what
  // iPhones respect (they ignore an <audio> element's .volume).
  const http = await import('node:http');
  const fs = await import('node:fs');
  const root = path.resolve('.e2e');
  const types = { '.html': 'text/html', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.tap('#title-music-on');
  await page.waitForTimeout(1500);
  const a = await page.evaluate(() => ({ routed: window.__fx.audio.musicRouted(), vol: window.__fx.audio.musicVolume(), el: [...document.querySelectorAll('audio')].length }));
  check('http: music is routed through a gain node', a.routed, JSON.stringify(a));
  check('http: music fades in to the default level (50% of the ceiling)', Math.abs(a.vol - 0.275) < 0.02, String(a.vol));
  await page.tap('#settings-toggle');
  await page.$eval('#vol-music', (el) => { el.value = '10'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  const v = await page.evaluate(() => window.__fx.audio.musicVolume());
  check('http: the music slider changes the gain (works on iPhone)', Math.abs(v - 0.055) < 0.005, String(v));
  await page.close();
  server.close();
}
for (const [w, hgt, mobile] of [[1366, 768, false], [390, 844, true]]) {
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: w, height: hgt }, hasTouch: mobile, isMobile: mobile });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(PAGE); await page.evaluate(() => localStorage.clear()); await page.reload();
  const press = (sel) => (mobile ? page.tap(sel) : page.click(sel));
  const kbds = [];
  kbds.push(await page.$$eval('kbd', (k) => k.length));
  await press('#start');
  kbds.push(await page.$$eval('kbd', (k) => k.length));
  await page.keyboard.press('`'); await page.fill('#dbg-stage', '6'); await page.click('#dbg-jump'); await page.keyboard.press('`');
  await press('#throw-P');
  await page.waitForTimeout(150);
  await page.mouse.move(2, 2); // desktop: the hover lift belongs to the pointer, not to the last throw
  const looks = await page.$$eval('.throw', (bs) => bs.map((b) => { const c = getComputedStyle(b); return [b.className.replace(/tree-\w+/, ''), c.borderTopColor, c.transform, c.boxShadow, c.outlineStyle].join('|'); }));
  check(`${w}px: after a throw all three choices look the same (no highlight, not raised)`, new Set(looks).size === 1 && !looks[0].includes('selected'), looks.join(' ; '));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r9-throws-${w}.png` });
  await page.keyboard.press('`'); await page.click('text=Skip to store'); await page.keyboard.press('`');
  await page.waitForSelector('.screen.store');
  kbds.push(await page.$$eval('kbd', (k) => k.length));
  check(`${w}px: no keyboard-shortcut chips (title, rounds, store)`, kbds.every((n) => n === 0), kbds.join(','));
  const next = await page.evaluate(() => ({ mystery: !!document.querySelector('.next-opp .portrait.foe-mystery'), img: !!document.querySelector('.next-opp .portrait img'), sub: document.querySelector('.next-opp .opp-title')?.textContent }));
  check(`${w}px store: an opponent you’ve never faced shows the “?” tile, not their portrait`, next.mystery && !next.img && next.sub === 'Not met yet', JSON.stringify(next));
  const stretch = await page.innerText('.stretch');
  check(`${w}px store: the next stretch length is not shown before Continue`, /\?\? rounds/.test(stretch) && !/Then \d/.test(stretch), stretch.replace(/\n/g, ' | '));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r9-store-${w}.png`, fullPage: true });
  await press('#leave-store');
  await page.waitForSelector('.screen.run');
  check(`${w}px: reduced motion: Continue goes straight to the rounds, which show the stretch length`, /this stretch is \d+ rounds/i.test(await page.innerText('.progress')));
  await page.close();
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);

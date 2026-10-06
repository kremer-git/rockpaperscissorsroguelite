// Browser checks for the animation/sound "juice" layer, with full motion, on desktop and a phone.
// Run: node scripts/build.mjs && node tests/juice.e2e.mjs   (frames go to $E2E_SHOTS if set)
// The main suite (tests/e2e.mjs) covers the same flows with reduced motion.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = await import(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
}
const PAGE = pathToFileURL(path.resolve('.e2e/index.html')).href;
const SHOTS = process.env.E2E_SHOTS;
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); if (!ok) failures++; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];

const DEVICES = {
  desktop: { viewport: { width: 1366, height: 768 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
async function open(kind, { keep = false } = {}) {
  const ctx = await browser.newContext({ ...DEVICES[kind], reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${kind}: ${e.message}`));
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(PAGE);
  if (!keep) { await page.evaluate(() => localStorage.clear()); await page.reload(); }
  page.kind = kind; page.ctx = ctx;
  return page;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${page.kind}-${name}.png` }); };
const debug = async (page, fn) => { await page.keyboard.press('`'); await fn(); await page.keyboard.press('`'); };
const sfx = (page) => page.evaluate(() => [...window.__fx.sfx]);
const clearSfx = (page) => page.evaluate(() => { window.__fx.sfx.length = 0; });
const force = (page, o) => debug(page, () => page.click(`text=${o} if you throw R`));
const start = async (page) => { await page.click('#start'); await page.waitForSelector('#throw-R'); };
const leave = async (page) => { await page.click('#leave-store'); await page.waitForSelector('.screen.run', { timeout: 6000 }); await page.waitForSelector('#gap-reveal', { state: 'detached', timeout: 2000 }).catch(() => {}); };
const stage = (page, n) => debug(page, async () => { await page.fill('#dbg-stage', String(n)); await page.click('#dbg-jump'); });
const throwR = async (page) => { if (page.kind === 'phone') await page.tap('#throw-R'); else await page.keyboard.press('r'); };
const hudCoins = (page) => page.$eval('[data-fx="coins"] .hud-num', (e) => Number(e.textContent.replace(/\D/g, '')));

for (const kind of ['desktop', 'phone']) {
  // ---------------- round effects ----------------
  {
    const page = await open(kind);
    await start(page);
    check(`${kind}: animations on (no .calm)`, !(await page.evaluate(() => document.documentElement.classList.contains('calm'))));
    await stage(page, 9);
    // 3: pump: short, and a second press during it is ignored
    await force(page, 'WIN');
    const round0 = await page.evaluate(() => document.querySelector('.hud-stat .hud-num').textContent);
    await page.evaluate(() => { window.__pump = []; const mo = new MutationObserver(() => { if (document.querySelector('.result.pumping .pump-fist')) window.__pump.push(performance.now()); }); mo.observe(document.getElementById('app'), { subtree: true, childList: true, attributes: true }); window.__pumpMo = mo; });
    const t0 = await page.evaluate(() => performance.now());
    await throwR(page);
    await page.waitForTimeout(50);
    await throwR(page); // during the pump: must be ignored
    await page.waitForFunction(() => !!document.querySelector('.result.out-win'), null, { timeout: 2000 }).catch(() => {});
    const t1 = await page.evaluate(() => performance.now());
    const pumpSeen = await page.evaluate(() => { window.__pumpMo.disconnect(); return window.__pump.length; });
    check(`${kind}: pump plays (two fists bob) and resolves quickly`, pumpSeen > 0 && !(await page.$('.result.pumping')) && t1 - t0 < 900, `seen=${pumpSeen} took=${Math.round(t1 - t0)}ms`);
    await page.waitForTimeout(300);
    const round1 = await page.evaluate(() => document.querySelector('.hud-stat .hud-num').textContent);
    check(`${kind}: a second press during the pump is ignored (one round, not two)`, Number(round1) === Number(round0) + 1, `${round0}→${round1}`);
    if (kind === 'desktop') { await page.mouse.move(2, 2); await page.waitForTimeout(300); }
    const looks = await page.$$eval('.throw', (bs) => bs.map((b) => { const c = getComputedStyle(b); return [b.className.replace(/tree-\w+/, ''), c.borderTopColor, c.transform, c.boxShadow].join('|'); }));
    check(`${kind}: after a throw the three choices look equal (no gold ring, nothing raised)`, new Set(looks).size === 1, looks.join(' ; '));
    await shot(page, '04-throws-equal');
    // a frame mid-pump, for the eye
    await force(page, 'TIE'); await throwR(page); await page.waitForTimeout(70); await shot(page, '03-pump'); await page.waitForTimeout(500);
    // 4 + 7: win impact + coins
    await force(page, 'WIN');
    const c0 = await hudCoins(page);
    await clearSfx(page);
    await throwR(page);
    await page.waitForTimeout(280);
    const hitNow = await page.evaluate(() => ({ hit: !!document.querySelector('.clash .fx-hit'), dots: document.querySelectorAll('#fx-layer .dot').length, coins: document.querySelectorAll('#fx-layer .fly.coin:not(.small)').length }));
    await shot(page, '04-win-impact-coins');
    check(`${kind}: win: opponent's throw jolts, dots burst, coins fly`, hitNow.hit && hitNow.dots >= 6 && hitNow.coins >= 1, JSON.stringify(hitNow));
    await page.waitForTimeout(900);
    const c1 = await hudCoins(page);
    const s1 = await sfx(page);
    check(`${kind}: coin counter counts up to the real total`, c1 > c0 && !(await page.$('#fx-layer .fly')), `${c0}→${c1}`);
    check(`${kind}: win sounds: hit + coins + progress tick`, s1.includes('hit') && s1.includes('coin') && s1.includes('tick'), s1.join(','));
    // tie: bonk + small coin
    await force(page, 'TIE');
    await clearSfx(page);
    await throwR(page);
    await page.waitForTimeout(300);
    const tie = await page.evaluate(() => ({ bonk: !!document.querySelector('.clash .fx-bonk'), small: document.querySelectorAll('#fx-layer .fly.coin.small').length, big: document.querySelectorAll('#fx-layer .fly.coin:not(.small)').length }));
    await shot(page, '04-tie');
    check(`${kind}: tie: both throws bonk, only a small coin or two`, tie.bonk && tie.small >= 1 && tie.small <= 2 && tie.big === 0, JSON.stringify(tie));
    // loss with a life: red edges
    await page.waitForTimeout(700);
    await force(page, 'LOSS');
    await throwR(page);
    await page.waitForTimeout(290);
    const edges = !!(await page.$('#fx-layer .screen-flash.loss-edges'));
    await shot(page, '04-loss-edges');
    check(`${kind}: loss: red screen edges flash`, edges);
    await page.waitForTimeout(600);
    check(`${kind}: red edge flash clears itself`, !(await page.$('#fx-layer .screen-flash')));
    // save: purple shield (Monolith turns the first Rock loss this stretch into a tie)
    await debug(page, async () => { await page.selectOption('#dbg-up', 'monolith'); await page.click('#dbg-add'); await page.click('text=LOSS if you throw R'); });
    await clearSfx(page);
    await throwR(page);
    await page.waitForTimeout(360);
    const shield = !!(await page.$('.clash .shield-ring'));
    await shot(page, '04-save-shield');
    check(`${kind}: save: purple shield snaps around your throw (+ shield sound)`, shield && (await sfx(page)).includes('save') && !!(await page.$('.result.out-saved')));
    await page.waitForTimeout(500); // the result pop (which scales the clash) has finished; badge has settled
    const geo = await page.evaluate(() => {
      const chip = document.querySelector('.clash .clash-side:first-child .move-chip').getBoundingClientRect();
      const ring = document.querySelector('.shield-ring')?.getBoundingClientRect();
      const badge = document.querySelector('.shield-badge')?.getBoundingClientRect();
      if (!ring || !badge) return null;
      const c = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      const cc = c(chip), rc = c(ring), bc = c(badge), rad = ring.width / 2;
      return { dx: Math.abs(cc.x - rc.x), dy: Math.abs(cc.y - rc.y), bigger: ring.width > chip.width, bx: Math.abs(bc.x - (rc.x + rad * 0.7071)), by: Math.abs(bc.y - (rc.y - rad * 0.7071)) };
    });
    await shot(page, '04-save-shield-settled');
    check(`${kind}: save: ring is centred on YOUR throw`, !!geo && geo.dx < 2 && geo.dy < 2 && geo.bigger, JSON.stringify(geo));
    check(`${kind}: save: shield badge sits on the ring's upper-right edge`, !!geo && geo.bx < 4 && geo.by < 4, JSON.stringify(geo));
    // 5: breathing
    const breathe = await page.$eval('.opp-head .portrait .asset-img', (e) => getComputedStyle(e).animationName);
    check(`${kind}: opponent portrait breathes (subtle idle loop)`, breathe === 'breathe', breathe);
    // 8: progress bar animates width
    const fillT = await page.$eval('.hud .progress-fill', (e) => getComputedStyle(e).transitionProperty + ' ' + getComputedStyle(e).transitionDuration);
    check(`${kind}: progress bar slides (width transition)`, /width/.test(fillT), fillT);
    // 6: danger tint only at 0 lives
    check(`${kind}: no danger tint while you still have lives`, !(await page.evaluate(() => document.documentElement.classList.contains('danger'))));
    await debug(page, async () => { for (let i = 0; i < 6; i++) await page.click('text=−1 life'); });
    const danger = await page.evaluate(() => ({ on: document.documentElement.classList.contains('danger'), shadow: getComputedStyle(document.body, '::before').boxShadow, ev: getComputedStyle(document.body, '::before').pointerEvents }));
    await shot(page, '06-danger');
    check(`${kind}: 0 lives: subtle red edges, click-through`, danger.on && /rgba\(255, 70, 70/.test(danger.shadow) && danger.ev === 'none', JSON.stringify(danger));
    check(`${kind}: throws still clickable under the danger tint`, await page.$eval('#throw-R', (b) => { const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && b.contains(el); }));
    await page.ctx.close();
  }
  // hard mode: no tint at the start; tint once a bought life is lost
  {
    const page = await open(kind);
    await page.click('#hard-mode'); await start(page);
    check(`${kind}: Hard Mode start (0 lives): NO danger tint`, !(await page.evaluate(() => document.documentElement.classList.contains('danger'))));
    await page.ctx.close();
  }
  // ---------------- 9: store arrival ----------------
  {
    const page = await open(kind);
    await start(page);
    await force(page, 'WIN');
    await clearSfx(page);
    await throwR(page); // stretch 1 is one round: this reaches the store
    await page.waitForTimeout(420);
    const arrive = await page.evaluate(() => ({ cls: !!document.querySelector('.hud .progress-track.arrive'), fill: document.querySelector('.hud .progress-fill').style.width }));
    await shot(page, '09-arrival-sweep');
    const s9 = await sfx(page);
    check(`${kind}: store arrival: gold sweep on a full bar + bell`, arrive.cls && arrive.fill === '100%' && s9.includes('storeIn'), JSON.stringify(arrive) + ' ' + s9.join(','));
    if (kind === 'phone') check('phone: the arrival sweep is on screen (pinned HUD)', await page.$eval('.hud .progress-track', (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom < innerHeight; }));
    // 11 + 13: dealing (and legendary shimmer when one shows up)
    await clearSfx(page);
    await page.click('#go-store');
    await page.waitForTimeout(120);
    const dealing = await page.$$eval('.offers .up-card', (cs) => cs.map((c) => c.classList.contains('deal') && getComputedStyle(c).animationName === 'deal-in'));
    await shot(page, '11-dealing');
    await page.waitForTimeout(500);
    check(`${kind}: store cards are dealt in (4 cards, staggered)`, dealing.length === 4 && dealing.every(Boolean) && (await sfx(page)).filter((x) => x === 'deal').length === 4);
    check(`${kind}: dealt cards end fully visible and in place`, await page.$$eval('.offers .up-card', (cs) => cs.every((c) => getComputedStyle(c).opacity === '1')));
    // 12: buy → stamp (no flying token any more)
    await debug(page, () => page.click('text=+1000¢'));
    const btn = await page.$('.offers .up-card button:not([disabled])');
    await btn.scrollIntoViewIfNeeded();
    const slot = await btn.evaluate((b) => b.closest('.up-card').dataset.slot);
    await clearSfx(page);
    if (kind === 'phone') await btn.tap(); else await btn.click();
    await page.waitForTimeout(150);
    const stamp = await page.evaluate((slot) => ({ stamp: !!document.querySelector(`.up-card[data-slot="${slot}"] .sold.stamp-in`), token: !!document.querySelector('#fx-layer .fly') }), slot);
    await shot(page, '12-bought-stamp');
    check(`${kind}: buying stamps the card, and nothing flies off to the build`, stamp.stamp && !stamp.token && (await sfx(page)).includes('stamp'), JSON.stringify(stamp));
    await page.waitForTimeout(300);
    const soldOpacity = async () => page.$eval(`.offers .up-card[data-slot="${slot}"]`, (c) => ({ sold: c.classList.contains('sold-card'), op: Number(getComputedStyle(c).opacity), cls: c.className, anim: getComputedStyle(c).animationName }));
    const before = await soldOpacity();
    await clearSfx(page);
    const rr = page.locator('#reroll-store'); await rr.scrollIntoViewIfNeeded();
    if (kind === 'phone') await rr.tap(); else await rr.click();
    await page.waitForTimeout(150);
    const dealtNow = await page.$$eval('.offers .up-card', (cs) => cs.map((c) => ({ sold: c.classList.contains('sold-card'), deal: c.classList.contains('deal') })));
    await page.waitForTimeout(700);
    const after = await soldOpacity();
    await page.locator(`.offers .up-card[data-slot="${slot}"]`).scrollIntoViewIfNeeded();
    await shot(page, '12-after-reroll');
    check(`${kind}: after a reroll the bought card stays greyed out`, before.sold && after.sold && after.op < 0.8 && Math.abs(after.op - before.op) < 0.01, JSON.stringify({ before, after }));
    check(`${kind}: a reroll deals in only the new cards (not the bought one)`, dealtNow.filter((c) => c.sold).every((c) => !c.deal) && dealtNow.filter((c) => !c.sold).every((c) => c.deal) && (await sfx(page)).filter((x) => x === 'deal').length === dealtNow.filter((c) => !c.sold).length, JSON.stringify(dealtNow));
    // 13: find a legendary by rerolling (late stage weights)
    await leave(page);
    await stage(page, 12);
    await debug(page, async () => { await page.click('text=+1M¢'); await page.click('text=Skip to store'); });
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      found = !!(await page.$('.offers .up-card.rarity-card-legendary:not(.sold-card)'));
      if (!found) { await page.click('#reroll-store'); await page.waitForTimeout(40); }
    }
    if (found) {
      await page.waitForTimeout(1000);
      const leg = await page.$eval('.offers .up-card.rarity-card-legendary:not(.sold-card)', (c) => getComputedStyle(c, '::after').animationName);
      const el = await page.$('.offers .up-card.rarity-card-legendary:not(.sold-card)'); await el.scrollIntoViewIfNeeded();
      await shot(page, '13-legendary');
      check(`${kind}: legendary card has the gold shimmer`, /shimmer/.test(leg), leg);
    } else check(`${kind}: legendary card has the gold shimmer`, false, 'no legendary after 40 rerolls');
    await page.ctx.close();
  }
  // ---------------- 10: dreaded gap: hidden in the store, revealed after Continue ----------------
  {
    const page = await open(kind);
    await start(page);
    await stage(page, 6); // next stretch after this store is 34
    await debug(page, () => page.click('text=Skip to store'));
    await clearSfx(page);
    await page.waitForTimeout(600);
    const inStore = await page.innerText('.stretch');
    check(`${kind}: the store doesn't say how long the next stretch is`, /\?\? rounds/.test(inStore) && !/34/.test(inStore) && !(await sfx(page)).includes('drum'), inStore.replace(/\n/g, ' | '));
    const cont = page.locator('#leave-store'); await cont.scrollIntoViewIfNeeded();
    if (kind === 'phone') await cont.tap(); else await cont.click();
    await page.waitForTimeout(450);
    const mid = await page.evaluate(() => { const o = document.getElementById('gap-reveal'); const n = o?.querySelector('.gr-num'); const r = o?.getBoundingClientRect(); return o ? { text: n.textContent, scale: getComputedStyle(n).getPropertyValue('--dread'), full: r.width >= innerWidth - 1 && r.height >= innerHeight - 1, store: !!document.querySelector('.screen.store') } : null; });
    await shot(page, '10-reveal-mid');
    check(`${kind}: Continue opens a full-screen reveal that counts up the Fibonacci steps (still on the store underneath)`, !!mid && Number(mid.text) < 34 && Number(mid.scale) > 1 && mid.full && mid.store, JSON.stringify(mid));
    await page.waitForFunction(() => document.querySelector('#gap-reveal .gr-num')?.textContent === '34', null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
    await shot(page, '10-reveal-end');
    const end = await page.evaluate(() => ({ num: document.querySelector('#gap-reveal .gr-num')?.textContent, sub: document.querySelector('#gap-reveal .gr-sub')?.textContent, scary: document.getElementById('gap-reveal')?.classList.contains('scary') }));
    const drums = (await sfx(page)).filter((x) => x === 'drum').length;
    check(`${kind}: reveal lands on the real gap with drums and a big final drum`, end.num === '34' && /rounds vs /.test(end.sub) && end.scary && drums >= 6 && (await sfx(page)).includes('drumBig'), `${JSON.stringify(end)}, ${drums} drums`);
    await page.waitForSelector('.screen.run', { timeout: 3000 });
    await page.waitForTimeout(400);
    check(`${kind}: then the rounds start (the stretch is 34) and the reveal is gone`, /this stretch is 34 rounds/i.test(await page.innerText('.progress')) && !(await page.$('#gap-reveal')));
    // tap to skip
    await stage(page, 8);
    await debug(page, () => page.click('text=Skip to store'));
    await page.waitForTimeout(500);
    const t0 = Date.now();
    await page.locator('#leave-store').click();
    await page.waitForTimeout(200);
    await page.mouse.click(30, 300);
    await page.waitForSelector('.screen.run', { timeout: 3000 });
    check(`${kind}: a tap skips the reveal`, Date.now() - t0 < 900, `${Date.now() - t0}ms`);
    await page.ctx.close();
  }
  // ---------------- 16: death transition ----------------
  {
    const page = await open(kind);
    await start(page);
    await debug(page, async () => { for (let i = 0; i < 4; i++) await page.click('text=−1 life'); await page.click('text=LOSS if you throw R'); });
    await clearSfx(page);
    await throwR(page);
    await page.waitForTimeout(800); // 200 ms pump + 400 ms impact
    const d1 = await page.evaluate(() => ({ dying: document.documentElement.classList.contains('dying'), grey: document.documentElement.classList.contains('dying-grey'), music: window.__fx.audio.wanted }));
    await shot(page, '16-death-1-impact');
    await page.waitForTimeout(800);
    const title = await page.$eval('#fx-layer .death-title', (e) => e.innerText).catch(() => '');
    await shot(page, '16-death-2-verdict');
    const s16 = await sfx(page);
    check(`${kind}: death: impact, colour drains, music cut, sounds (impact, scratch, drum)`, d1.dying && d1.grey && d1.music === null && ['impact', 'scratch', 'drumBig'].every((k) => s16.includes(k)), JSON.stringify(d1) + ' ' + s16.join(','));
    check(`${kind}: death: "RUN OVER" slams in with a quip`, /run over/i.test(title) && title.split('\n').length >= 2, title.replace(/\n/g, ' | '));
    await page.waitForTimeout(1300);
    check(`${kind}: death: arrives on the game-over screen by itself (~2.5 s), effects cleaned up`, !!(await page.$('.screen.over')) && !(await page.$('#fx-layer .death-title, #fx-layer .death-veil')) && !(await page.evaluate(() => document.documentElement.classList.contains('dying'))));
    await page.waitForTimeout(80);
    await shot(page, '16-death-3-over');
    await page.waitForTimeout(1200);
    check(`${kind}: game-over stats finish counting at their real values`, await page.$$eval('.stats-grid .stat-val', (v) => v.every((e) => e.textContent.trim().length > 0)));
    await page.ctx.close();
  }
  {
    // skip
    const page = await open(kind);
    await start(page);
    await debug(page, async () => { for (let i = 0; i < 4; i++) await page.click('text=−1 life'); await page.click('text=LOSS if you throw R'); });
    await throwR(page);
    await page.waitForTimeout(450);
    if (kind === 'phone') await page.tap('body', { position: { x: 50, y: 400 } }); else await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    check(`${kind}: death: a tap / key skips straight to the game-over screen`, !!(await page.$('.screen.over')) && !(await page.evaluate(() => document.documentElement.classList.contains('dying') || document.documentElement.classList.contains('dying-grey'))));
    await page.ctx.close();
  }
  // ---------------- 14 + 15: title reveals ----------------
  {
    const page = await open(kind);
    await page.waitForTimeout(100); // first title view starts tracking (nothing replays)
    await start(page);
    await debug(page, async () => { await page.fill('#dbg-stage', '12'); await page.click('#dbg-jump'); await page.fill('#dbg-n', '100'); await page.click('text=Skip N rounds (tie)'); });
    await page.waitForSelector('#throw-R:not([disabled])', { timeout: 3000 }).catch(() => {});
    await throwR(page); await page.waitForTimeout(400); // a real round records the 100-round award
    // defeat the current opponent: reach a store
    await debug(page, () => page.click('text=Skip to store'));
    await page.reload(); // back to the title (with a saved run)
    await page.waitForTimeout(250);
    if (kind === 'phone') {
      check('phone: trophy reveal waits until the shelf is scrolled into view', await page.$eval('.medal[data-award="100"] .medal-art', (e) => e.classList.contains('reveal-wait')));
      await (await page.$('.medal[data-award="100"]')).scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(450);
    const spin = await page.$eval('.medal[data-award="100"] .medal-art', (e) => e.classList.contains('trophy-spin')).catch(() => false);
    await shot(page, '15-trophy-spin');
    const sp = await page.waitForFunction(() => document.querySelectorAll('#fx-layer .spark').length, null, { timeout: 2500 }).then((h) => h.jsonValue()).catch(() => 0);
    await shot(page, '15-sparkle');
    check(`${kind}: new trophy spins in with a sparkle burst`, spin && sp > 0, `spin=${spin} sparks=${sp}`);
    const foes = await page.$('#foes .foe-defeated'); await foes.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const slam = await page.$$eval('.foe-defeated .foe-stamp', (s) => s.some((e) => e.classList.contains('stamp-slam')));
    await shot(page, '14-defeated-slam');
    check(`${kind}: newly defeated opponent gets the stamp slam on the title`, slam);
    const s14 = await sfx(page);
    check(`${kind}: reveal sounds (whoosh, sparkle, stamp)`, ['whoosh', 'sparkle', 'stamp'].every((k) => s14.includes(k)), s14.join(','));
    await clearSfx(page);
    await page.reload(); await page.waitForTimeout(1500);
    check(`${kind}: reveals play only once (not again on the next visit)`, !(await page.$('.trophy-spin, .stamp-slam')) && !(await sfx(page)).includes('stamp'));
    await page.ctx.close();
  }
  // ---------------- power-up icons ----------------
  {
    const page = await open(kind);
    await start(page);
    await debug(page, () => page.click('text=Skip to store'));
    await page.waitForFunction(() => [...document.querySelectorAll('.offers .card-icon img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 4000 }).catch(() => {});
    const icons = await page.$$eval('.offers .card-icon', (els) => els.map((e) => ({ img: e.querySelector('img.asset-img')?.getAttribute('src'), mech: e.dataset.mech, svg: !!e.querySelector('.mech svg'), ok: e.querySelector('img')?.naturalWidth > 0 })));
    check(`${kind}: power-up icons use the Rock/Paper/Scissors drawings + a mechanic symbol`, icons.length === 4 && icons.every((i) => /art\/move-[RPS]\.webp/.test(i.img) && i.ok && i.mech && i.svg), JSON.stringify(icons));
    await shot(page, '01-card-icons');
    await page.ctx.close();
  }
}

// ---------------- regressions found in QA ----------------
{
  const page = await open('desktop');
  await start(page);
  await debug(page, () => page.click('text=Skip to store'));
  await page.click('#go-store').catch(() => {});
  await page.waitForTimeout(700);
  await debug(page, () => page.click('text=+1000¢'));
  await clearSfx(page);
  await page.keyboard.press('1'); await page.waitForTimeout(40); await page.keyboard.press('1'); await page.waitForTimeout(40); await page.keyboard.press('1');
  await page.waitForTimeout(200);
  const st = (await sfx(page)).filter((x) => x === 'stamp').length;
  check('QA#1: pressing Buy again on a bought slot does not replay the stamp/fly', st === 1, `stamps=${st}`);
  // QA#3: next run's first store still deals
  await leave(page);
  await debug(page, async () => { for (let i = 0; i < 6; i++) await page.click('text=−1 life'); await page.click('text=LOSS if you throw R'); });
  await page.keyboard.press('r');
  await page.waitForSelector('.screen.over', { timeout: 5000 });
  // QA#4: no sideways overflow left on the game-over screen
  check('QA#4: no horizontal overflow on the game-over screen after the death zoom', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.keyboard.press('Enter'); await page.waitForSelector('#throw-R');
  await force(page, 'WIN'); await page.keyboard.press('r'); await page.waitForTimeout(400);
  await page.click('#go-store'); await page.waitForTimeout(100);
  check('QA#3: a new run\'s first store still deals its cards', (await page.$$('.offers .up-card.deal')).length === 4);
  await page.ctx.close();
}
{
  // QA#4 during the transition itself, and modifier keys don't skip it
  const page = await open('desktop');
  await start(page);
  await debug(page, async () => { for (let i = 0; i < 4; i++) await page.click('text=−1 life'); await page.click('text=LOSS if you throw R'); });
  await page.keyboard.press('r');
  await page.waitForTimeout(1300);
  check('QA#4: no horizontal overflow during the death zoom', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.keyboard.press('Shift'); await page.waitForTimeout(80);
  check('QA nit: a lone Shift press does not skip the death transition', await page.evaluate(() => document.documentElement.classList.contains('dying')));
  await page.waitForSelector('.screen.over', { timeout: 4000 });
  await page.ctx.close();
}
{
  // QA#2: ALL-IN can't be switched on after the throw (during the pump)
  const page = await open('desktop');
  await start(page);
  await debug(page, async () => { await page.selectOption('#dbg-up', 'double-or-nothing'); await page.click('#dbg-add'); await page.click('text=WIN if you throw R'); });
  await page.keyboard.press('r'); await page.waitForTimeout(40); await page.keyboard.press('a');
  await page.waitForTimeout(400);
  const chips = await page.$$eval('.result .trig', (t) => t.map((x) => x.textContent).join('|'));
  check('QA#2: pressing A during the pump does not make that throw ALL-IN', !/ALL-IN/.test(chips), chips);
  await page.ctx.close();
}

// ---------------- reduced motion still works and is instant ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`reduced: ${e.message}`));
  await page.goto(PAGE); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.click('#start');
  check('reduced motion: html.calm set', await page.evaluate(() => document.documentElement.classList.contains('calm')));
  await page.keyboard.press('r'); await page.waitForTimeout(30);
  check('reduced motion: no pump, the round resolves immediately', !(await page.$('.result.pumping')) && !!(await page.$('.result .banner')));
  await page.keyboard.press('r');
  check('reduced motion: no breathing', await page.$eval('.opp-head .portrait .asset-img', (e) => getComputedStyle(e).animationName === 'none' || parseFloat(getComputedStyle(e).animationDuration) < 0.01));
  await ctx.close();
}
{
  // the "Reduce animations" switch in the sound menu does the same, and is remembered
  const page = await open('desktop');
  await page.click('#sound-toggle'); await page.click('#reduce-anim');
  check('"Reduce animations" switch turns effects off', await page.evaluate(() => document.documentElement.classList.contains('calm')));
  await page.reload();
  check('…and is remembered after reload', await page.evaluate(() => document.documentElement.classList.contains('calm')));
  await page.ctx.close();
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);

import type { App } from './app';
import { h, fmt } from './dom';
import { asset } from './assets';
import { buildPanel, upgradeCard } from './components';
import { getUpgrade, owned } from '../core/registry';
import { lifePrice, opponentRerollPrice, storeRerollPrice, upgradePrice, maxLives } from '../core/rules';
import { canBuyLife, curveGap, eligibleUpgrades, rerollableOffers } from '../core/engine';
import { getOpponent } from '../core/opponentModel';
import { CONFIG } from '../core/config';
import { intelFlags } from '../core/rules';

export function storeScreen(app: App): HTMLElement {
  const s = app.state!;
  const st = s.store!;
  const nextGap = curveGap(s, s.stage + 1);
  const afterGap = curveGap(s, s.stage + 2);
  const next = getOpponent(s.nextOpponentId);
  const flagsNow = intelFlags(s);
  const researched = flagsNow.behaviourText && !flagsNow.hidden;

  const offers = st.offers.map((o) => {
    const d = getUpgrade(o.upgradeId);
    const have = owned(s, d.id)?.stacks ?? 0;
    const price = o.sold ? o.price : upgradePrice(s, d.id);
    const afford = s.currency >= price;
    const blocked = !o.sold && !eligibleUpgrades(s).some((e) => e.id === d.id);
    const foot = h('footer', { class: 'card-foot' },
      h('span', { class: 'price num' }, asset('ui.coin', 'coin-glyph'), fmt(price)),
      o.sold ? h('span', { class: 'sold' }, 'Bought')
        : h('button', { class: 'btn primary', id: `buy-${o.slot}`, disabled: !afford || blocked, onclick: () => app.actions.buy(o.slot), 'aria-label': `Buy ${d.name} for ${price} coins` },
          blocked ? 'Unavailable' : afford ? 'Buy' : 'Can’t afford'),
      blocked ? h('span', { class: 'small blocked-note' }, d.id === 'no-thoughts' ? 'Clashes with your intel upgrades.' : 'No Thoughts Just Rock hides all intel.') : null);
    const copyNo = d.maxStacks > 1 && !o.sold ? have + 1 : undefined;
    const card = upgradeCard(d, have + (o.sold ? 0 : 1), foot, o.sold ? 'sold-card' : '', copyNo);
    card.dataset.slot = String(o.slot);
    return card;
  });

  const lifeCheck = canBuyLife(s);
  const lp = lifePrice(s);
  const cap = maxLives(s);
  const rr = storeRerollPrice(s);
  const unsold = rerollableOffers(s);
  const hasFree = !!owned(s, 'just-one-more');
  const orr = opponentRerollPrice(s);

  const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
  const n = unsold === st.offers.length ? `all ${WORDS[unsold] ?? unsold}` : (WORDS[unsold] ?? String(unsold));
  const offerWord = `offer${unsold === 1 ? '' : 's'}`;
  let rerollNote: string;
  if (unsold === 0) rerollNote = 'Every offer is bought, so there is nothing to reroll.';
  else if (hasFree && st.rerollsThisVisit === 0) rerollNote = `Just One More: your first reroll this visit is free. Replaces ${unsold === st.offers.length ? '' : 'the '}${n} unsold ${offerWord}; bought cards stay.`;
  else if (hasFree) rerollNote = `Just One More’s free reroll is already used this visit. Replaces ${unsold === st.offers.length ? '' : 'the '}${n} unsold ${offerWord}; price doubles each time.`;
  else rerollNote = `Replaces ${unsold === st.offers.length ? '' : 'the '}${n} unsold ${offerWord}; bought cards stay. Price doubles each reroll this visit.`;

  const services = h('section', { class: 'services' },
    h('div', { class: 'service life' },
      h('div', { class: 'service-head' }, asset('ui.life', 'service-glyph'), h('h3', null, 'Extra Life')),
      h('p', { class: 'small' }, `Survive one loss. You have ${s.lives}. Each life you buy costs ${CONFIG.store.lifeGrowth}× the last one you bought.`,
        Number.isFinite(cap) ? ' No Safety Net: you can’t buy while you hold one.' : ''),
      h('button', { class: 'btn', id: 'buy-life', disabled: !lifeCheck.ok, onclick: () => app.actions.buyLife() },
        lifeCheck.ok || lifeCheck.reason === 'Not enough coins' ? 'Buy a life' : 'Unavailable', lifeCheck.ok || lifeCheck.reason === 'Not enough coins' ? h('span', { class: 'price-chip num' }, `${fmt(lp)}¢`) : null, h('kbd', null, 'L')),
      !lifeCheck.ok && lifeCheck.reason !== 'Not enough coins' ? h('p', { class: 'small muted' }, lifeCheck.reason) : null),
    h('div', { class: 'service' },
      h('div', { class: 'service-head' }, asset('ui.reroll', 'service-glyph'), h('h3', null, 'Reroll store')),
      h('p', { class: 'small' }, rerollNote),
      h('button', { class: 'btn', id: 'reroll-store', disabled: unsold === 0 || s.currency < rr, onclick: () => app.actions.rerollStore() },
        unsold === 0 ? 'Nothing left to reroll' : `Reroll ${n} unsold ${offerWord}`, unsold > 0 ? h('span', { class: 'price-chip num' }, rr === 0 ? 'FREE' : `${fmt(rr)}¢`) : null, h('kbd', null, 'X'))),
    h('div', { class: 'service next-opp' },
      h('div', { class: 'service-head' }, h('div', { class: 'portrait small' }, asset(next.portrait, 'portrait-glyph')),
        h('div', null, h('div', { class: 'eyebrow' }, 'Next opponent'), h('h3', null, next.name), h('div', { class: 'small opp-title' }, next.title))),
      researched ? h('p', { class: 'small' }, h('b', null, `${next.archetype}: `), next.tell) : null,
      h('button', { class: 'btn', id: 'reroll-opp', disabled: s.currency < orr, onclick: () => app.actions.rerollOpponent() },
        'Swap opponent', h('span', { class: 'price-chip num' }, `${fmt(orr)}¢`), h('kbd', null, 'O')),
      h('p', { class: 'small muted' }, 'Gets pricier every time, all run long.')),
    h('div', { class: `service stretch ${nextGap >= 34 ? 'scary' : ''}` },
      h('div', { class: 'eyebrow' }, 'Next stretch'),
      h('p', { class: 'stretch-num num' }, `${nextGap} rounds`),
      h('p', { class: 'small' }, `vs ${next.name}. Then ${afterGap}.`, nextGap >= 55 ? ' This is fine.' : nextGap >= 21 ? ' Consider insurance.' : ''),
      h('button', { class: 'btn primary', id: 'leave-store', onclick: () => app.actions.leaveStore() }, 'Continue', h('kbd', null, 'Enter'))));

  const interest = s.lastTriggers.filter((t) => t.source === 'compound-interest').map((t) => t.text).join(' ');
  return h('div', { class: 'screen store' },
    h('header', { class: 'store-head' },
      h('div', null, h('div', { class: 'eyebrow' }, `Store #${s.storesVisited} · after round ${s.round}`), h('h1', null, 'Secondhand Store')),
      h('p', { class: 'small muted store-sub' }, 'Pre-owned upgrades for your throwing hand. Gently gestured. Everything lasts until the run ends.', interest ? h('span', { class: 'store-note' }, ` ${interest}`) : null),
      h('div', { class: 'wallet' },
        h('span', { class: 'hud-num num' }, asset('ui.coin', 'hud-glyph'), fmt(s.currency)),
        h('span', { class: 'hud-num num' }, asset('ui.life', 'hud-glyph'), String(s.lives)))),
    // Phones and narrow windows: the page scrolls, so a slim wallet bar stays pinned to the top of the screen.
    h('div', { class: 'wallet-bar', id: 'wallet-bar', role: 'status', 'aria-label': `You have ${s.currency} coins and ${s.lives} Extra Lives` },
      h('span', { class: 'eyebrow' }, 'You have'),
      h('span', { class: 'hud-num num', id: 'wallet-coins' }, asset('ui.coin', 'hud-glyph'), fmt(s.currency)),
      h('span', { class: 'hud-num num', id: 'wallet-lives' }, asset('ui.life', 'hud-glyph'), String(s.lives))),
    h('section', { class: 'offers' }, offers.length ? offers : h('p', null, 'You own everything. The shopkeeper is visibly concerned.')),
    services,
    h('details', { class: 'panel store-build' }, h('summary', null, `Your build (${s.owned.length})`), buildPanel(s, app)));
}

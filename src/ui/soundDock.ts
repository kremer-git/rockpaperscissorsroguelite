// Settings (bottom-left gear): sound, animations, and leaving a run for the title screen (the run is saved).
import type { App } from './app';
import { h } from './dom';
import { applyAudioSettings, playSynth } from './audio';
import { savePrefs } from './prefs';

const GEAR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

export function setMusicOn(app: App, on: boolean): void {
  app.actions.setPrefs((p) => { p.audio.musicOn = on; if (on) p.audio.muted = false; applyAudioSettings(p.audio); });
}

/** Music starts off; this is the opt-in. */
export function musicButton(app: App, id: string): HTMLElement {
  return h('button', { class: 'btn small music-on', id, type: 'button', onclick: () => setMusicOn(app, true) },
    h('span', { 'aria-hidden': 'true' }, '♪ '), 'Turn on epic music?');
}

export function soundDock(app: App): HTMLElement {
  const a = app.prefs.audio;
  const inRun = !!app.state && (app.screen === 'run' || app.screen === 'store') && app.state.status !== 'dead';
  const live = () => applyAudioSettings(app.prefs.audio);
  const slider = (id: string, label: string, key: 'music' | 'sfx') =>
    h('label', { class: 'sd-row', for: id },
      h('span', { class: 'sd-label' }, label),
      h('input', {
        type: 'range', id, min: '0', max: '100', step: '5', value: String(Math.round(a[key] * 100)),
        'aria-label': `${label} volume`,
        oninput: (e: Event) => {
          app.prefs.audio[key] = Number((e.target as HTMLInputElement).value) / 100;
          app.prefs.audio.muted = false;
          live();
          const out = document.getElementById(`${id}-val`); if (out) out.textContent = `${(e.target as HTMLInputElement).value}%`;
        },
        onchange: () => { savePrefs(app.prefs); if (key === 'sfx') playSynth('click'); },
      }),
      h('span', { class: 'sd-val num', id: `${id}-val` }, `${Math.round(a[key] * 100)}%`));
  return h('div', { class: `sound-dock ${app.soundOpen ? 'open' : ''}` },
    app.soundOpen ? h('div', { class: 'sd-panel', id: 'settings-panel', role: 'group', 'aria-label': 'Settings' },
      h('div', { class: 'sd-head eyebrow' }, 'Sound'),
      a.musicOn ? slider('vol-music', 'Music', 'music') : musicButton(app, 'sd-music-on'),
      a.musicOn ? h('label', { class: 'sd-row sd-mute', for: 'music-on' },
        h('input', { type: 'checkbox', id: 'music-on', checked: true, onchange: () => setMusicOn(app, false) }),
        h('span', null, 'Epic music')) : null,
      slider('vol-sfx', 'Effects', 'sfx'),
      h('label', { class: 'sd-row sd-mute', for: 'sound-mute' },
        h('input', { type: 'checkbox', id: 'sound-mute', checked: a.muted, onchange: () => app.actions.setPrefs((p) => { p.audio.muted = !p.audio.muted; applyAudioSettings(p.audio); }) }),
        h('span', null, 'Mute everything')),
      h('div', { class: 'sd-head eyebrow' }, 'Display'),
      h('label', { class: 'sd-row sd-mute', for: 'reduce-anim' },
        h('input', { type: 'checkbox', id: 'reduce-anim', checked: app.prefs.effects === 'reduced', onchange: () => app.actions.setPrefs((p) => { p.effects = p.effects === 'reduced' ? 'full' : 'reduced'; }) }),
        h('span', null, 'Reduce animations')),
      inRun ? h('div', { class: 'sd-exit' },
        h('button', { class: 'btn', id: 'exit-to-title', type: 'button', disabled: app.busy, onclick: () => app.actions.exitToTitle() }, 'Return to title screen'),
        h('p', { class: 'small muted' }, 'Your run is saved. Resume it from the title screen, or start a new one.')) : null) : null,
    h('button', {
      class: 'btn small sd-toggle', id: 'settings-toggle', type: 'button', 'aria-expanded': String(app.soundOpen),
      'aria-label': a.muted ? 'Settings (sound is muted)' : 'Settings',
      onclick: () => { app.soundOpen = !app.soundOpen; app.actions.render(); },
    }, h('span', { class: 'sd-gear', 'aria-hidden': 'true', html: GEAR }), h('span', { class: 'sd-word' }, 'Settings'), a.muted ? h('span', { class: 'sd-muted' }, ' · Muted') : null));
}

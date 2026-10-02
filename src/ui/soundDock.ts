// A small speaker button (bottom-left) that opens music / effects volume and mute.
import type { App } from './app';
import { h } from './dom';
import { applyAudioSettings, playSynth } from './audio';
import { savePrefs } from './prefs';

export function soundDock(app: App): HTMLElement {
  const a = app.prefs.audio;
  const icon = a.muted ? '🔇' : a.music + a.sfx === 0 ? '🔈' : '🔊';
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
    app.soundOpen ? h('div', { class: 'sd-panel', role: 'group', 'aria-label': 'Sound settings' },
      slider('vol-music', 'Music', 'music'),
      slider('vol-sfx', 'Effects', 'sfx'),
      h('label', { class: 'sd-row sd-mute', for: 'sound-mute' },
        h('input', { type: 'checkbox', id: 'sound-mute', checked: a.muted, onchange: () => app.actions.setPrefs((p) => { p.audio.muted = !p.audio.muted; applyAudioSettings(p.audio); }) }),
        h('span', null, 'Mute everything'), h('kbd', null, 'V'))) : null,
    h('button', {
      class: 'btn small sd-toggle', id: 'sound-toggle', type: 'button', 'aria-expanded': String(app.soundOpen),
      'aria-label': a.muted ? 'Sound is muted. Open sound settings' : 'Open sound settings',
      onclick: () => { app.soundOpen = !app.soundOpen; app.actions.render(); },
    }, h('span', { 'aria-hidden': 'true' }, icon), a.muted ? ' Muted' : ''));
}

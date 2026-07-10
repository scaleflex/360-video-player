/**
 * Demo site for @cloudimage/360-video.
 *
 * Hash-routed SPA cloned 1:1 from the @scaleflex/crop demo shell (same chrome,
 * same CSS, same section rhythm):
 *   #/                      landing
 *   #/docs/<slug>           documentation pages
 *   #/examples/<slug>       example playgrounds (one live CI360Video each)
 *
 * All page content is plain TS returning HTML template strings rendered into
 * #content. Only ONE live player exists at a time: navigate() destroys the
 * previous route's player before rendering the next — WebGL contexts are
 * capped (~16) and a 360 player is heavy, so this is load-bearing.
 */

import '../src/define'; // registers <ci-360-video>
import type { CI360VideoElement } from '../src/web-component/ci-360-video';
import type { CI360VideoConfig, StereoLayout } from '../src/core/types';
import { fromFilerobotFile, type FilerobotFileLike } from '../src/filerobot/index';
// Diagnostics for the Format tester — the public `@cloudimage/360-video/metadata`
// subpath (imported here from its source entry, `../src/metadata`). This is the
// exact standalone API an authoring UI would use to inspect a source up front, so
// the tester dogfoods it rather than reaching into the player's internals.
import {
  detectSphericalMetadata,
  parseSphericalMetadataFromMoov,
  classifyStereoAmbiguity,
} from '../src/metadata';

declare global {
  interface Window { Prism?: { highlightAll(): void; highlightElement(el: Element): void } }
}

// ---------------------------------------------------------------------------
// Sources (verified live, CORS-enabled) + links
// ---------------------------------------------------------------------------

const DEMO_SRC = 'https://scaleflex.filerobot.com/quqvv_vr-video-sample_auto/hls/video.m3u8'; // HLS 4K
const COMP_720 = 'https://scaleflex.filerobot.com/plugins/cloudimage/player-360/jfk_720p_400K_compressed.mp4?func=proxy';
const COMP_480 = 'https://scaleflex.filerobot.com/.internal/videos/compressed/ed2e03cf-b96e-5d58-9c7e-284104e50000/480p_400K_compressed.mp4?func=proxy';
const LAKE_HLS = 'https://scaleflex.filerobot.com/yeswy_Enhanced_Test_Lake_Video_w_Music_auto/hls/video.m3u8';
const STEREO_TB = 'https://scaleflex.cloudimg.io/v7/plugins/cloudimage/player-360/congo.mp4?vh=4590b0&func=proxy'; // real top-bottom stereo (Spherical V2 st3d=top-bottom)

const REPO_URL = 'https://github.com/scaleflex/cloudimage-360-video';
const NPM_URL = 'https://www.npmjs.com/package/@cloudimage/360-video';

/**
 * Canonical footer config — the ONLY part that changes between plugin repos.
 * The footer markup, its three columns (Resources / Examples / Support) and all
 * sizing live in `renderFooter()` + the `.demo-footer*` CSS and stay identical
 * everywhere. To port the standard footer into a sibling plugin: copy
 * `renderFooter()` and the `.demo-footer*` CSS block as-is, then fill in this
 * object with that plugin's blurb, repo/npm/docs URLs and example links.
 */
const FOOTER = {
  /** One-sentence product blurb shown under the Scaleflex logo. */
  blurb:
    'Framework-agnostic 360° video player on Three.js. Equirectangular & fisheye, HLS / DASH, stereo and gyroscope — fully accessible, endlessly customizable.',
  repoUrl: REPO_URL,
  npmUrl: NPM_URL,
  docsHref: '#/docs/getting-started',
  /** Examples column — runnable CodeSandbox sandboxes (load the player from
   *  npm/CDN, sources in `codesandbox/*`) + internal sample pages. */
  examples: [
    { label: 'Vanilla Sandbox', href: 'https://codesandbox.io/p/sandbox/github/scaleflex/cloudimage-360-video/tree/main/codesandbox/vanilla' },
    { label: 'React Sandbox', href: 'https://codesandbox.io/p/sandbox/github/scaleflex/cloudimage-360-video/tree/main/codesandbox/react' },
    { label: 'Projections', href: '#/examples/projections' },
  ],
};

/** Switchable sources for the landing live demo. Short, plain labels. */
const HOME_VARIANTS: { label: string; cfg: Partial<CI360VideoConfig> }[] = [
  { label: '4K', cfg: { src: DEMO_SRC } },        // HLS adaptive, up to 4K
  { label: 'Lake', cfg: { src: LAKE_HLS } },      // HLS adaptive (16:9 source)
  { label: 'Stereo', cfg: { src: STEREO_TB } },   // top-bottom — stereo:'auto' detects it
];

// ---------------------------------------------------------------------------
// Icons (Lucide-style, matching @scaleflex/uploader's palette)
// ---------------------------------------------------------------------------

const ICONS = {
  github: '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
  npm: '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M0 256V0h256v256H0zm41-41h59.2v-133H141v133h33.4V41H41v174z"/></svg>',
  external: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>',
  burger: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
};

const THEME_KEY = 'ci-360-video-demo-theme';
type DemoTheme = 'light' | 'dark';

function getStoredTheme(): DemoTheme {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

function syncToggleButton(btn: HTMLButtonElement, theme: DemoTheme): void {
  btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch toolbar to light theme' : 'Switch toolbar to dark theme');
  btn.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
}

// ---------------------------------------------------------------------------
// Utilities — code blocks, tabs, tables, Prism highlight
// ---------------------------------------------------------------------------

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function codeBlock(code: string, lang = 'typescript'): string {
  const id = `code-${Math.random().toString(36).slice(2, 8)}`;
  return `
    <div class="demo-code-wrap">
      <pre><code class="language-${lang}" id="${id}">${escapeHtml(code.trim())}</code></pre>
      <button class="demo-copy-btn" data-copy-target="${id}" aria-label="Copy to clipboard">${ICONS.copy}</button>
    </div>
  `;
}

function tabbedCode(tabs: { label: string; code: string; lang: string }[]): string {
  const groupId = `tabs-${Math.random().toString(36).slice(2, 8)}`;
  return `
    <div class="demo-tabs" data-group="${groupId}">
      <div class="demo-tabs-head">
        ${tabs.map((t, i) => `<button class="demo-tabs-btn${i === 0 ? ' is-active' : ''}" data-tab-index="${i}">${t.label}</button>`).join('')}
      </div>
      <div class="demo-tabs-body">
        ${tabs.map((t, i) => `<div class="demo-tabs-pane${i === 0 ? ' is-active' : ''}" data-tab-index="${i}">${codeBlock(t.code, t.lang)}</div>`).join('')}
      </div>
    </div>
  `;
}

/** Simple reference table. Cells may contain inline HTML (e.g. <code>…</code>). */
function renderTable(headers: string[], rows: string[][]): string {
  return `
    <div class="demo-table-wrap">
      <table class="demo-table">
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function bindCopyButtons(root: HTMLElement): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>('.demo-copy-btn')) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.copyTarget!;
      const code = root.querySelector<HTMLElement>(`#${id}`);
      if (!code) return;
      navigator.clipboard.writeText(code.textContent ?? '').then(() => {
        btn.classList.add('is-copied');
        btn.innerHTML = ICONS.check;
        setTimeout(() => { btn.classList.remove('is-copied'); btn.innerHTML = ICONS.copy; }, 1600);
      });
    });
  }
}

function bindTabs(root: HTMLElement): void {
  for (const group of root.querySelectorAll<HTMLElement>('.demo-tabs')) {
    const heads = group.querySelectorAll<HTMLButtonElement>('.demo-tabs-btn');
    const panes = group.querySelectorAll<HTMLElement>('.demo-tabs-pane');
    heads.forEach((btn) => btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.tabIndex);
      heads.forEach((b) => b.classList.toggle('is-active', Number(b.dataset.tabIndex) === idx));
      panes.forEach((p) => p.classList.toggle('is-active', Number(p.dataset.tabIndex) === idx));
    }));
  }
}

function highlight(root: HTMLElement): void {
  if (typeof window.Prism === 'undefined') { setTimeout(() => highlight(root), 60); return; }
  for (const el of root.querySelectorAll<HTMLElement>('pre code')) window.Prism.highlightElement(el);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

interface Route { path: string; label: string }
interface ExampleGroup { label: string; items: Route[] }

const DOC_ROUTES: Route[] = [
  { path: '/docs/getting-started', label: 'Getting started' },
  { path: '/docs/configuration',   label: 'Configuration' },
  { path: '/docs/api',             label: 'API reference' },
  { path: '/docs/theming',         label: 'Theming' },
  { path: '/docs/types',           label: 'TypeScript types' },
];

const EXAMPLE_GROUPS: ExampleGroup[] = [
  { label: 'Getting started', items: [
    { path: '/examples/basic', label: 'Basic usage' },
    { path: '/examples/react', label: 'React wrapper' },
  ]},
  { label: 'Projection & source', items: [
    { path: '/examples/projections',   label: 'Projections' },
    { path: '/examples/stereo',        label: 'Stereo 3D' },
    { path: '/examples/format-tester', label: 'Format tester' },
    { path: '/examples/initial-view',  label: 'Initial view' },
  ]},
  { label: 'Interaction', items: [
    { path: '/examples/controls-and-gyro', label: 'Controls & gyroscope' },
  ]},
  { label: 'Integration', items: [
    { path: '/examples/events',                label: 'Event handling' },
    { path: '/examples/quality-and-streaming', label: 'Quality & streaming' },
  ]},
  { label: 'Appearance & DAM', items: [
    { path: '/examples/theming',   label: 'Theming tokens' },
    { path: '/examples/filerobot', label: 'Filerobot source' },
  ]},
];

// ---------------------------------------------------------------------------
// Layout shell: header + mobile nav + sidebar + footer
// ---------------------------------------------------------------------------

function renderHeader(path: string): string {
  const isHome = path === '/';
  const isDocs = path.startsWith('/docs');
  const isEx   = path.startsWith('/examples');
  return `
    <header class="demo-topbar" role="banner">
      <div class="demo-topbar-inner">
        <button class="demo-topbar-burger" id="demo-burger" aria-label="Toggle sidebar">${ICONS.burger}</button>
        <a href="#/" class="demo-topbar-logo" aria-label="Scaleflex home">
          <img src="https://assets.scaleflex.com/Marketing/Logos/Scaleflex%20Logos/Logo%20Horizontal/scaleflex%20logo%20without%20tagline%20white%20text%20%28horizontal%29%20.png?vh=85bc00" alt="Scaleflex" height="28" />
        </a>
        <nav class="demo-topbar-nav" aria-label="Primary">
          <a href="#/"                     class="demo-topbar-nav-link${isHome ? ' is-active' : ''}">Home</a>
          <a href="#/docs/getting-started" class="demo-topbar-nav-link${isDocs ? ' is-active' : ''}">Documentation</a>
          <a href="#/examples/basic"       class="demo-topbar-nav-link${isEx ? ' is-active' : ''}">Examples</a>
        </nav>
        <div class="demo-topbar-actions">
          <a class="demo-topbar-chip" href="${REPO_URL}" target="_blank" rel="noopener" aria-label="GitHub repository">${ICONS.github}<span>GitHub</span></a>
          <a class="demo-topbar-chip demo-topbar-chip--icon" href="${NPM_URL}" target="_blank" rel="noopener" aria-label="npm package">${ICONS.npm}</a>
        </div>
      </div>
    </header>
  `;
}

function renderMobileNav(path: string): string {
  const isHome = path === '/';
  const isDocs = path.startsWith('/docs');
  const isEx   = path.startsWith('/examples');
  let secondary = '';
  if (isDocs) {
    secondary = `
      <div class="demo-mobile-nav-section">
        <div class="demo-mobile-nav-section-label">Documentation</div>
        ${DOC_ROUTES.map((r) => `<a href="#${r.path}" class="demo-mobile-nav-link demo-mobile-nav-link--sub${path === r.path ? ' is-active' : ''}">${r.label}</a>`).join('')}
      </div>`;
  } else if (isEx) {
    secondary = EXAMPLE_GROUPS.map((g) => `
      <div class="demo-mobile-nav-section">
        <div class="demo-mobile-nav-section-label">${g.label}</div>
        ${g.items.map((r) => `<a href="#${r.path}" class="demo-mobile-nav-link demo-mobile-nav-link--sub${path === r.path ? ' is-active' : ''}">${r.label}</a>`).join('')}
      </div>`).join('');
  }
  return `
    <nav class="demo-mobile-nav" id="demo-mobile-nav" aria-label="Mobile">
      <div class="demo-mobile-nav-section">
        <a href="#/"                     class="demo-mobile-nav-link${isHome ? ' is-active' : ''}">Home</a>
        <a href="#/docs/getting-started" class="demo-mobile-nav-link${isDocs ? ' is-active' : ''}">Documentation</a>
        <a href="#/examples/basic"       class="demo-mobile-nav-link${isEx ? ' is-active' : ''}">Examples</a>
      </div>
      ${secondary}
    </nav>
  `;
}

function renderSidebar(path: string): string {
  if (path.startsWith('/docs')) {
    return `
      <aside class="demo-sidebar" id="demo-sidebar" aria-label="Documentation">
        <div class="demo-sidebar-inner">
          <div class="demo-sidebar-title">Documentation</div>
          <nav class="demo-sidebar-nav">
            ${DOC_ROUTES.map((r) => `<a href="#${r.path}" class="demo-sidebar-link${path === r.path ? ' is-active' : ''}">${r.label}</a>`).join('')}
          </nav>
        </div>
      </aside>`;
  }
  if (path.startsWith('/examples')) {
    return `
      <aside class="demo-sidebar" id="demo-sidebar" aria-label="Examples">
        <div class="demo-sidebar-inner">
          ${EXAMPLE_GROUPS.map((g) => `
            <div class="demo-sidebar-group">
              <div class="demo-sidebar-group-label">${g.label}</div>
              <nav class="demo-sidebar-nav">
                ${g.items.map((r) => `<a href="#${r.path}" class="demo-sidebar-link${path === r.path ? ' is-active' : ''}">${r.label}</a>`).join('')}
              </nav>
            </div>`).join('')}
        </div>
      </aside>`;
  }
  return '';
}

function renderFooter(): string {
  return `
    <footer class="demo-footer" role="contentinfo">
      <div class="demo-footer-main">
        <div class="demo-footer-brand">
          <a href="https://www.scaleflex.com" target="_blank" rel="noopener">
            <img src="https://assets.scaleflex.com/Marketing/Logos/Scaleflex%20Logos/Logo%20Horizontal/scaleflex%20logo%20without%20tagline%20white%20text%20%28horizontal%29%20.png?vh=85bc00" alt="Scaleflex" height="26" />
          </a>
          <p>${FOOTER.blurb}</p>
        </div>
        <div class="demo-footer-links">
          <div class="demo-footer-col">
            <h4>Resources</h4>
            <a href="${FOOTER.repoUrl}" target="_blank" rel="noopener">GitHub</a>
            <a href="${FOOTER.npmUrl}" target="_blank" rel="noopener">npm</a>
            <a href="${FOOTER.docsHref}">Documentation</a>
          </div>
          <div class="demo-footer-col">
            <h4>Examples</h4>
            ${FOOTER.examples.map((e) => `<a href="${e.href}"${e.href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${e.label}</a>`).join('\n            ')}
          </div>
          <div class="demo-footer-col">
            <h4>Support</h4>
            <a href="${FOOTER.repoUrl}/issues" target="_blank" rel="noopener">Report an Issue</a>
            <a href="https://www.scaleflex.com/en/contact" target="_blank" rel="noopener">Contact Us</a>
          </div>
        </div>
      </div>
      <div class="demo-footer-bottom">
        <span>MIT License — Made with care by the <a href="https://www.scaleflex.com" target="_blank" rel="noopener">Scaleflex</a> team — Powered by <a href="https://www.cloudimage.io" target="_blank" rel="noopener">Cloudimage.io</a></span>
      </div>
    </footer>
  `;
}

// ---------------------------------------------------------------------------
// Shared player lifecycle. Exactly ONE live CI360Video exists at a time;
// constructing on a container auto-destroys any prior instance there, and
// navigate() destroys the survivor before each route change.
// ---------------------------------------------------------------------------

let activePlayer: CI360VideoElement | null = null;

function mountPlayer(host: HTMLElement, cfg: Partial<CI360VideoConfig>): CI360VideoElement {
  // Replace any previous player (removing the element destroys its engine).
  activePlayer?.remove();
  const el = document.createElement('ci-360-video') as CI360VideoElement;
  el.style.cssText = 'display:block;width:100%;height:100%';
  el.config = cfg;
  host.appendChild(el);
  activePlayer = el;
  return el;
}

function appendLog(logEl: HTMLElement, msg: string): void {
  const line = document.createElement('div');
  line.textContent = msg;
  logEl.prepend(line);
  while (logEl.childElementCount > 12) logEl.lastElementChild?.remove();
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

function renderHome(): string {
  const svg = (inner: string): string =>
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const featureCards = [
    { icon: svg('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'), title: 'Multiple projections', body: 'Equirectangular (2:1), single fisheye and dual-fisheye — pluggable and lazy-loaded.' },
    { icon: svg('<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>'), title: 'Custom controls + gyro', body: 'Drag to look, wheel / pinch to zoom (FOV), never dollies off-centre. DeviceOrientation on mobile.' },
    { icon: svg('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'), title: 'HLS / DASH + quality', body: 'Adaptive streaming, or separate file per resolution — toolbar quality switcher for both.' },
    { icon: svg('<circle cx="13.5" cy="6.5" r=".7"/><circle cx="17.5" cy="10.5" r=".7"/><circle cx="8.5" cy="7.5" r=".7"/><circle cx="6.5" cy="12.5" r=".7"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.66h1.99c3.05 0 5.56-2.5 5.56-5.56C21.97 6.01 17.46 2 12 2z"/>'), title: 'Fully themeable', body: '--ci-360-video-* CSS custom properties + light / dark toolbar — match any brand.' },
    { icon: svg('<circle cx="12" cy="12" r="1.2"/><ellipse cx="12" cy="12" rx="10" ry="4.5"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(120 12 12)"/>'), title: 'React wrapper', body: 'SSR-safe <CI360VideoViewer> + useCI360Video() hook via @cloudimage/360-video/react.' },
    { icon: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01"/><path d="M10 10h.01"/><path d="M14 10h.01"/><path d="M18 10h.01"/><path d="M6 14h.01"/><path d="M18 14h.01"/><path d="M10 14h4"/>'), title: 'Accessible & light', body: 'WCAG ARIA roles, full keyboard control, Three.js under the hood; adapters lazy-loaded.' },
  ];

  const esmSnippet = `import { CI360Video } from '@cloudimage/360-video';

new CI360Video('#player', {
  src: '/your-360-video.mp4',   // equirectangular 2:1 MP4, .m3u8 or .mpd
  autoplay: true,
  muted: true,
  loop: true,
});`;
  const reactSnippet = `import { CI360VideoViewer } from '@cloudimage/360-video/react';

export function Panorama() {
  return (
    <CI360VideoViewer src="/your-360-video.mp4" autoplay muted loop
      style={{ width: '100%', aspectRatio: '16 / 9' }} />
  );
}`;

  // ── "Also by Scaleflex" plugins catalog — self-contained, namespaced (sfx-*),
  //    copied 1:1 from the marketing design. Static markup, no runtime script.
  const IC = {
    grid:    '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/></svg>',
    upload:  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 16V6m0 0l-4 4m4-4l4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    layers:  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 13l9 5 9-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    cube:    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 3v9m0 0l8-4.5M12 12l-8-4.5" stroke="currentColor" stroke-width="1.4"/></svg>',
    rotate:  '<svg viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M18 3v3.5h-3.5M6 21v-3.5h3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    hotspot: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="11" r="2.4" stroke="currentColor" stroke-width="1.6"/><path d="M9 8.6V6m0 7.4V16m-2.4-4.6H4m7.4 0H14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    video:   '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg>',
    split:   '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M12 5v14" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10l-2 2 2 2M15.5 10l2 2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    carousel:'<svg viewBox="0 0 24 24" fill="none"><rect x="7" y="6" width="10" height="12" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M4 9v6M20 9v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    zoom:    '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4 4M11 8v6M8 11h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    crop:    '<svg viewBox="0 0 24 24" fill="none"><path d="M6 2v14a2 2 0 0 0 2 2h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 22V8a2 2 0 0 0-2-2H2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    player:  '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg>',
  };
  const sfxScaleflex = [
    { name: 'Asset Picker',      icon: IC.grid,   href: 'https://scaleflex.github.io/asset-picker/' },
    { name: 'Uploader',          icon: IC.upload, href: 'https://scaleflex.github.io/uploader/' },
    { name: 'Experience Picker', icon: IC.layers, href: 'https://spotlight.scaleflex.com/docs/experience-picker' },
  ];
  const sfxCloudimage = [
    { name: '3D Viewer',          icon: IC.cube,     href: 'https://scaleflex.github.io/cloudimage-3d-view/' },
    { name: '360° Image View',     icon: IC.rotate,   href: 'https://scaleflex.github.io/cloudimage-360-view/' },
    { name: '360° Video',         icon: IC.player,   href: 'https://scaleflex.github.io/cloudimage-360-video/' },
    { name: 'Image Hotspots',     icon: IC.hotspot,  href: 'https://scaleflex.github.io/cloudimage-hotspot/' },
    { name: 'Video Hotspots',     icon: IC.video,    href: 'https://scaleflex.github.io/cloudimage-video-hotspot/' },
    { name: 'Image Before/After', icon: IC.split,    href: 'https://scaleflex.github.io/cloudimage-before-after/' },
    { name: 'Image Carousel',     icon: IC.carousel, href: 'https://scaleflex.github.io/cloudimage-carousel/' },
    { name: 'Image Crop',         icon: IC.crop,     href: 'https://scaleflex.github.io/cloudimage-image-crop/' },
    { name: 'Spotlight',          icon: IC.zoom,     href: 'https://scaleflex.github.io/cloudimage-spotlight/' },
  ];
  const sfxArrow = '<svg class="sfx-plugin-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const sfxItem = (p: { name: string; icon: string; href: string }): string =>
    `<a class="sfx-plugin-item" href="${p.href}" target="_blank" rel="noopener"><span class="sfx-plugin-icon">${p.icon}</span><span class="sfx-plugin-name">${p.name}</span>${sfxArrow}</a>`;

  return `
    <span id="top"></span>
    <section class="demo-hero">
      <div class="demo-hero-inner">
        <div class="demo-hero-badge"><span class="demo-hero-badge-dot"></span>@cloudimage/360-video</div>
        <h1 class="demo-hero-title"><span class="demo-gradient-text">360° Video</span></h1>
        <p class="demo-hero-sub">Framework-agnostic 360° (equirectangular) video player on Three.js — drag to look around, zoom, gyroscope, HLS/DASH and quality switching, in a single <code>new CI360Video()</code> call.</p>
        <div class="demo-hero-actions">
          <a class="demo-btn demo-btn--primary" href="#/examples/basic">Get started ${ICONS.arrow}</a>
          <a class="demo-btn demo-btn--glass" href="${REPO_URL}" target="_blank" rel="noopener">${ICONS.github} GitHub</a>
          <a class="demo-btn demo-btn--glass" href="${NPM_URL}" target="_blank" rel="noopener">${ICONS.npm} npm</a>
        </div>
        <div class="demo-hero-meta"><span>Three.js</span><span>HLS / DASH</span><span>React wrapper</span><span>TypeScript</span><span>WCAG 2.1 AA</span></div>
      </div>
    </section>

    <section class="demo-live" id="live-demo">
      <div class="demo-section-inner">
        <div class="demo-section-label">Live demo</div>
        <h2>Try it right here</h2>
        <p class="demo-lead">A fully interactive 360° player embedded directly in this page — drag to look around, scroll to zoom, use the toolbar for quality, speed and fullscreen.</p>
        <div class="demo-crop-controls">
          <span class="demo-home-variant-label">Video:</span>
          ${HOME_VARIANTS.map((v, i) => `<button type="button" class="demo-home-variant" data-variant="${i}" aria-pressed="${i === 0}">${v.label}</button>`).join('')}
          <button type="button" class="demo-variant-toggle" style="margin-left:auto" aria-pressed="false">Auto-rotate: off</button>
          <button type="button" class="demo-grid-toggle" aria-pressed="false">Invert drag: off</button>
          <button type="button" class="demo-bleed-toggle" aria-pressed="false">Reset view</button>
          <button type="button" class="demo-theme-toggle" aria-label="Toggle toolbar theme" aria-pressed="false">${ICONS.moon}</button>
        </div>
        <div class="demo-card demo-card--lg demo-crop-wrap">
          <div id="home-viewer" class="ci360-embed"></div>
        </div>
      </div>
    </section>

    <section class="demo-quick-start" id="quick-start">
      <div class="demo-section-inner">
        <div class="demo-section-label">Quick start</div>
        <h2 class="demo-quick-start-title">Up and running in under a minute</h2>
        <p class="demo-quick-start-sub">Install from npm, point it at a 360° video, and call&nbsp;<code>new CI360Video()</code><br />with a container and a source.</p>
        <div class="demo-quick-start-code">
          ${tabbedCode([
            { label: 'JavaScript', code: esmSnippet, lang: 'typescript' },
            { label: 'React', code: reactSnippet, lang: 'tsx' },
          ])}
        </div>
        <div class="demo-hero-actions" style="justify-content:center;margin-top:24px">
          <a class="demo-btn demo-btn--primary" href="#/docs/getting-started">Read the docs ${ICONS.arrow}</a>
          <a class="demo-btn demo-btn--glass" href="#/examples/basic">Browse examples</a>
        </div>
      </div>
    </section>

    <section class="demo-features">
      <div class="demo-section-inner">
        <div class="demo-section-label">Features</div>
        <h2>Everything you need for 360° video</h2>
        <div class="demo-feature-grid">
          ${featureCards.map((f) => `<div class="demo-feature-card"><div class="demo-feature-icon">${f.icon}</div><h3>${f.title}</h3><p>${f.body}</p></div>`).join('')}
        </div>
      </div>
    </section>

    <section class="sfx-also">
      <div class="sfx-also-head">
        <div class="sfx-also-label">Also by Scaleflex</div>
        <h2>Plugins for the modern web</h2>
        <p>A family of framework-agnostic JavaScript plugins — for digital asset management and interactive media experiences.</p>
      </div>
      <div class="sfx-also-cols">
        <div class="sfx-col sfx-col--sf">
          <div class="sfx-col-head">
            <span class="sfx-col-badge"></span>
            <span class="sfx-col-title">Scaleflex</span>
            <span class="sfx-col-ns">@scaleflex/*</span>
            <span class="sfx-col-count">${sfxScaleflex.length}</span>
          </div>
          <div class="sfx-col-sub">Digital asset management</div>
          <div>${sfxScaleflex.map(sfxItem).join('')}</div>
        </div>
        <div class="sfx-col sfx-col--ci">
          <div class="sfx-col-head">
            <span class="sfx-col-badge"></span>
            <span class="sfx-col-title">Cloudimage</span>
            <span class="sfx-col-ns">js-cloudimage-*</span>
            <span class="sfx-col-count">${sfxCloudimage.length}</span>
          </div>
          <div class="sfx-col-sub">Interactive media experiences</div>
          <div class="sfx-list-2col">${sfxCloudimage.map(sfxItem).join('')}</div>
        </div>
      </div>
    </section>
  `;
}

function hydrateHome(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#home-viewer');
  // Live-demo state. Variant switching re-creates the single player; the
  // toggle state is carried over so it survives the rebuild.
  const state = { variant: 0, autoRotate: false, invertDrag: false, theme: getStoredTheme() };
  const build = (): void => {
    if (!host) return;
    mountPlayer(host, {
      ...HOME_VARIANTS[state.variant].cfg,
      autoplay: true,
      muted: true,
      loop: true,
      autoRotate: state.autoRotate,
      autoRotateIdleDelay: 0, // preview drifts immediately when auto-rotate is toggled on
      invertDrag: state.invertDrag,
      theme: state.theme,
    });
  };
  build();

  // Video variant selector.
  root.querySelectorAll<HTMLButtonElement>('.demo-home-variant').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.variant = Number(btn.dataset.variant);
      root.querySelectorAll<HTMLButtonElement>('.demo-home-variant').forEach((b) =>
        b.setAttribute('aria-pressed', String(b === btn)));
      build();
    });
  });

  const autoRotateBtn = root.querySelector<HTMLButtonElement>('.demo-variant-toggle');
  autoRotateBtn?.addEventListener('click', () => {
    state.autoRotate = !state.autoRotate;
    activePlayer?.update({ autoRotate: state.autoRotate });
    autoRotateBtn.textContent = `Auto-rotate: ${state.autoRotate ? 'on' : 'off'}`;
    autoRotateBtn.setAttribute('aria-pressed', String(state.autoRotate));
  });

  const invertBtn = root.querySelector<HTMLButtonElement>('.demo-grid-toggle');
  invertBtn?.addEventListener('click', () => {
    state.invertDrag = !state.invertDrag;
    activePlayer?.update({ invertDrag: state.invertDrag });
    invertBtn.textContent = `Invert drag: ${state.invertDrag ? 'on' : 'off'}`;
    invertBtn.setAttribute('aria-pressed', String(state.invertDrag));
  });

  root.querySelector<HTMLButtonElement>('.demo-bleed-toggle')?.addEventListener('click', () => {
    activePlayer?.setView({ lon: 0, lat: 0, fov: 75 }, true);
  });

  const themeBtn = root.querySelector<HTMLButtonElement>('.demo-theme-toggle');
  if (themeBtn) {
    syncToggleButton(themeBtn, state.theme);
    themeBtn.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, state.theme);
      activePlayer?.update({ theme: state.theme });
      syncToggleButton(themeBtn, state.theme);
    });
  }

}

// ---------------------------------------------------------------------------
// Doc pages (static — no live player)
// ---------------------------------------------------------------------------

function docPage(title: string, lead: string, body: string): string {
  return `<article class="demo-doc"><header class="demo-doc-header"><h1>${title}</h1><p class="demo-doc-lead">${lead}</p></header>${body}</article>`;
}

function renderDocGettingStarted(): string {
  return docPage('Getting started', 'Install the package, point the player at a 360° video, and you are done.', `
    <h2>Install</h2>
    <p>Three.js is a peer dependency — install it alongside the player. <code>hls.js</code> / <code>dashjs</code> are optional, only needed for streaming.</p>
    ${tabbedCode([
      { label: 'npm',  code: 'npm install @cloudimage/360-video three', lang: 'bash' },
      { label: 'pnpm', code: 'pnpm add @cloudimage/360-video three',    lang: 'bash' },
      { label: 'yarn', code: 'yarn add @cloudimage/360-video three',    lang: 'bash' },
    ])}

    <h2>Use it</h2>
    ${tabbedCode([
      { label: 'JavaScript', code: `import { CI360Video } from '@cloudimage/360-video';

const player = new CI360Video('#player', {
  src: '/your-360-video.mp4',
  autoplay: true,
  muted: true,
  loop: true,
});`, lang: 'typescript' },
      { label: 'React', code: `import { CI360VideoViewer } from '@cloudimage/360-video/react';

export function Panorama() {
  return <CI360VideoViewer src="/your-360-video.mp4" autoplay muted loop
    style={{ width: '100%', aspectRatio: '16 / 9' }} />;
}`, lang: 'tsx' },
      { label: 'CDN', code: `<script src="https://unpkg.com/three"></script>
<script src="https://unpkg.com/@cloudimage/360-video"></script>

<div data-ci-360-video-src="/your-360-video.mp4"
     data-ci-360-video-autoplay="true"
     data-ci-360-video-muted="true"
     style="width:100%;aspect-ratio:16/9"></div>

<script>CI360Video.autoInit();</script>`, lang: 'markup' },
    ])}

    <h2>Peer dependencies</h2>
    ${renderTable(['Package', 'Required', 'Needed for'], [
      ['<code>three</code>', 'Yes', 'WebGL sphere rendering (the engine)'],
      ['<code>hls.js</code>', 'Optional', 'HLS (<code>.m3u8</code>) streaming on non-Safari'],
      ['<code>dashjs</code>', 'Optional', 'DASH (<code>.mpd</code>) streaming'],
      ['<code>react</code> / <code>react-dom</code>', 'Optional', 'the <code>/react</code> wrapper'],
    ])}

    <h2>Source requirements</h2>
    <p>The player expects an <strong>equirectangular 2:1</strong> source (<code>width = 2 × height</code>) — an <code>.mp4</code>/<code>.webm</code>, an HLS <code>.m3u8</code>, or a DASH <code>.mpd</code>. The video must be served with permissive CORS so its frames can be uploaded to a WebGL texture (the player sets <code>crossOrigin: 'anonymous'</code> by default).</p>
  `);
}

function renderDocConfiguration(): string {
  const opt = (n: string) => `<code>${n}</code>`;
  return docPage('Configuration', 'Every option, its type, default and effect. Pass options to the constructor, or as <code>data-*</code> attributes for <code>autoInit()</code>.', `
    <h2>Two ways to configure</h2>
    ${tabbedCode([
      { label: 'JavaScript', code: `new CI360Video('#player', {
  src: '/pano.mp4',
  projection: 'equirectangular',
  autoRotate: true,
  theme: 'dark',
});`, lang: 'typescript' },
      { label: 'Data attributes', code: `<div
  data-ci-360-video-src="/pano.mp4"
  data-ci-360-video-projection="equirectangular"
  data-ci-360-video-auto-rotate="true"
  data-ci-360-video-theme="dark"
></div>
<script>CI360Video.autoInit();</script>`, lang: 'markup' },
    ])}

    <h2>Source &amp; projection</h2>
    ${renderTable(['Option', 'Type', 'Default', 'Description'], [
      [opt('src'), '<code>string</code>', '—', '<strong>Required.</strong> MP4 / WebM / <code>.m3u8</code> / <code>.mpd</code> URL. Ignored when <code>sources</code> is set.'],
      [opt('sources'), '<code>VideoSource[]</code>', '—', 'Pre-encoded variants (one file per resolution); the quality menu switches between them.'],
      [opt('projection'), `<code>'equirectangular' | 'fisheye' | 'dual-fisheye'</code>`, `<code>'equirectangular'</code>`, 'Source projection format.'],
      [opt('stereo'), `<code>'auto' | 'mono' | 'top-bottom' | 'side-by-side'</code>`, `<code>'auto'</code>`, '<code>auto</code> reads the MP4 Spherical metadata (<code>st3d</code> / <code>GSpherical</code>); else force a layout. The left eye is rendered in mono (non-VR) view.'],
      [opt('stereoMenu'), `<code>boolean | 'auto'</code>`, `<code>'auto'</code>`, 'Toolbar format picker (Mono / Top-Bottom / Side-by-Side) so a viewer can switch layout at runtime — e.g. to fix a stereo source with no metadata. <code>auto</code> shows it only when relevant (an ambiguous frame with no metadata, or a stereo layout already active); <code>true</code> always; <code>false</code> never.'],
      [opt('lensFovDeg'), '<code>number</code>', '<code>180</code>', 'Per-lens field of view for fisheye projections.'],
      [opt('playerType'), `<code>'auto' | 'html5' | 'hls' | 'dash'</code>`, `<code>'auto'</code>`, 'Adapter selector; <code>auto</code> detects from the URL extension.'],
      [opt('crossOrigin'), '<code>string</code>', `<code>'anonymous'</code>`, '<code>&lt;video crossorigin&gt;</code> — keeps the WebGL texture untainted.'],
      [opt('poster'), '<code>string</code>', '—', 'Poster image shown before load.'],
    ])}

    <h2>Playback</h2>
    ${renderTable(['Option', 'Type', 'Default', 'Description'], [
      [opt('autoplay'), '<code>boolean</code>', '<code>false</code>', 'Start playing on init (requires <code>muted</code> in most browsers).'],
      [opt('loop'), '<code>boolean</code>', '<code>false</code>', 'Loop at end.'],
      [opt('muted'), '<code>boolean</code>', '<code>false</code>', 'Start muted.'],
    ])}

    <h2>Initial view &amp; limits (degrees)</h2>
    ${renderTable(['Option', 'Type', 'Default', 'Description'], [
      [opt('initialLon'), '<code>number</code>', '<code>0</code>', 'Initial longitude.'],
      [opt('initialLat'), '<code>number</code>', '<code>0</code>', 'Initial latitude (+ up / − down).'],
      [opt('fov'), '<code>number</code>', '<code>75</code>', 'Initial vertical field of view.'],
      [opt('fovMin') + ' / ' + opt('fovMax'), '<code>number</code>', '<code>30</code> / <code>100</code>', 'Zoom bounds.'],
      [opt('latMin') + ' / ' + opt('latMax'), '<code>number</code>', '<code>-85</code> / <code>85</code>', 'Pitch clamp (avoids gimbal flip).'],
    ])}

    <h2>Controls</h2>
    ${renderTable(['Option', 'Type', 'Default', 'Description'], [
      [opt('controls'), '<code>boolean</code>', '<code>true</code>', 'Show the toolbar.'],
      [opt('dragToRotate'), '<code>boolean</code>', '<code>true</code>', 'Drag to rotate the view.'],
      [opt('invertDrag'), '<code>boolean</code>', '<code>false</code>', 'Invert drag direction.'],
      [opt('rotateSpeed'), '<code>number</code>', '<code>1.0</code>', 'Drag sensitivity (1 = pixel-perfect).'],
      [opt('scrollToZoom'), '<code>boolean</code>', '<code>true</code>', 'Wheel / pinch changes FOV.'],
      [opt('gyroscope'), '<code>boolean</code>', '<code>false</code>', 'DeviceOrientation control (iOS 13+ needs a gesture).'],
      [opt('damping') + ' / ' + opt('dampingFactor'), '<code>boolean</code> / <code>number</code>', '<code>true</code> / <code>0.1</code>', 'Inertial smoothing.'],
      [opt('autoRotate') + ' / ' + opt('autoRotateSpeed'), '<code>boolean</code> / <code>number</code>', '<code>false</code> / <code>10</code>', 'Idle drift; °/s (+ = look right).'],
    ])}

    <h2>UI</h2>
    ${renderTable(['Option', 'Type', 'Default', 'Description'], [
      [opt('theme'), `<code>'light' | 'dark'</code>`, `<code>'dark'</code>`, 'Toolbar colour.'],
      [opt('fullscreenButton'), '<code>boolean</code>', '<code>true</code>', 'Show fullscreen button.'],
      [opt('speedButton'), '<code>boolean</code>', '<code>true</code>', 'Show speed pill (0.5×–2×).'],
      [opt('qualityButton'), '<code>boolean</code>', '<code>true</code>', 'Show quality pill (auto-hidden when no levels).'],
    ])}

    <h2>Performance &amp; accessibility</h2>
    ${renderTable(['Option', 'Type', 'Default', 'Description'], [
      [opt('sphereSegments'), '<code>number</code>', '<code>64</code>', 'Geometry resolution (higher = smoother poles, more triangles).'],
      [opt('pixelRatio'), '<code>number</code>', '<code>2</code>', 'Max device-pixel-ratio cap.'],
      [opt('antialias'), '<code>boolean</code>', '<code>true</code>', 'WebGL antialiasing.'],
      [opt('autoLoad'), '<code>boolean</code>', '<code>true</code>', 'When <code>false</code>, show a click-to-load overlay before booting WebGL.'],
      [opt('alt'), '<code>string</code>', `<code>'360° video'</code>`, 'ARIA label.'],
    ])}

    <h2>Callbacks</h2>
    <p>Every callback has a matching EventEmitter event (see <a href="#/docs/api">API reference</a>).</p>
    ${renderTable(['Callback', 'Signature'], [
      [opt('onReady'), '<code>() => void</code>'],
      [opt('onPlay') + ' / ' + opt('onPause') + ' / ' + opt('onEnded'), '<code>() => void</code>'],
      [opt('onTimeUpdate'), '<code>(t: number) => void</code>'],
      [opt('onDurationChange'), '<code>(d: number) => void</code>'],
      [opt('onViewChange'), '<code>(v: { lon; lat; fov }) => void</code>'],
      [opt('onFullscreenChange'), '<code>(isFs: boolean) => void</code>'],
      [opt('onError'), '<code>(err: unknown) => void</code>'],
    ])}
  `);
}

function renderDocApi(): string {
  const m = (n: string) => `<code>${n}</code>`;
  return docPage('API reference', 'Instance methods, events, and the imperative React surface.', `
    <h2>Methods</h2>
    ${renderTable(['Method', 'Returns', 'Purpose'], [
      [m('play()'), '<code>Promise&lt;void&gt;</code>', 'Start / resume playback.'],
      [m('pause()'), '<code>void</code>', 'Pause.'],
      [m('seek(time)'), '<code>void</code>', 'Jump to a time (seconds).'],
      [m('isPaused()') + ' · ' + m('getCurrentTime()') + ' · ' + m('getDuration()'), '<code>boolean</code> / <code>number</code>', 'Playback state queries.'],
      [m('setMuted(b)') + ' · ' + m('isMuted()') + ' · ' + m('setVolume(v)') + ' · ' + m('getVolume()'), '—', 'Audio control (volume 0–1).'],
      [m('getView()'), '<code>{ lon, lat, fov }</code>', 'Current view (degrees).'],
      [m('setView(view, animate?)'), '<code>void</code>', 'Move the view; <code>animate</code> defaults to true.'],
      [m('latLonToScreen(lon, lat)'), '<code>{ x, y, visible }</code>', 'Project a sphere point to container pixels (hotspot foundation).'],
      [m('enterFullscreen()') + ' · ' + m('exitFullscreen()') + ' · ' + m('isFullscreen()'), '—', 'Fullscreen control.'],
      [m('update(partialConfig)'), '<code>void</code>', 'Live-update theme, controls, view limits, etc.'],
      [m('destroy()'), '<code>void</code>', 'Tear down WebGL, DOM and listeners.'],
      [m('getThreeObjects()'), '<code>{ scene, camera, renderer, mesh } | null</code>', 'Escape hatch to the Three.js objects.'],
      [m('CI360Video.autoInit(root?)'), '<code>CI360Video[]</code>', 'Static — attach to every <code>[data-ci-360-video-src]</code> element.'],
    ])}

    <h2>Events</h2>
    <p>Subscribe with <code>player.on(name, handler)</code> (and <code>player.off(...)</code>). Each mirrors a config callback.</p>
    ${renderTable(['Event', 'Payload'], [
      ['<code>ready</code>', '—'],
      ['<code>play</code> · <code>pause</code> · <code>ended</code>', '—'],
      ['<code>timeupdate</code>', '<code>number</code> (seconds)'],
      ['<code>durationchange</code>', '<code>number</code> (seconds)'],
      ['<code>view-change</code>', '<code>{ lon, lat, fov }</code>'],
      ['<code>fullscreen-change</code>', '<code>boolean</code>'],
      ['<code>error</code>', '<code>unknown</code>'],
      ['<code>qualitylevelsupdated</code>', '<code>QualityLevel[]</code>'],
      ['<code>qualitychange</code>', '<code>QualityId</code> (<code>number</code> or <code>auto</code>)'],
    ])}

    <h2>Vanilla JS</h2>
    ${codeBlock(`const player = new CI360Video('#player', { src: '/pano.mp4' });

player.on('ready', () => console.log('view', player.getView()));
player.on('view-change', (v) => console.log(v.lon, v.lat, v.fov));

player.setView({ lon: 90, fov: 60 }, true); // animate`, 'typescript')}

    <h2>React</h2>
    ${codeBlock(`import { useRef } from 'react';
import { CI360VideoViewer, type CI360VideoViewerRef } from '@cloudimage/360-video/react';

function Viewer() {
  const ref = useRef<CI360VideoViewerRef>(null);
  return (
    <>
      <CI360VideoViewer ref={ref} src="/pano.mp4" autoplay muted />
      <button onClick={() => ref.current?.setView({ lon: 180 }, true)}>Look back</button>
    </>
  );
}`, 'tsx')}
  `);
}

function renderDocTheming(): string {
  return docPage('Theming', 'Switch the toolbar theme, or override individual CSS custom properties to match your brand.', `
    <h2>Theme attribute</h2>
    <p>Set <code>theme: 'light' | 'dark'</code> at construction or via <code>update({ theme })</code>. The player reflects it as <code>data-theme</code> on the container.</p>
    ${codeBlock(`new CI360Video('#player', { src: '/pano.mp4', theme: 'light' });
// later:
player.update({ theme: 'dark' });`, 'typescript')}

    <h2>CSS custom properties</h2>
    <p>All tokens are namespaced <code>--ci-360-video-*</code> and read off the container, so you can scope overrides per instance.</p>
    ${renderTable(['Token', 'Controls'], [
      ['<code>--ci-360-video-controls-bg</code>', 'Toolbar background'],
      ['<code>--ci-360-video-controls-color</code>', 'Toolbar text / icon colour'],
      ['<code>--ci-360-video-controls-height</code>', 'Toolbar height (default 48px)'],
      ['<code>--ci-360-video-progress-height</code>', 'Progress bar thickness (default 4px)'],
      ['<code>--ci-360-video-progress-bg</code>', 'Progress track (unfilled)'],
      ['<code>--ci-360-video-progress-fill</code>', 'Progress fill / handle (default #ff4444)'],
      ['<code>--ci-360-video-progress-buffered</code>', 'Buffered range'],
      ['<code>--ci-360-video-focus-ring</code>', 'Keyboard focus ring (default #4A90D9)'],
    ])}

    <h2>Override example</h2>
    ${codeBlock(`.ci-360-video {
  --ci-360-video-progress-fill: #00d4aa;
  --ci-360-video-controls-bg: rgba(10, 14, 39, 0.9);
  --ci-360-video-focus-ring: #60a5fa;
}`, 'css')}
  `);
}

function renderDocTypes(): string {
  return docPage('TypeScript types', 'The player ships full type declarations. Key types you will touch:', `
    <h2>Imports</h2>
    ${codeBlock(`import CI360Video, {
  type CI360VideoConfig,
  type CI360VideoInstance,
  type ViewState,
  type ScreenPoint,
  type ThreeObjects,
  type ProjectionType,
  type StereoLayout,
  type StereoOption,
  type PlayerType,
  type Theme,
} from '@cloudimage/360-video';`, 'typescript')}
    <p class="demo-doc-lead" style="font-size:14px">Note: <code>VideoSource</code>, <code>QualityLevel</code> and <code>QualityId</code> are declared in <code>core/types</code>; import them from there if you need them directly.</p>

    <h2>View &amp; geometry</h2>
    ${codeBlock(`interface ViewState { lon: number; lat: number; fov: number } // degrees
interface ScreenPoint { x: number; y: number; visible: boolean } // container pixels
interface ThreeObjects {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  mesh: THREE.Mesh | null;
}`, 'typescript')}

    <h2>Unions</h2>
    ${codeBlock(`type ProjectionType = 'equirectangular' | 'fisheye' | 'dual-fisheye';
type StereoLayout   = 'mono' | 'top-bottom' | 'side-by-side';
type StereoOption   = StereoLayout | 'auto'; // config 'stereo' accepts this
type PlayerType     = 'auto' | 'html5' | 'hls' | 'dash';
type Theme          = 'light' | 'dark';`, 'typescript')}

    <h2>Quality</h2>
    ${codeBlock(`interface VideoSource { src: string; label: string; height?: number; width?: number; default?: boolean }
interface QualityLevel { id: number; label: string; width?: number; height?: number; bitrate?: number }`, 'typescript')}

    <h2>React</h2>
    ${codeBlock(`import {
  type CI360VideoViewerProps,
  type CI360VideoViewerRef,
} from '@cloudimage/360-video/react';`, 'typescript')}
  `);
}

// ---------------------------------------------------------------------------
// Example pages (one live player each)
// ---------------------------------------------------------------------------

function examplePage(title: string, description: string, body: string): string {
  return `<article class="demo-example"><header class="demo-example-header"><h1>${title}</h1><p class="demo-doc-lead">${description}</p></header>${body}</article>`;
}

/** A live-player host + optional controls/log, sized via .ci360-embed. */
function liveHost(id: string): string {
  return `<div class="demo-example-live"><div id="${id}" class="ci360-embed"></div></div>`;
}

// -- Basic --------------------------------------------------------------------
function renderExampleBasic(): string {
  return examplePage('Basic usage', 'A single <code>CI360Video</code> on an equirectangular 360° clip (adaptive HLS, up to 4K) — drag, zoom, and use the toolbar.', `
    ${liveHost('ex-basic')}
    ${tabbedCode([
      { label: 'JavaScript', code: `import { CI360Video } from '@cloudimage/360-video';

new CI360Video('#player', {
  src: '${DEMO_SRC}', // equirectangular 360°, adaptive HLS (up to 4K)
  autoplay: true,
  muted: true,
  loop: true,
});`, lang: 'typescript' },
      { label: 'React', code: `import { CI360VideoViewer } from '@cloudimage/360-video/react';

<CI360VideoViewer src="/pano.mp4" autoplay muted loop />`, lang: 'tsx' },
    ])}
  `);
}
function hydrateExampleBasic(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#ex-basic');
  if (host) mountPlayer(host, { src: DEMO_SRC, autoplay: true, muted: true, loop: true });
}

// -- React (code only) --------------------------------------------------------
function renderExampleReact(): string {
  return examplePage('React wrapper', 'The <code>/react</code> entry exposes a component, an imperative ref, and a hook. It dynamically imports the core, so it is SSR-safe (Next.js / Remix).', `
    <h2>Component + ref</h2>
    ${codeBlock(`import { useRef } from 'react';
import { CI360VideoViewer, type CI360VideoViewerRef } from '@cloudimage/360-video/react';

export function Panorama() {
  const ref = useRef<CI360VideoViewerRef>(null);
  return (
    <>
      <CI360VideoViewer
        ref={ref}
        src="/pano.mp4"
        autoplay
        muted
        loop
        autoRotate
        style={{ width: '100%', aspectRatio: '16 / 9' }}
        onReady={() => console.log('view', ref.current?.getView())}
        onViewChange={(v) => console.log(v)}
      />
      <button onClick={() => ref.current?.setView({ lon: 90 }, true)}>Look right</button>
    </>
  );
}`, 'tsx')}

    <h2>Hook</h2>
    ${codeBlock(`import { useCI360Video } from '@cloudimage/360-video/react';

function Viewer() {
  const { containerRef, instance, ready } = useCI360Video({ src: '/pano.mp4', muted: true });
  // instance.current is the CI360Video once ready === true
  return <div ref={containerRef} style={{ width: '100%', aspectRatio: '16 / 9' }} />;
}`, 'tsx')}
    <p class="demo-doc-lead" style="font-size:14px">A changed <code>src</code> re-initialises the player; every other prop is forwarded through <code>update()</code>.</p>
  `);
}

// -- Projections --------------------------------------------------------------
const PROJECTIONS: { id: 'equirectangular' | 'fisheye' | 'dual-fisheye'; label: string }[] = [
  { id: 'equirectangular', label: 'Equirectangular' },
  { id: 'fisheye',         label: 'Fisheye' },
  { id: 'dual-fisheye',    label: 'Dual fisheye' },
];
function renderExampleProjections(): string {
  return examplePage('Projections', 'Equirectangular, single fisheye, and dual-fisheye. Projection is a constructor-time mesh decision, so switching re-creates the player.', `
    <div class="demo-example-controls">
      ${PROJECTIONS.map((p, i) => `<button class="demo-btn demo-btn--ghost ex-proj-btn${i === 0 ? ' is-active' : ''}" data-proj="${p.id}" aria-pressed="${i === 0}">${p.label}</button>`).join('')}
    </div>
    ${liveHost('ex-proj')}
    ${codeBlock(`new CI360Video('#player', {
  src: '/pano.mp4',
  projection: 'dual-fisheye', // 'equirectangular' | 'fisheye' | 'dual-fisheye'
  lensFovDeg: 180,            // fisheye lens FOV
});`, 'typescript')}
  `);
}
function hydrateExampleProjections(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#ex-proj');
  if (!host) return;
  const make = (projection: 'equirectangular' | 'fisheye' | 'dual-fisheye') =>
    mountPlayer(host, { src: DEMO_SRC, projection, autoplay: true, muted: true, loop: true });
  make('equirectangular');
  root.querySelectorAll<HTMLButtonElement>('.ex-proj-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll<HTMLButtonElement>('.ex-proj-btn').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      make(btn.dataset.proj as 'equirectangular' | 'fisheye' | 'dual-fisheye');
    });
  });
}

// -- Stereo -------------------------------------------------------------------
const STEREOS: { id: 'auto' | 'mono' | 'top-bottom' | 'side-by-side'; label: string }[] = [
  { id: 'auto',         label: 'Auto (detect)' },
  { id: 'top-bottom',   label: 'Top-Bottom' },
  { id: 'side-by-side', label: 'Side-by-Side' },
  { id: 'mono',         label: 'Mono' },
];
function renderExampleStereo(): string {
  return examplePage('Stereo 3D', 'For stereo sources the player renders the <strong>left eye</strong> on the sphere (non-VR mono view). Leave <code>stereo: \'auto\'</code> (the default) and the layout is read from the MP4\'s Spherical metadata (<code>st3d</code> / <code>GSpherical</code>). When a source <em>has no metadata</em> — common for older, re-encoded clips — force the layout or let the viewer pick it from the toolbar <strong>format menu</strong>.', `
    <div class="demo-example-controls">
      ${STEREOS.map((s, i) => `<button class="demo-btn demo-btn--ghost ex-stereo-btn${i === 0 ? ' is-active' : ''}" data-stereo="${s.id}" aria-pressed="${i === 0}">${s.label}</button>`).join('')}
    </div>
    ${liveHost('ex-stereo')}
    <p class="demo-doc-lead" style="font-size:14px">This sample (<code>congo.mp4</code>) is a real <strong>top-bottom</strong> stereo source. <strong>Auto</strong> reads its embedded <code>st3d</code> metadata and resolves to Top-Bottom on its own; the other buttons force a layout so you can compare (Mono shows the un-cropped, doubled-up frame). The <strong>format picker</strong> in the toolbar (the layers icon) lets a viewer switch layout at runtime — handy when a source carries no metadata.</p>
    ${codeBlock(`new CI360Video('#player', {
  src: '/stereo-360.mp4',
  // 'auto' (default) reads st3d metadata on MP4 sources.
  // Force it with 'mono' | 'top-bottom' | 'side-by-side'.
  stereo: 'auto',
  // Toolbar format picker. 'auto' (default) shows it only when relevant;
  // set true to always offer it, false to hide it.
  stereoMenu: 'auto',
});`, 'typescript')}
  `);
}
function hydrateExampleStereo(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#ex-stereo');
  if (!host) return;
  const make = (stereo: 'auto' | 'mono' | 'top-bottom' | 'side-by-side') =>
    // stereoMenu: 'auto' matches the code block below — congo.mp4 resolves to a
    // stereo layout, so the picker surfaces on its own once metadata is read.
    mountPlayer(host, { src: STEREO_TB, stereo, stereoMenu: 'auto', autoplay: true, muted: true, loop: true });
  make('auto');
  root.querySelectorAll<HTMLButtonElement>('.ex-stereo-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll<HTMLButtonElement>('.ex-stereo-btn').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      make(btn.dataset.stereo as 'auto' | 'mono' | 'top-bottom' | 'side-by-side');
    });
  });
}

// -- Format tester ------------------------------------------------------------
// A full player wired to the stereo fallback, doubling as a live demo of the
// standalone `@cloudimage/360-video/metadata` API: load any clip from a URL or
// from disk, force a layout with the quick buttons, or use the toolbar's format
// picker (the layers icon). The panel reports what `detectSphericalMetadata()`
// reads from the source.
//
// Local files are inspected by parsing their bytes directly (what an authoring
// UI would do on a freshly picked file). Note they're previewed through a
// throwaway `blob:` URL, which the player can't range-probe — so `stereo:'auto'`
// only truly kicks in for a hosted URL; the panel flags this so its verdict and
// the live preview never quietly disagree.
function renderExampleTester(): string {
  return examplePage(
    'Format tester',
    'Drop in <em>any</em> 360° clip — by URL or from your computer — and exercise the full player with the stereo fallback. Use the quick buttons to force a layout, or the toolbar <strong>format picker</strong> (layers icon) to switch it live. The panel below runs the standalone <code>@cloudimage/360-video/metadata</code> API (<code>detectSphericalMetadata</code>) against your source and reports exactly <strong>what it can read</strong> — the 360°/spherical flag, stereo metadata, frame size and shape — so you can tell at a glance whether <code>auto</code> will work or you need to set the layout yourself.',
    `
    <div class="demo-example-controls" style="flex-wrap:wrap;gap:10px;align-items:center">
      <input id="tester-url" type="text" placeholder="https://…/video.mp4 (or .m3u8 / .mpd)" value="${STEREO_TB}"
        style="flex:1 1 320px;min-width:240px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(0,0,0,0.25);color:inherit;font-size:13px" />
      <button class="demo-btn" data-act="load-url">Load URL</button>
      <label class="demo-btn demo-btn--ghost" style="cursor:pointer;margin:0">Load file…<input id="tester-file" type="file" accept="video/*" style="display:none" /></label>
    </div>
    <div class="demo-example-controls">
      ${STEREOS.map((s, i) => `<button class="demo-btn demo-btn--ghost tester-stereo-btn${i === 0 ? ' is-active' : ''}" data-stereo="${s.id}" aria-pressed="${i === 0}">${s.label}</button>`).join('')}
    </div>
    ${liveHost('ex-tester')}
    <div id="tester-report" style="margin-top:14px;padding:14px 16px;border-radius:12px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);font-size:13px;line-height:1.85">
      <strong style="display:block;margin-bottom:6px">What <code>detectSphericalMetadata()</code> reads</strong>
      <div>360° (spherical) flag: <code id="rep-spherical">—</code></div>
      <div>Stereo metadata: <code id="rep-meta">—</code></div>
      <div>Frame size: <code id="rep-size">—</code></div>
      <div>Frame shape: <code id="rep-shape">—</code></div>
      <div><code>stereo: 'auto'</code> resolves to: <code id="rep-auto">—</code></div>
      <div id="rep-advice" style="margin-top:8px;opacity:0.95"></div>
    </div>
    <p class="demo-doc-lead" style="font-size:14px">Make a metadata-less top-bottom file to test the fallback: <code>ffmpeg -i pano.mp4 -filter_complex "[0:v]split=2[a][b];[a][b]vstack" -an tb_nometa.mp4</code> — load it here, watch it play doubled-up as mono, then pick <strong>Top-Bottom</strong> from the toolbar format menu to fix it.</p>
    ${codeBlock(`new CI360Video('#player', {
  src: '/my-360.mp4',
  stereo: 'auto',     // detects metadata; falls back to mono without it
  stereoMenu: true,   // always offer the manual format picker
});`, 'typescript')}
    <p class="demo-doc-lead" style="font-size:14px">The panel above uses the same detection standalone — no player, no Three.js — so an authoring UI can inspect a source up front:</p>
    ${codeBlock(`import { detectSphericalMetadata } from '@cloudimage/360-video/metadata';

const meta = await detectSphericalMetadata(url);
// meta === null            → not MP4 / no range support (keep a manual UI)
// meta.spherical === true  → 360° source (e.g. auto-enable a 360 toggle)
// meta.stereo              → 'top-bottom' | 'side-by-side' | 'mono' | null`, 'typescript')}
  `,
  );
}
function hydrateExampleTester(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#ex-tester');
  if (!host) return;
  const urlInput = root.querySelector<HTMLInputElement>('#tester-url');
  const fileInput = root.querySelector<HTMLInputElement>('#tester-file');
  if (!urlInput || !fileInput) return;

  const rep = {
    spherical: root.querySelector<HTMLElement>('#rep-spherical'),
    meta: root.querySelector<HTMLElement>('#rep-meta'),
    size: root.querySelector<HTMLElement>('#rep-size'),
    shape: root.querySelector<HTMLElement>('#rep-shape'),
    auto: root.querySelector<HTMLElement>('#rep-auto'),
    advice: root.querySelector<HTMLElement>('#rep-advice'),
  };

  let objUrl: string | null = null;
  let lastFile: File | null = null;
  let src: string = STEREO_TB;
  let stereo: 'auto' | 'mono' | 'top-bottom' | 'side-by-side' = 'auto';
  // Diagnostics state, recomputed per load; advice waits on both async checks.
  type ShapeKind = 'mono' | 'tb-candidate' | 'sbs-candidate';
  let spherical: boolean | null = null;
  let metaLayout: StereoLayout | null = null;
  let shape: ShapeKind | null = null;
  // A local file is parsed from bytes directly; its live preview runs off a
  // throwaway blob: URL the player can't range-probe. The advice text has to say
  // so, or the panel's verdict and the preview above it quietly disagree.
  let isLocal = false;
  let token = 0; // guards against a slow probe from a previous source landing late

  const SHAPE_LABEL: Record<ShapeKind, string> = {
    mono: 'normal ≈2:1 → mono',
    'tb-candidate': 'square ≈1:1 → top-bottom candidate',
    'sbs-candidate': 'wide ≈4:1 → side-by-side candidate',
  };

  const renderAdvice = (): void => {
    if (!rep.advice) return;
    // For a hosted URL `detectSphericalMetadata` IS the player's probe, so the
    // "auto resolves to" line is the literal truth. For a local file we've read
    // more than the player can (bytes vs. a non-probeable blob:), so we report
    // what the file holds but flag that `auto` needs a real hosted URL.
    if (rep.auto) {
      rep.auto.textContent = isLocal
        ? `${metaLayout ?? 'mono'} — but only once hosted (a blob: URL can't be range-probed)`
        : (metaLayout ?? 'mono (no metadata found)');
    }
    if (metaLayout && isLocal) {
      rep.advice.innerHTML = `✅ <strong>File carries <code>${metaLayout}</code> metadata.</strong> Host it on a CORS-enabled server with range support and <code>stereo: 'auto'</code> detects it automatically. The preview above runs off a temporary <code>blob:</code> URL where <code>auto</code> can't probe — pick <code>${metaLayout}</code> from the format menu to preview it correctly here.`;
    } else if (metaLayout) {
      rep.advice.innerHTML = `✅ <strong>Metadata present.</strong> <code>stereo: 'auto'</code> detects <code>${metaLayout}</code> on its own — nothing to configure.`;
    } else if (shape === 'tb-candidate' || shape === 'sbs-candidate') {
      const guess = shape === 'tb-candidate' ? 'top-bottom' : 'side-by-side';
      rep.advice.innerHTML = `⚠️ <strong>No metadata, but the frame looks stereo.</strong> <code>auto</code> falls back to mono (doubled-up). Set <code>stereo: '${guess}'</code>, re-inject metadata, or pick the layout from the toolbar format menu.`;
    } else if (shape === 'mono') {
      rep.advice.innerHTML = `🟢 No stereo metadata and a normal mono shape — most likely a plain mono 360° video. Nothing to do.`;
    } else {
      rep.advice.textContent = '';
    }
  };

  const inspect = async (): Promise<void> => {
    const mine = ++token;
    isLocal = !!(lastFile && src === objUrl);
    spherical = null;
    metaLayout = null;
    shape = null;
    if (rep.spherical) rep.spherical.textContent = '—';
    if (rep.meta) rep.meta.textContent = 'checking…';
    if (rep.size) rep.size.textContent = '—';
    if (rep.shape) rep.shape.textContent = '—';
    if (rep.auto) rep.auto.textContent = '—';
    if (rep.advice) rep.advice.textContent = '';

    // The public `/metadata` API an authoring UI would call: a local file is
    // parsed straight from its bytes; a hosted URL is range-probed over the
    // network (exactly what the player does for `stereo: 'auto'`).
    try {
      if (isLocal) {
        const buf = new Uint8Array(await lastFile!.arrayBuffer());
        const meta = parseSphericalMetadataFromMoov(buf);
        spherical = meta.spherical;
        metaLayout = meta.stereo;
      } else {
        const meta = await detectSphericalMetadata(src);
        spherical = meta ? meta.spherical : null;
        metaLayout = meta ? meta.stereo : null;
      }
    } catch {
      spherical = null;
      metaLayout = null;
    }
    if (mine !== token) return; // a newer load superseded this probe
    if (rep.spherical) {
      rep.spherical.textContent =
        spherical === null ? 'unknown (not MP4 / no range support)' : spherical ? 'yes' : 'no';
    }
    if (rep.meta) rep.meta.textContent = metaLayout ?? 'none found';
    renderAdvice();
  };

  const hookVideo = (el: CI360VideoElement): void => {
    const v = el.shadowRoot?.querySelector('video');
    if (!v) return;
    const fill = (): void => {
      if (!v.videoWidth) return;
      if (rep.size) rep.size.textContent = `${v.videoWidth}×${v.videoHeight}`;
      shape = classifyStereoAmbiguity(v.videoWidth, v.videoHeight);
      if (rep.shape) rep.shape.textContent = SHAPE_LABEL[shape];
      renderAdvice();
    };
    if (v.videoWidth) fill();
    else v.addEventListener('loadedmetadata', fill, { once: true });
  };

  const remount = (): void => {
    const el = mountPlayer(host, { src, stereo, stereoMenu: true, autoplay: true, muted: true, loop: true });
    hookVideo(el);
    void inspect();
  };

  const highlight = (id: string): void =>
    root.querySelectorAll<HTMLButtonElement>('.tester-stereo-btn').forEach((b) => {
      const on = b.dataset.stereo === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });

  remount();

  root.querySelector<HTMLButtonElement>('[data-act="load-url"]')?.addEventListener('click', () => {
    const v = urlInput.value.trim();
    if (!v) return;
    if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
    lastFile = null;
    src = v;
    remount();
  });

  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (objUrl) URL.revokeObjectURL(objUrl);
    lastFile = f;
    objUrl = URL.createObjectURL(f);
    src = objUrl;
    urlInput.value = f.name; // show what's loaded; the blob URL is internal
    remount();
  });

  root.querySelectorAll<HTMLButtonElement>('.tester-stereo-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      stereo = btn.dataset.stereo as 'auto' | 'mono' | 'top-bottom' | 'side-by-side';
      highlight(stereo);
      remount();
    });
  });
}

// -- Initial view -------------------------------------------------------------
function renderExampleInitialView(): string {
  return examplePage('Initial view', 'Aim the camera and set the zoom before the first frame paints with <code>initialLon</code>, <code>initialLat</code> and <code>fov</code>.', `
    ${liveHost('ex-initial')}
    ${codeBlock(`new CI360Video('#player', {
  src: '/pano.mp4',
  initialLon: 120,  // look right of centre
  initialLat: 10,   // tilt up slightly
  fov: 60,          // zoomed in
  autoRotate: true,
});`, 'typescript')}
    <ul>
      <li><code>lon</code> / <code>lat</code> are in degrees; <code>lat</code> is clamped to <code>latMin…latMax</code>.</li>
      <li><code>fov</code> is the initial vertical field of view, clamped to <code>fovMin…fovMax</code>.</li>
      <li>Read the live values any time with <code>player.getView()</code>.</li>
    </ul>
  `);
}
function hydrateExampleInitialView(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#ex-initial');
  if (host) mountPlayer(host, { src: DEMO_SRC, initialLon: 120, initialLat: 10, fov: 60, autoplay: true, muted: true, loop: true, autoRotate: true });
}

// -- Controls & gyroscope -----------------------------------------------------
function renderExampleControls(): string {
  return examplePage('Controls &amp; gyroscope', 'Toggle interaction options at runtime via <code>update()</code>, and reset the view with <code>setView()</code>.', `
    <div class="demo-example-controls">
      <button class="demo-btn demo-btn--ghost" data-ctl="autoRotate" aria-pressed="false">Auto-rotate: off</button>
      <button class="demo-btn demo-btn--ghost" data-ctl="invertDrag" aria-pressed="false">Invert drag: off</button>
      <button class="demo-btn demo-btn--ghost" data-ctl="scrollToZoom" aria-pressed="true">Scroll-zoom: on</button>
      <button class="demo-btn demo-btn--ghost" data-ctl="gyroscope" aria-pressed="false">Gyroscope: off</button>
      <button class="demo-btn demo-btn--ghost" id="ex-reset">Reset view</button>
    </div>
    ${liveHost('ex-controls')}
    ${codeBlock(`player.update({ autoRotate: true, invertDrag: false, scrollToZoom: true });
player.setView({ lon: 0, lat: 0, fov: 75 }, true); // animate back to centre`, 'typescript')}
    <p class="demo-doc-lead" style="font-size:14px">Gyroscope needs a mobile device; on iOS 13+ the first enable must come from a user gesture (this button qualifies).</p>
  `);
}
function hydrateExampleControls(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#ex-controls');
  if (!host) return;
  mountPlayer(host, { src: DEMO_SRC, autoplay: true, muted: true, loop: true, scrollToZoom: true, autoRotateIdleDelay: 0 });
  const state: Record<string, boolean> = { autoRotate: false, invertDrag: false, scrollToZoom: true, gyroscope: false };
  const labels: Record<string, string> = { autoRotate: 'Auto-rotate', invertDrag: 'Invert drag', scrollToZoom: 'Scroll-zoom', gyroscope: 'Gyroscope' };
  root.querySelectorAll<HTMLButtonElement>('[data-ctl]').forEach((btn) => {
    const key = btn.dataset.ctl!;
    btn.addEventListener('click', () => {
      state[key] = !state[key];
      activePlayer?.update({ [key]: state[key] });
      btn.textContent = `${labels[key]}: ${state[key] ? 'on' : 'off'}`;
      btn.setAttribute('aria-pressed', String(state[key]));
    });
  });
  root.querySelector<HTMLButtonElement>('#ex-reset')?.addEventListener('click', () => {
    activePlayer?.setView({ lon: 0, lat: 0, fov: 75 }, true);
  });
}

// -- Events -------------------------------------------------------------------
function renderExampleEvents(): string {
  return examplePage('Event handling', 'Subscribe to lifecycle, playback and view events. Interact with the player and watch the log.', `
    ${liveHost('ex-events')}
    <div class="demo-example-log" id="ex-events-log" aria-live="polite"></div>
    ${tabbedCode([
      { label: 'JavaScript', code: `player.on('ready', () => log('ready'));
player.on('play', () => log('play'));
player.on('timeupdate', (t) => log('time ' + t.toFixed(1)));
player.on('view-change', (v) => log('view ' + v.lon.toFixed(0)));
player.on('error', (e) => log('error'));`, lang: 'typescript' },
      { label: 'React', code: `<CI360VideoViewer
  src="/pano.mp4"
  onReady={() => {}}
  onTimeUpdate={(t) => {}}
  onViewChange={(v) => {}}
/>`, lang: 'tsx' },
    ])}
  `);
}
function hydrateExampleEvents(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#ex-events');
  const logEl = root.querySelector<HTMLElement>('#ex-events-log');
  if (!host || !logEl) return;
  const player = mountPlayer(host, { src: DEMO_SRC, autoplay: true, muted: true, loop: true });
  const log = (m: string) => appendLog(logEl, m);
  player.on('ready', () => log('ready'));
  player.on('play', () => log('play'));
  player.on('pause', () => log('pause'));
  player.on('durationchange', (d: number) => log(`durationchange · ${d.toFixed(1)}s`));
  player.on('ended', () => log('ended'));
  player.on('error', () => log('error'));
  let lastT = 0;
  player.on('timeupdate', (t: number) => { if (t - lastT >= 1 || t < lastT) { lastT = t; log(`timeupdate · ${t.toFixed(1)}s`); } });
  let lastLon = NaN;
  player.on('view-change', (v: { lon: number; lat: number; fov: number }) => {
    if (Math.abs(v.lon - lastLon) >= 5) { lastLon = v.lon; log(`view-change · lon ${v.lon.toFixed(0)}° fov ${v.fov.toFixed(0)}°`); }
  });
}

// -- Quality & streaming ------------------------------------------------------
function renderExampleQuality(): string {
  return examplePage('Quality &amp; streaming', 'Two ways to offer resolutions: an adaptive HLS stream (levels inside one manifest), or a list of separate per-resolution files via <code>sources</code>. Use the toolbar quality pill on either.', `
    <div class="demo-example-controls">
      <button class="demo-btn demo-btn--ghost ex-q-btn is-active" data-q="hls" aria-pressed="true">HLS adaptive (4K)</button>
      <button class="demo-btn demo-btn--ghost ex-q-btn" data-q="sources" aria-pressed="false">Separate files (720p / 480p)</button>
    </div>
    ${liveHost('ex-quality')}
    <div class="demo-example-log" id="ex-quality-log" aria-live="polite"></div>
    ${tabbedCode([
      { label: 'HLS adaptive', code: `new CI360Video('#player', {
  src: 'https://cdn.example/video.m3u8', // levels come from the manifest
});`, lang: 'typescript' },
      { label: 'Separate files', code: `new CI360Video('#player', {
  src: '/pano-720p.mp4',
  sources: [
    { src: '/pano-720p.mp4', label: '720p', height: 720, default: true },
    { src: '/pano-480p.mp4', label: '480p', height: 480 },
  ],
});`, lang: 'typescript' },
    ])}
  `);
}
function hydrateExampleQuality(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#ex-quality');
  const logEl = root.querySelector<HTMLElement>('#ex-quality-log');
  if (!host) return;
  const log = (m: string) => logEl && appendLog(logEl, m);
  const makeHls = () => {
    const p = mountPlayer(host, { src: DEMO_SRC, autoplay: true, muted: true, loop: true });
    p.on('qualitylevelsupdated', (levels: unknown) => log(`levels: ${(levels as unknown[]).length}`));
    p.on('qualitychange', (id: unknown) => log(`quality → ${String(id)}`));
  };
  const makeSources = () => {
    const p = mountPlayer(host, {
      src: COMP_720,
      sources: [
        { src: COMP_720, label: '720p', height: 720, default: true },
        { src: COMP_480, label: '480p', height: 480 },
      ],
      autoplay: true, muted: true, loop: true,
    });
    p.on('qualitychange', (id: unknown) => log(`quality → ${String(id)}`));
  };
  makeHls();
  root.querySelectorAll<HTMLButtonElement>('.ex-q-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll<HTMLButtonElement>('.ex-q-btn').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      if (logEl) logEl.innerHTML = '';
      if (btn.dataset.q === 'hls') makeHls(); else makeSources();
    });
  });
}

// -- Theming ------------------------------------------------------------------
function renderExampleTheming(): string {
  return examplePage('Theming tokens', 'Flip the toolbar theme, and override <code>--ci-360-video-*</code> custom properties — here the progress fill and focus ring are branded teal.', `
    <div class="demo-example-controls">
      <button class="demo-btn demo-btn--ghost" id="ex-theme-toggle" aria-pressed="false">${ICONS.moon} Toggle theme</button>
    </div>
    <div class="demo-example-live" style="--ci-360-video-progress-fill:#00d4aa;--ci-360-video-focus-ring:#60a5fa">
      <div id="ex-theme" class="ci360-embed"></div>
    </div>
    ${codeBlock(`/* scope overrides to the player container */
.ci-360-video {
  --ci-360-video-progress-fill: #00d4aa;
  --ci-360-video-focus-ring: #60a5fa;
}

/* or flip the built-in theme */
player.update({ theme: 'light' });`, 'css')}
  `);
}
function hydrateExampleTheming(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#ex-theme');
  if (!host) return;
  mountPlayer(host, { src: DEMO_SRC, autoplay: true, muted: true, loop: true, theme: getStoredTheme() });
  const btn = root.querySelector<HTMLButtonElement>('#ex-theme-toggle');
  btn?.addEventListener('click', () => {
    const next: DemoTheme = getStoredTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    activePlayer?.update({ theme: next });
    btn.setAttribute('aria-pressed', String(next === 'dark'));
  });
}

// -- Filerobot ----------------------------------------------------------------
function renderExampleFilerobot(): string {
  return examplePage('Filerobot source', 'When your videos live in Scaleflex Filerobot, <code>fromFilerobotFile()</code> resolves the best playback config — an HLS playlist, or the per-resolution Compression files as <code>sources</code>.', `
    ${liveHost('ex-filerobot')}
    ${codeBlock(`import { CI360Video } from '@cloudimage/360-video';
import { fromFilerobotFile } from '@cloudimage/360-video/filerobot';

new CI360Video('#player', {
  ...fromFilerobotFile(file), // { src, poster?, sources? }
  autoplay: true,
  muted: true,
});`, 'typescript')}
    <p class="demo-doc-lead" style="font-size:14px">Lower-level: <code>pickFilerobotVideoUrl(file)</code> → <code>{ src, kind }</code> (HLS-first), and <code>pickFilerobotVideoSources(file)</code> → per-resolution <code>VideoSource[]</code> from the file's Compression variants.</p>
  `);
}
function hydrateExampleFilerobot(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#ex-filerobot');
  if (!host) return;
  // A minimal FilerobotFile-shaped object with two Compression variants.
  const file: FilerobotFileLike = { info: { compressed: [COMP_720, COMP_480] } };
  mountPlayer(host, { ...fromFilerobotFile(file), autoplay: true, muted: true, loop: true });
}

// ---------------------------------------------------------------------------
// Page registry + routing
// ---------------------------------------------------------------------------

interface PageDef { render: () => string; hydrate?: (root: HTMLElement) => void }

const PAGES: Record<string, PageDef> = {
  '/':                          { render: renderHome, hydrate: hydrateHome },
  '/docs/getting-started':      { render: renderDocGettingStarted },
  '/docs/configuration':        { render: renderDocConfiguration },
  '/docs/api':                  { render: renderDocApi },
  '/docs/theming':              { render: renderDocTheming },
  '/docs/types':                { render: renderDocTypes },
  '/examples/basic':            { render: renderExampleBasic,        hydrate: hydrateExampleBasic },
  '/examples/react':            { render: renderExampleReact },
  '/examples/projections':      { render: renderExampleProjections,  hydrate: hydrateExampleProjections },
  '/examples/stereo':           { render: renderExampleStereo,       hydrate: hydrateExampleStereo },
  '/examples/format-tester':    { render: renderExampleTester,       hydrate: hydrateExampleTester },
  '/examples/initial-view':     { render: renderExampleInitialView,  hydrate: hydrateExampleInitialView },
  '/examples/controls-and-gyro':{ render: renderExampleControls,     hydrate: hydrateExampleControls },
  '/examples/events':           { render: renderExampleEvents,       hydrate: hydrateExampleEvents },
  '/examples/quality-and-streaming': { render: renderExampleQuality, hydrate: hydrateExampleQuality },
  '/examples/theming':          { render: renderExampleTheming,      hydrate: hydrateExampleTheming },
  '/examples/filerobot':        { render: renderExampleFilerobot,    hydrate: hydrateExampleFilerobot },
};

function currentPath(): string {
  const h = location.hash;
  if (!h || h === '#' || h === '#/') return '/';
  return h.replace(/^#/, '');
}

function layoutFor(path: string): 'home' | 'docs' | 'examples' {
  if (path.startsWith('/docs')) return 'docs';
  if (path.startsWith('/examples')) return 'examples';
  return 'home';
}

function renderShell(path: string, pageHtml: string): string {
  const layout = layoutFor(path);
  return `
    ${renderHeader(path)}
    ${renderMobileNav(path)}
    <div class="demo-sidebar-backdrop" id="demo-sidebar-backdrop"></div>
    <main class="demo-main demo-main--${layout}" id="demo-main">
      ${renderSidebar(path)}
      <div class="demo-content" id="content">${pageHtml}</div>
    </main>
    ${renderFooter()}
  `;
}

let navAbort: AbortController | null = null;

function navigate(): void {
  // Tear down the previous route: abort its listeners and destroy its player
  // BEFORE replacing the DOM, so only one WebGL context ever exists.
  navAbort?.abort();
  activePlayer?.destroy();
  activePlayer = null;
  navAbort = new AbortController();
  const { signal } = navAbort;

  const path = currentPath();
  const page = PAGES[path] ?? PAGES['/'];
  const app = document.getElementById('app')!;
  const layout = layoutFor(path);
  document.body.classList.toggle('is-home', layout === 'home');
  document.body.classList.toggle('has-sidebar', layout !== 'home');

  app.innerHTML = renderShell(path, page.render());
  const root = app.querySelector<HTMLElement>('#content')!;

  bindCopyButtons(root);
  bindTabs(root);
  highlight(root);
  page.hydrate?.(root);

  if (!location.hash.includes('#quick-start')) window.scrollTo({ top: 0, behavior: 'instant' });

  const closeDrawer = (): void => document.body.classList.remove('sidebar-open');
  document.getElementById('demo-burger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.body.classList.toggle('sidebar-open');
  }, { signal });
  document.getElementById('demo-sidebar-backdrop')?.addEventListener('click', closeDrawer, { signal });
  document.querySelectorAll<HTMLAnchorElement>('.demo-mobile-nav a, .demo-sidebar a')
    .forEach((a) => a.addEventListener('click', closeDrawer, { signal }));
}

window.addEventListener('hashchange', navigate);
document.addEventListener('DOMContentLoaded', navigate);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.body.classList.remove('sidebar-open'); });
if (document.readyState !== 'loading') navigate();

/**
* pwa.js — Gerenciador de instalação PWA do PMOCsys
 *
 * - Registra o Service Worker
 * - Detecta se já está instalado (standalone) → não mostra nada
 * - Captura o evento beforeinstallprompt (Chrome/Edge/Android)
 * - Detecta iOS Safari e mostra instrução personalizada
 * - Exibe botão discreto no canto superior esquerdo após 3s
 * - Salva estado de dispensa para não incomodar novamente tão cedo
 */

(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://');

  if (isStandalone) return;

  const DISMISS_KEY = 'pwa_dismissed_at';
  const dismissed   = localStorage.getItem(DISMISS_KEY);
  if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

  const ua          = navigator.userAgent;
  const isIOS       = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
  const isSafari    = /^((?!chrome|android).)*safari/i.test(ua);
  const isIOSSafari = isIOS && isSafari;

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    scheduleShow('native');
  });

  if (isIOSSafari) scheduleShow('ios');

  function scheduleShow(type) {
    setTimeout(() => showBanner(type), 3000);
  }

  function showBanner(type) {
    if (document.getElementById('pwa-banner')) return;

    injectStyles();

    const banner = document.createElement('div');
    banner.id = 'pwa-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Instalar PMOCsys');

    if (type === 'ios') {
      banner.innerHTML = \`
        <button class="pwa-pill" id="pwa-pill-btn" aria-expanded="false">
          <span class="pwa-pill-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </span>
          <span class="pwa-pill-label">Baixar App</span>
        </button>
        <div class="pwa-tooltip" id="pwa-tooltip">
          <span class="pwa-tooltip-text">
            Toque em
            <svg class="pwa-share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            e depois <strong>"Adicionar à Tela Inicial"</strong>
          </span>
          <button class="pwa-tooltip-close" id="pwa-close-btn" aria-label="Fechar">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      \`;
    } else {
      banner.innerHTML = \`
        <button class="pwa-pill" id="pwa-install-btn" aria-label="Instalar PMOCsys">
          <span class="pwa-pill-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </span>
          <span class="pwa-pill-label">Baixar App</span>
        </button>
        <button class="pwa-dismiss" id="pwa-close-btn" aria-label="Fechar">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      \`;
    }

    document.body.appendChild(banner);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => banner.classList.add('pwa-visible'));
    });

    document.getElementById('pwa-close-btn').addEventListener('click', () => {
      dismissBanner(banner);
    });

    if (type === 'ios') {
      document.getElementById('pwa-pill-btn').addEventListener('click', () => {
        const tooltip = document.getElementById('pwa-tooltip');
        const expanded = tooltip.classList.toggle('pwa-tooltip-open');
        document.getElementById('pwa-pill-btn').setAttribute('aria-expanded', expanded);
      });
    }

    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        installBtn.disabled = true;
        const label = installBtn.querySelector('.pwa-pill-label');
        if (label) label.textContent = 'Instalando…';
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (outcome === 'accepted') {
          dismissBanner(banner, false);
        } else {
          dismissBanner(banner);
        }
      });
    }

    window.addEventListener('appinstalled', () => dismissBanner(banner, false));
  }

  function dismissBanner(banner, saveDismiss = true) {
    banner.classList.remove('pwa-visible');
    if (saveDismiss) localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setTimeout(() => banner.remove(), 400);
  }

  function injectStyles() {
    if (document.getElementById('pwa-styles')) return;
    const style = document.createElement('style');
    style.id = 'pwa-styles';
    style.textContent = \`
      #pwa-banner {
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        transform: translateY(-8px);
        transition: opacity 0.35s ease, transform 0.35s cubic-bezier(.22,1,.36,1);
        font-family: 'Inter', sans-serif;
      }

      #pwa-banner.pwa-visible {
        opacity: 1;
        transform: translateY(0);
      }

      .pwa-pill {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 13px 7px 10px;
        border-radius: 10px;
        background: rgba(255,255,255,0.88);
        backdrop-filter: blur(20px) saturate(1.8);
        -webkit-backdrop-filter: blur(20px) saturate(1.8);
        border: 1px solid rgba(255,255,255,0.9);
        box-shadow:
          0 2px 8px rgba(15,23,42,0.08),
          0 6px 20px rgba(30,64,175,0.10),
          inset 0 1px 0 rgba(255,255,255,0.85);
        cursor: pointer;
        transition: box-shadow .2s, transform .15s, background .2s;
        color: #1e3a8a;
        position: relative;
        overflow: hidden;
      }

      .pwa-pill:hover {
        background: rgba(255,255,255,0.97);
        box-shadow:
          0 4px 14px rgba(15,23,42,0.10),
          0 8px 28px rgba(30,64,175,0.18);
        transform: translateY(-1px);
      }

      .pwa-pill:active { transform: scale(0.97); }
      .pwa-pill:disabled { opacity: .55; pointer-events: none; }

      .pwa-pill::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 10px;
        background: linear-gradient(105deg,
          transparent 40%,
          rgba(255,255,255,0.55) 50%,
          transparent 60%);
        background-size: 200% 100%;
        background-position: 200% 0;
        animation: pillShimmer 3s ease-in-out infinite;
        pointer-events: none;
      }

      @keyframes pillShimmer {
        0%   { background-position: 200% 0; }
        40%  { background-position: -200% 0; }
        100% { background-position: -200% 0; }
      }

      .pwa-pill-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 7px;
        background: linear-gradient(135deg, #1e40af, #27a9e3);
        color: #fff;
        flex-shrink: 0;
        animation: iconPulse 3s ease-in-out infinite;
      }

      @keyframes iconPulse {
        0%, 100% { box-shadow: 0 2px 6px rgba(30,64,175,0.30); }
        50%       { box-shadow: 0 2px 12px rgba(39,169,227,0.55); }
      }

      .pwa-pill-label {
        font-size: .78rem;
        font-weight: 600;
        letter-spacing: -.01em;
        color: #1e3a8a;
        white-space: nowrap;
      }

      .pwa-dismiss {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 6px;
        background: rgba(100,116,139,0.12);
        border: none;
        cursor: pointer;
        color: #94a3b8;
        padding: 0;
        transition: background .15s, color .15s;
        flex-shrink: 0;
      }

      .pwa-dismiss:hover {
        background: rgba(100,116,139,0.22);
        color: #475569;
      }

      .pwa-tooltip {
        display: none;
        position: absolute;
        top: calc(100% + 10px);
        left: 0;
        background: rgba(255,255,255,0.96);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.9);
        border-radius: 12px;
        padding: 11px 14px 11px 13px;
        box-shadow: 0 8px 28px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06);
        width: max-content;
        max-width: 260px;
        gap: 8px;
        align-items: flex-start;
      }

      .pwa-tooltip::before {
        content: '';
        position: absolute;
        top: -5px;
        left: 18px;
        width: 10px;
        height: 10px;
        background: rgba(255,255,255,0.96);
        border-left: 1px solid rgba(255,255,255,0.9);
        border-top: 1px solid rgba(255,255,255,0.9);
        transform: rotate(45deg);
      }

      .pwa-tooltip.pwa-tooltip-open { display: flex; }

      .pwa-tooltip-text {
        font-size: .77rem;
        color: #475569;
        line-height: 1.5;
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        flex: 1;
      }

      .pwa-tooltip-text strong { color: #1e3a8a; }

      .pwa-share-icon {
        width: 12px;
        height: 12px;
        display: inline-block;
        vertical-align: middle;
        color: #1e40af;
        flex-shrink: 0;
      }

      .pwa-tooltip-close {
        background: none;
        border: none;
        cursor: pointer;
        color: #94a3b8;
        padding: 2px;
        display: flex;
        align-items: center;
        flex-shrink: 0;
        margin-top: 1px;
        transition: color .15s;
      }

      .pwa-tooltip-close:hover { color: #475569; }

      @media (max-width: 480px) {
        #pwa-banner { top: 12px; left: 12px; }
        .pwa-pill { padding: 6px 11px 6px 8px; gap: 6px; }
        .pwa-pill-icon { width: 22px; height: 22px; border-radius: 6px; }
        .pwa-pill-label { font-size: .73rem; }
      }
    \`;
    document.head.appendChild(style);
  }

})();
`;

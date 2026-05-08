(function () {
  'use strict';

  // ── Service Worker ──────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // ── Verificações Imediatas ──────────────────────────────────────
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                       window.navigator.standalone === true;

  if (isStandalone) return;

  const DISMISS_KEY = 'pwa_dismissed_at';
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (dismissed && Date.now() - parseInt(dismissed) < 3 * 24 * 60 * 60 * 1000) return;

  let deferredPrompt = null;
  let canShowButton = false;

  // ── Captura o evento (indispensável para o botão funcionar) ─────
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    canShowButton = true; // Sinaliza que o navegador está pronto para instalar
  }, { once: true });

  // ── Timer de 1 segundo após o carregamento ──────────────────────
  window.addEventListener('load', () => {
    setTimeout(() => {
      // Só mostra se o evento de instalação foi capturado e não está instalado
      if (canShowButton) {
        showOriginalButton();
      } else {
        // Caso o evento atrase um pouco, tentamos novamente em breves intervalos
        const checkInterval = setInterval(() => {
          if (canShowButton) {
            showOriginalButton();
            clearInterval(checkInterval);
          }
        }, 500);
        // Limita a tentativa a 5 segundos para não ficar rodando infinito
        setTimeout(() => clearInterval(checkInterval), 5000);
      }
    }, 1000); // Exatos 1000ms (1 segundo)
  });

  function showOriginalButton() {
    if (document.getElementById('pwa-install-btn')) return;

    injectStyles();

    const btn = document.createElement('button');
    btn.id = 'pwa-install-btn';
    btn.className = 'pwac-btn';
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Baixar App
    `;

    document.body.appendChild(btn);

    requestAnimationFrame(() => {
      btn.classList.add('visible');
    });

    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      btn.disabled = true;
      btn.innerHTML = 'Instalando…';
      
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        btn.classList.remove('visible');
        setTimeout(() => btn.remove(), 400);
      } else {
        btn.disabled = false;
        btn.innerHTML = 'Baixar App';
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
      }
      deferredPrompt = null;
    });
  }

  function injectStyles() {
    if (document.getElementById('pwa-styles')) return;
    const style = document.createElement('style');
    style.id = 'pwa-styles';
    style.textContent = `
      .pwac-btn {
        position: fixed !important;
        top: 16px !important;
        left: 16px !important;
        z-index: 999999 !important;
        padding: 10px 18px !important;
        border-radius: 12px !important;
        background: linear-gradient(135deg, #1e40af 0%, #27a9e3 100%) !important;
        color: #fff !important;
        font-family: 'Inter', sans-serif !important;
        font-size: .82rem !important;
        font-weight: 600 !important;
        border: none !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
        box-shadow: 0 4px 14px rgba(30, 64, 175, 0.35) !important;
        overflow: hidden !important;
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity 0.35s ease, transform 0.35s cubic-bezier(.22, 1, .36, 1);
      }
      .pwac-btn.visible {
        opacity: 1 !important;
        transform: translateY(0) !important;
        animation: pwacPulse 3s ease-in-out infinite;
      }
      .pwac-btn::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%);
        background-size: 200% 100%;
        background-position: 200% 0;
        animation: pwacShimmer 3s ease-in-out infinite;
      }
      @keyframes pwacShimmer {
        0% { background-position: 200% 0; }
        40% { background-position: -200% 0; }
        100% { background-position: -200% 0; }
      }
      @keyframes pwacPulse {
        0%, 100% { box-shadow: 0 4px 14px rgba(30, 64, 175, 0.35); }
        50% { box-shadow: 0 4px 20px rgba(39, 169, 227, 0.55); }
      }
      .pwac-btn:active { transform: scale(0.96); }
      @media (max-width: 480px) {
        .pwac-btn { top: 12px !important; left: 12px !important; font-size: .75rem !important; }
      }
    `;
    document.head.appendChild(style);
  }
})();
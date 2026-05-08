/**
 * login.js
 *
 * Usa a API explícita do Turnstile (?render=explicit) para evitar
 * conflitos de CSP com o modo automático. O widget é renderizado
 * programaticamente após o script carregar, e o desafio é executado
 * no momento do clique em "Entrar" — não fica visível na tela.
 */

let tsToken  = null;
let tsWidget = null;

// Inicializa o Turnstile no modo invisível após o script carregar
window.onloadTurnstileCallback = function () {
  tsWidget = turnstile.render('#ts-container', {
    sitekey:  '0x4AAAAAADImoRxJqwVPWd-4', // ← sua site key
    size:     'invisible',
    callback: function (token) { tsToken = token; },
    'error-callback': function () {
      tsToken = null;
      showError('Verificação de segurança falhou. Tente novamente.');
      setLoading(false);
    },
    'expired-callback': function () { tsToken = null; }
  });
};

// Se o script já carregou antes deste arquivo (ordem de carregamento)
if (typeof turnstile !== 'undefined' && tsWidget === null) {
  window.onloadTurnstileCallback();
}

function togglePw() {
  const inp  = document.getElementById('inp-senha');
  const icon = document.getElementById('eye-icon');
  const show = inp.type === 'text';
  inp.type = show ? 'password' : 'text';
  icon.innerHTML = show
    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
    : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
}

function showError(msg) {
  document.getElementById('alert-msg').textContent = msg;
  document.getElementById('alert-err').classList.add('show');
  const pw = document.getElementById('inp-senha');
  pw.style.borderColor = 'rgba(255,75,75,.5)';
  pw.style.boxShadow   = '0 0 0 4px rgba(255,75,75,.09)';
  setTimeout(() => { pw.style.borderColor = ''; pw.style.boxShadow = ''; }, 1600);
}

function setLoading(on) {
  document.getElementById('btn-submit').disabled    = on;
  document.getElementById('btn-label').textContent  = on ? 'Verificando...' : 'Entrar';
  document.getElementById('btn-spinner').style.display = on ? 'block' : 'none';
  document.getElementById('btn-arrow').style.display   = on ? 'none'  : '';
}

async function doLogin() {
  const email    = document.getElementById('inp-email').value.trim();
  const senha    = document.getElementById('inp-senha').value;
  const remember = document.getElementById('remember').checked;

  document.getElementById('alert-err').classList.remove('show');

  if (!email || !senha) { showError('Preencha e-mail e senha.'); return; }

  setLoading(true);

  // Se ainda não tem token, executa o desafio agora
  if (!tsToken) {
    if (typeof turnstile === 'undefined' || tsWidget === null) {
      showError('Verificação de segurança não carregou. Recarregue a página.');
      setLoading(false);
      return;
    }
    // Executa o desafio — quando resolver, chama o callback que seta tsToken
    // e depois chama submitLogin automaticamente
    turnstile.execute(tsWidget);
    // Aguarda o token (máx 15s)
    let waited = 0;
    await new Promise(resolve => {
      const iv = setInterval(() => {
        waited += 200;
        if (tsToken || waited >= 15000) { clearInterval(iv); resolve(); }
      }, 200);
    });
  }

  if (!tsToken) {
    showError('Verificação de segurança expirou. Tente novamente.');
    setLoading(false);
    return;
  }

  await submitLogin(email, senha, remember);
}

async function submitLogin(email, senha, remember) {
  try {
    const res = await fetch('/api/login', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password: senha, remember, turnstileToken: tsToken })
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.message || 'Credenciais inválidas. Tente novamente.');
      // Reset do Turnstile para nova tentativa
      tsToken = null;
      if (tsWidget !== null) turnstile.reset(tsWidget);
      setLoading(false);
      return;
    }

    document.getElementById('btn-label').textContent = 'Redirecionando...';
    window.location.href = '/dashboard';

  } catch {
    showError('Erro de conexão. Verifique sua internet.');
    setLoading(false);
  }
}

// Enter aciona login
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (['A', 'BUTTON'].includes(e.target.tagName)) return;
  if (['checkbox', 'submit'].includes(e.target.type)) return;
  doLogin();
});

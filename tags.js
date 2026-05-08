/**
 * tags.js — Física fluida com repulsão pelo mouse e colisão elástica nas bordas
 */
(function () {
  const tags = [...document.querySelectorAll('.tag')];
  if (!tags.length) return;

  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  // Posições iniciais espalhadas pela tela
  const initPos = [
    {x:.04,y:.08},{x:.68,y:.17},{x:.03,y:.61},{x:.66,y:.75},
    {x:.80,y:.35},{x:.06,y:.51},{x:.30,y:.86},{x:.37,y:.04},
    {x:.20,y:.28},{x:.45,y:.72},{x:.57,y:.43},{x:.12,y:.90}
  ];

  // Estado de cada tag
  const state = tags.map((el, i) => {
    const p = initPos[i] || { x: Math.random() * .8, y: Math.random() * .8 };
    const x = p.x * W();
    const y = p.y * H();
    el.style.left = '0px';
    el.style.top  = '0px';
    el.style.transform = `translate(${x}px,${y}px)`;
    return {
      el,
      x, y,
      vx: (Math.random() - .5) * 1.2,
      vy: (Math.random() - .5) * 1.2,
      drag: false,
      ox: 0, oy: 0,
      // Amortecimento base (ar)
      damping: 0.991
    };
  });

  // Rastreia posição do mouse
  let mx = -9999, my = -9999;
  window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
  window.addEventListener('mouseleave', () => { mx = -9999; my = -9999; });

  // Drag com ponteiro
  tags.forEach((el, i) => {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const s = state[i];
      s.ox = e.clientX - s.x;
      s.oy = e.clientY - s.y;
      s.drag = true;
      s.vx = 0; s.vy = 0;
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', e => {
      if (!state[i].drag) return;
      const s = state[i];
      // Calcula velocidade pelo delta de posição ao arrastar
      const nx = e.clientX - s.ox;
      const ny = e.clientY - s.oy;
      s.vx = (nx - s.x) * 0.6;
      s.vy = (ny - s.y) * 0.6;
      s.x = nx;
      s.y = ny;
    });
    ['pointerup','pointercancel'].forEach(ev =>
      el.addEventListener(ev, () => {
        state[i].drag = false;
        el.classList.remove('dragging');
      })
    );
  });

  // Loop de física
  function tick() {
    const cw = W();
    const ch = H();

    for (let i = 0; i < state.length; i++) {
      const s = state[i];
      const w = s.el.offsetWidth  || 100;
      const h = s.el.offsetHeight || 36;

      if (s.drag) {
        s.el.style.transform = `translate(${s.x}px,${s.y}px)`;
        continue;
      }

      // --- Repulsão pelo mouse ---
      const cx = s.x + w / 2;
      const cy = s.y + h / 2;
      const dxm = cx - mx;
      const dym = cy - my;
      const distM = Math.sqrt(dxm * dxm + dym * dym);
      const repRadius = 130;

      if (distM < repRadius && distM > 0) {
        const force = Math.pow((repRadius - distM) / repRadius, 2) * 4.5;
        s.vx += (dxm / distM) * force;
        s.vy += (dym / distM) * force;
      }

      // --- Repulsão entre tags (colisão suave) ---
      for (let j = i + 1; j < state.length; j++) {
        const s2 = state[j];
        const w2 = s2.el.offsetWidth  || 100;
        const h2 = s2.el.offsetHeight || 36;
        const dx = (s2.x + w2/2) - (s.x + w/2);
        const dy = (s2.y + h2/2) - (s.y + h/2);
        const dist = Math.sqrt(dx*dx + dy*dy);
        const minDist = (w + w2) / 2.2;

        if (dist < minDist && dist > 0) {
          const overlap = (minDist - dist) / minDist;
          const fx = (dx / dist) * overlap * 0.18;
          const fy = (dy / dist) * overlap * 0.18;
          if (!s.drag)  { s.vx  -= fx; s.vy  -= fy; }
          if (!s2.drag) { s2.vx += fx; s2.vy += fy; }
        }
      }

      // --- Física: mover ---
      s.x += s.vx;
      s.y += s.vy;

      // Amortecimento (ar)
      s.vx *= s.damping;
      s.vy *= s.damping;

      // Velocidade mínima de deriva (tag nunca para completamente)
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (speed < 0.15) {
        const angle = Math.random() * Math.PI * 2;
        s.vx += Math.cos(angle) * 0.08;
        s.vy += Math.sin(angle) * 0.08;
      }

      // --- Colisão com bordas com rebound elástico ---
      // Margem para não sair da tela
      const margin = 4;

      if (s.x < margin) {
        s.x = margin;
        s.vx = Math.abs(s.vx) * 0.78; // rebate com 78% da força
      }
      if (s.x + w > cw - margin) {
        s.x = cw - w - margin;
        s.vx = -Math.abs(s.vx) * 0.78;
      }
      if (s.y < margin) {
        s.y = margin;
        s.vy = Math.abs(s.vy) * 0.78;
      }
      if (s.y + h > ch - margin) {
        s.y = ch - h - margin;
        s.vy = -Math.abs(s.vy) * 0.78;
      }

      // Limita velocidade máxima
      const maxSpeed = 12;
      const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (spd > maxSpeed) {
        s.vx = (s.vx / spd) * maxSpeed;
        s.vy = (s.vy / spd) * maxSpeed;
      }

      s.el.style.transform = `translate(${s.x}px,${s.y}px)`;
    }

    requestAnimationFrame(tick);
  }

  tick();
})();

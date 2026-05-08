/**
 * tags.js — Animação das tags flutuantes
 */
(function () {
  const tags = [...document.querySelectorAll('.tag')];
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  const pos = [
    {x:.04,y:.08},{x:.68,y:.17},{x:.03,y:.61},{x:.66,y:.75},
    {x:.80,y:.35},{x:.06,y:.51},{x:.30,y:.86},{x:.37,y:.04},
    {x:.20,y:.28},{x:.45,y:.72},{x:.57,y:.43},{x:.12,y:.90}
  ];

  const state = tags.map((el, i) => {
    const p = pos[i] || { x: Math.random() * .8, y: Math.random() * .8 };
    const x = p.x * W(), y = p.y * H();
    el.style.left = '0'; el.style.top = '0';
    el.style.transform = `translate(${x}px,${y}px)`;
    return { el, x, y, vx: (Math.random() - .5) * .6, vy: (Math.random() - .5) * .6, drag: false, ox: 0, oy: 0 };
  });

  tags.forEach((el, i) => {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const s = state[i];
      s.ox = e.clientX - s.x; s.oy = e.clientY - s.y;
      s.drag = true; s.vx = 0; s.vy = 0;
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', e => {
      if (!state[i].drag) return;
      state[i].x = e.clientX - state[i].ox;
      state[i].y = e.clientY - state[i].oy;
    });
    ['pointerup','pointercancel'].forEach(ev =>
      el.addEventListener(ev, () => { state[i].drag = false; el.classList.remove('dragging'); })
    );
  });

  function tick() {
    const cw = W(), ch = H();
    for (let i = 0; i < state.length; i++) {
      const s = state[i];
      const w = s.el.offsetWidth || 80, h = s.el.offsetHeight || 32;
      if (!s.drag) {
        s.x += s.vx; s.y += s.vy; s.vx *= .992; s.vy *= .992;
        if (s.x < 0)    { s.x = 0;    s.vx *= -.75; }
        if (s.x+w > cw) { s.x = cw-w; s.vx *= -.75; }
        if (s.y < 0)    { s.y = 0;    s.vy *= -.75; }
        if (s.y+h > ch) { s.y = ch-h; s.vy *= -.75; }
      }
      for (let j = i+1; j < state.length; j++) {
        const s2 = state[j], w2 = s2.el.offsetWidth||80, h2 = s2.el.offsetHeight||32;
        const dx = (s2.x+w2/2)-(s.x+w/2), dy = (s2.y+h2/2)-(s.y+h/2);
        const dist = Math.sqrt(dx*dx+dy*dy), min = (w+w2)/2.4;
        if (dist < min && dist > 0) {
          const a = Math.atan2(dy,dx), f = (min-dist)/min*.12;
          const fx = Math.cos(a)*f, fy = Math.sin(a)*f;
          if (!s.drag)  { s.vx  -= fx; s.vy  -= fy; }
          if (!s2.drag) { s2.vx += fx; s2.vy += fy; }
        }
      }
      s.el.style.transform = `translate(${s.x}px,${s.y}px)`;
    }
    requestAnimationFrame(tick);
  }
  tick();
})();

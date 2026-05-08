/**
 * tilt.js — Efeito 3D tilt no card de login
 */
(function () {
  const card = document.getElementById('login-card');
  if (!card) return;
  const MAX = 3.5;
  let breath = 0;

  window.addEventListener('mousemove', e => {
    const r  = card.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width  / 2)) / (window.innerWidth  / 2);
    const dy = (e.clientY - (r.top  + r.height / 2)) / (window.innerHeight / 2);
    card.style.transition = 'transform .1s ease';
    card.style.transform  = `perspective(1000px) rotateX(${-dy*MAX}deg) rotateY(${dx*MAX}deg)`;
  });

  window.addEventListener('mouseleave', () => {
    card.style.transition = 'transform .7s cubic-bezier(.22,1,.36,1)';
    card.style.transform  = 'perspective(1000px) rotateX(0) rotateY(0)';
  });

  function animate() {
    breath += .01;
    if (!document.querySelector(':hover')) {
      card.style.transform = `perspective(1000px) rotateX(${Math.sin(breath)*1.1}deg) rotateY(${Math.cos(breath*.7)*.7}deg)`;
    }
    requestAnimationFrame(animate);
  }
  animate();
})();

/* Tristate Classic Car Restoration — site interactions (no dependencies) */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;

  /* ----- Form handling -----
     Static hosting (GitHub Pages) has no server. Put a form service URL
     (e.g. Formspree / Getform / Basin) in FORM_ENDPOINT to receive
     submissions by email. Left empty, the form opens the visitor's e-mail app
     pre-filled and addressed to the shop. */
  const FORM_ENDPOINT = '';
  const SHOP_EMAIL = 'gc@tristateclassiccarrestoration.com';

  /* Header state + progress bar */
  const header = $('.site-header');
  const bar = $('.scroll-progress');
  const onScroll = () => {
    const y = scrollY;
    header && header.classList.toggle('is-scrolled', y > 10);
    if (bar) {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
    }
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* Mobile drawer */
  const burger = $('.burger');
  if (burger) {
    const toggle = open => {
      root.classList.toggle('nav-open', open);
      burger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', () => toggle(!root.classList.contains('nav-open')));
    $$('.drawer a').forEach(a => a.addEventListener('click', () => toggle(false)));
    addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
  }

  /* Reveal on scroll */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;
  $$('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('is-in'));

  /* Lightbox for galleries */
  const lb = $('.lightbox');
  if (lb) {
    const img = $('img', lb);
    let list = [], i = 0;
    const show = k => { i = (k + list.length) % list.length; img.src = list[i].dataset.full; img.alt = list[i].querySelector('img')?.alt || ''; };
    $$('[data-lightbox]').forEach(btn => btn.addEventListener('click', () => {
      list = $$('[data-lightbox]', btn.closest('[data-gallery]') || document);
      show(list.indexOf(btn));
      lb.classList.add('is-open'); document.body.style.overflow = 'hidden';
      $('.lb-close', lb).focus();
    }));
    const close = () => { lb.classList.remove('is-open'); document.body.style.overflow = ''; };
    $('.lb-close', lb).addEventListener('click', close);
    $('.lb-prev', lb).addEventListener('click', () => show(i - 1));
    $('.lb-next', lb).addEventListener('click', () => show(i + 1));
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
    addEventListener('keydown', e => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
    });
    let sx = 0;
    lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1)); });
  }

  /* Before / after sliders */
  $$('.ba').forEach(ba => {
    const r = $('input', ba);
    const set = () => ba.style.setProperty('--pos', r.value + '%');
    r.addEventListener('input', set); set();
  });

  /* Lite YouTube embeds (load iframe on click — keeps pages fast) */
  $$('.yt').forEach(v => {
    const id = v.dataset.id;
    v.style.backgroundImage = `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)`;
    const play = () => {
      if (v.querySelector('iframe')) return;
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      f.title = v.dataset.title || 'YouTube video';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      f.allowFullscreen = true;
      v.appendChild(f);
    };
    v.addEventListener('click', play);
    v.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
  });

  /* Self-hosted videos: fetch metadata (first frame) only when near the viewport */
  const vids = $$('video[data-lazy-video]');
  if (vids.length && 'IntersectionObserver' in window) {
    const vo = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const v = e.target; vo.unobserve(v);
      if (!/#t=/.test(v.getAttribute('src'))) v.src = v.getAttribute('src') + '#t=0.1';
      v.preload = 'metadata';
    }), { rootMargin: '300px 0px' });
    vids.forEach(v => vo.observe(v));
  }
  // only one video plays at a time
  document.addEventListener('play', e => { $$('video').forEach(v => { if (v !== e.target) v.pause(); }); }, true);

  /* Forms */
  $$('form[data-lead]').forEach(f => {
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!f.reportValidity()) return;
      const status = $('.form-status', f);
      const data = Object.fromEntries(new FormData(f));
      if (data._gotcha) return; // honeypot
      const thanks = f.getAttribute('data-thanks');
      if (FORM_ENDPOINT) {
        status.textContent = 'Sending…';
        try {
          const r = await fetch(FORM_ENDPOINT, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(f) });
          if (!r.ok) throw new Error();
          location.href = thanks;
        } catch { status.textContent = 'Sorry, something went wrong. Please call us at 855-878-1212.'; }
        return;
      }
      const lines = Object.entries(data).filter(([k, v]) => v && !k.startsWith('_')).map(([k, v]) => `${k}: ${v}`);
      const subject = encodeURIComponent(`Website enquiry from ${data.Name || 'a visitor'}`);
      location.href = `mailto:${SHOP_EMAIL}?subject=${subject}&body=${encodeURIComponent(lines.join('\n'))}`;
      status.textContent = 'Opening your e-mail app… If nothing happens, call us at 855-878-1212.';
      setTimeout(() => { location.href = thanks; }, 1800);
    });
  });

  /* Award plaque tilt (desktop pointer only) */
  if (matchMedia('(pointer: fine)').matches) {
    $$('[data-tilt]').forEach(el => {
      const img = el.querySelector('img');
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        img.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 14}deg)`;
      });
      el.addEventListener('pointerleave', () => { img.style.transform = ''; });
    });
  }

  /* Count-up stats */
  $$('[data-count]').forEach(el => {
    const to = +el.dataset.count;
    const o = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; o.disconnect();
      const t0 = performance.now();
      const step = t => { const k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(to * (1 - (1 - k) ** 3)) + (el.dataset.suffix || ''); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    o.observe(el);
  });
})();

/* Smart Interview Practice Portal — generic UI helpers only.
   Auth and all data now come from js/api.js + per-page inline scripts. */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- sidebar user info (any page with #sideName) ---------- */
  const sideName = document.getElementById('sideName');
  if (sideName && typeof Auth !== 'undefined') {
    const user = Auth.getUser();
    if (user) {
      sideName.textContent = `${user.firstName} ${user.lastName}`;
      const emailEl = document.getElementById('sideEmail');
      if (emailEl) emailEl.textContent = user.email;
      const avatarEl = document.getElementById('sideAvatar');
      if (avatarEl) avatarEl.textContent = (user.firstName[0] + user.lastName[0]).toUpperCase();
      const adminLink = document.querySelector('[data-admin-only]');
      if (adminLink && user.role !== 'admin') adminLink.style.display = 'none';
    }
  }
  document.querySelectorAll('[data-logout]').forEach(btn => {
    btn.addEventListener('click', () => Auth.logout());
  });

  /* ---------- generic count-up ---------- */
  document.querySelectorAll('[data-countup]').forEach(el => {
    const target = parseInt(el.dataset.countup, 10);
    animateNumber(el, target, 900, 150);
  });
  function animateNumber(el, target, duration, delay) {
    setTimeout(() => {
      const start = performance.now();
      function tick(now) {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(eased * target) + (el.dataset.suffix || '');
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, delay);
  }
  window.animateNumber = animateNumber;

  /* ---------- score rings: [data-ring] with data-score ---------- */
  function drawRing(svg) {
    const fill = svg.querySelector('.fill');
    if (!fill) return;
    const score = parseInt(svg.dataset.score || fill.dataset.score || '0', 10);
    const r = parseFloat(fill.getAttribute('r'));
    const c = 2 * Math.PI * r;
    fill.setAttribute('stroke-dasharray', c.toFixed(1));
    fill.style.strokeDashoffset = c.toFixed(1);
    const color = svg.dataset.color || (score >= 65 ? 'var(--tutor-green)' : 'var(--flag-amber)');
    fill.style.stroke = color;
    requestAnimationFrame(() => {
      setTimeout(() => { fill.style.strokeDashoffset = (c - (c * score) / 100).toFixed(1); }, 150);
    });
    const textEl = svg.querySelector('text.ring-value');
    if (textEl) textEl.textContent = score + '%';
  }
  document.querySelectorAll('[data-ring]').forEach(drawRing);
  window.drawRing = drawRing;

  /* ---------- mobile nav toggle ---------- */
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
    });
  }

  /* ---------- live word count for any textarea.answer ---------- */
  const answerBox = document.querySelector('textarea.answer');
  const wordCount = document.querySelector('.word-count');
  if (answerBox && wordCount) {
    const update = () => {
      const words = answerBox.value.trim().split(/\s+/).filter(Boolean).length;
      wordCount.textContent = `${words} word${words === 1 ? '' : 's'}`;
    };
    answerBox.addEventListener('input', update);
    update();
  }

  /* ---------- countdown timer: [data-timer] seconds ---------- */
  document.querySelectorAll('[data-timer]').forEach(timerEl => {
    let seconds = parseInt(timerEl.dataset.timer, 10) || 600;
    const format = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    timerEl.textContent = format(seconds);
    const iv = setInterval(() => {
      if (seconds > 0) { seconds -= 1; timerEl.textContent = format(seconds); }
      else clearInterval(iv);
    }, 1000);
  });

  /* ---------- proctoring: tab-switch detection ---------- */
  window.proctorSwitchCount = 0;
  const proctorBadge = document.querySelector('[data-proctor-badge]');
  if (proctorBadge) {
    const label = proctorBadge.querySelector('.proctor-label');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        window.proctorSwitchCount += 1;
        proctorBadge.classList.add('flagged');
        if (label) label.textContent = `Tab switch detected (${window.proctorSwitchCount})`;
      }
    });
  }

  /* ---------- MCQ option selection ---------- */
  document.querySelectorAll('.mcq-options').forEach(group => {
    group.querySelectorAll('.mcq-option').forEach(opt => {
      opt.addEventListener('click', () => {
        group.querySelectorAll('.mcq-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        opt.querySelector('input').checked = true;
      });
    });
  });

  /* ---------- modal open/close ---------- */
  document.querySelectorAll('[data-modal-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(btn.dataset.modalOpen);
      if (modal) modal.classList.add('open');
    });
  });
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.modal-backdrop').classList.remove('open'));
  });

  /* ---------- admin tabs ---------- */
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('[data-admin-panel]').forEach(p => {
        p.style.display = p.dataset.adminPanel === tab.dataset.tab ? '' : 'none';
      });
      if (typeof onAdminTabChange === 'function') onAdminTabChange(tab.dataset.tab);
    });
  });

  /* ---------- generic dashboard trend chart ---------- */
  function drawTrend(svgEl, points) {
    if (!points || points.length === 0) return;
    const w = 560, h = 160, pad = 12, max = 100, min = 0;
    const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
    const coords = points.map((v, i) => [pad + i * stepX, h - pad - ((v - min) / (max - min)) * (h - pad * 2)]);
    const linePath = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0] + ',' + c[1]).join(' ');
    const areaPath = linePath + ` L${coords[coords.length - 1][0]},${h} L${coords[0][0]},${h} Z`;
    svgEl.querySelector('.line').setAttribute('d', linePath);
    svgEl.querySelector('.area').setAttribute('d', areaPath);
    const dotsGroup = svgEl.querySelector('.dots');
    if (dotsGroup) {
      dotsGroup.innerHTML = '';
      coords.forEach(([x, y]) => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 3.5);
        dotsGroup.appendChild(c);
      });
    }
  }
  window.drawTrend = drawTrend;
  const trend = document.querySelector('[data-trend]');
  if (trend) {
    try { drawTrend(trend, JSON.parse(trend.dataset.trend)); } catch (e) {}
  }

  /* ---------- PDF report: trigger browser print ---------- */
  document.querySelectorAll('[data-download-report]').forEach(btn => {
    btn.addEventListener('click', () => window.print());
  });

});

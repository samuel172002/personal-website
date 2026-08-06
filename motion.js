/* Shared motion + sound layer for the #BreakTheClock pages.
   Progressive: every target is readable at rest; JS hides then reveals. */
(function () {
  if (window.__bcMotion) return;
  window.__bcMotion = true;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ENTER = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var narrow = function () { return window.innerWidth < 768; };

  /* ---------- scroll entrances ---------- */
  var seen = new WeakSet();
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      play(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -10%' });

  function frames() {
    return REDUCED
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(' + (narrow() ? 12 : 24) + 'px)' }, { opacity: 1, transform: 'none' }];
  }

  /* Arm the entrance as a PAUSED WAAPI animation held at time 0. A React
     re-render rewrites the style attribute every second, so the start state
     cannot live there. */
  function arm(el) {
    if (seen.has(el) || el.__anim) return;
    var a = el.animate(frames(), { duration: REDUCED ? 150 : 300, easing: ENTER, fill: 'both' });
    a.pause();
    a.currentTime = 0;
    el.__anim = a;
  }

  function reveal(el, delay) {
    if (seen.has(el)) return;
    seen.add(el);
    var a = el.__anim;
    if (!a) {
      a = el.animate(frames(), { duration: REDUCED ? 150 : 300, easing: ENTER, fill: 'both' });
      el.__anim = a;
      a.pause();
      a.currentTime = 0;
    }
    el.style.willChange = 'opacity, transform';
    var start = function () { a.play(); };
    if (delay && !REDUCED) setTimeout(start, delay); else start();
    a.finished.then(function () {
      el.style.willChange = '';
      try { a.cancel(); } catch (err) {}
      el.__anim = null;
    }).catch(function () {});
  }

  function play(el) {
    if (el.hasAttribute('data-anim-group')) {
      var kids = Array.prototype.filter.call(el.children, function (c) { return c.nodeType === 1; });
      kids.forEach(function (k, i) { reveal(k, Math.min(i, 5) * 60); });
    } else {
      reveal(el);
    }
  }

  function scan() {
    document.querySelectorAll('[data-hero]').forEach(arm);
    document.querySelectorAll('[data-anim], [data-anim-group]').forEach(function (el) {
      if (seen.has(el) || el.__watched) return;
      el.__watched = true;
      if (el.hasAttribute('data-anim-group')) {
        Array.prototype.forEach.call(el.children, arm);
      } else {
        arm(el);
      }
      io.observe(el);
    });
    document.querySelectorAll('[data-rule]').forEach(function (el) {
      if (el.__watched) return;
      el.__watched = true;
      if (REDUCED) return;
      var ra = el.animate(
        [{ transform: 'scaleX(0)', transformOrigin: 'left' }, { transform: 'scaleX(1)', transformOrigin: 'left' }],
        { duration: 400, easing: ENTER, fill: 'both' });
      ra.pause();
      ra.currentTime = 0;
      el.__rule = ra;
      ruleIo.observe(el);
    });
  }

  var ruleIo = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      ruleIo.unobserve(e.target);
      var el = e.target;
      var a = el.__rule;
      if (!a) return;
      el.style.willChange = 'transform';
      a.play();
      a.finished.then(function () { el.style.willChange = ''; try { a.cancel(); } catch (err) {} el.__rule = null; });
    });
  }, { threshold: 0.15 });

  /* ---------- hero on load ---------- */
  function heroIn() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-hero]'));
    if (!items.length) return;
    items.sort(function (a, b) { return +a.getAttribute('data-hero') - +b.getAttribute('data-hero'); });
    items.forEach(function (el, i) {
      if (seen.has(el)) return;
      arm(el);
      reveal(el, 100 + i * 80);
    });
  }

  /* ---------- countdown tick ---------- */
  function watchClock() {
    document.querySelectorAll('[data-clock]').forEach(function (el) {
      if (el.__clockWatched) return;
      el.__clockWatched = true;
      var kind = el.getAttribute('data-clock');
      var last = el.textContent;
      new MutationObserver(function () {
        if (el.textContent === last) return;
        last = el.textContent;
        if (kind === 's') {
          if (REDUCED) return;
          el.animate([{ transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 120, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
        } else if (kind === 'd' && !REDUCED) {
          el.animate([
            { textShadow: '0 0 46px rgba(145,132,217,.55)' },
            { textShadow: '0 0 60px rgba(22,139,255,.95)' },
            { textShadow: '0 0 46px rgba(145,132,217,.55)' },
          ], { duration: 400, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
        }
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ---------- page transitions ---------- */
  function pageIn() {
    if (REDUCED) return;
    var root = document.body;
    root.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
      { duration: 300, easing: ENTER, fill: 'backwards' });
  }

  /* Fires on first load and again whenever bfcache restores this document,
     so the entrance never depends on load/DOMContentLoaded firing again. */
  function enterPage() {
    pageIn();
    heroIn();
  }

  /* The exit animation below holds opacity 0 with fill:'forwards'. If the
     browser bfcaches the page while that hold is in effect (or mid-fade, on
     a hard back/close), the cached snapshot is invisible. Track it so it can
     be cleared before the snapshot is taken and again on restore. */
  var exitAnim = null;

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|https?:)/.test(href)) return;
    if (REDUCED) return;
    e.preventDefault();
    exitAnim = document.body.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-12px)' }],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
    exitAnim.finished.then(function () { window.scrollTo(0, 0); location.href = href; }).catch(function () {});
  });

  /* Never let a page be bfcached mid- or post-fade-out. */
  window.addEventListener('pagehide', function () {
    if (!exitAnim) return;
    try { exitAnim.cancel(); } catch (err) {}
    exitAnim = null;
  });

  /* event.persisted === true means this document is being restored from
     bfcache: DOMContentLoaded/load will NOT fire again, so undo whatever the
     exit animation left behind and re-run the entrance by hand. */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    if (exitAnim) { try { exitAnim.cancel(); } catch (err) {} exitAnim = null; }
    document.body.style.opacity = '';
    document.body.style.transform = '';
    enterPage();
  });

  /* ---------- ambient particles: pause when hidden ---------- */
  function particles() {
    var on = !document.hidden;
    document.querySelectorAll('[data-particle]').forEach(function (p, i) {
      if (REDUCED || (narrow() && i >= 3)) { p.style.display = 'none'; return; }
      p.style.animationPlayState = on ? 'running' : 'paused';
    });
  }

  document.addEventListener('visibilitychange', particles);

  /* ---------- boot: DC streams markup in, so keep scanning briefly ---------- */
  function boot() {
    scan(); watchClock(); particles();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  new MutationObserver(function () { scan(); watchClock(); particles(); })
    .observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('load', enterPage);
  setTimeout(heroIn, 700);
})();

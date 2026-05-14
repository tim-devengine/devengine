(function () {
  'use strict';

  var CORAL = '#C65C44';
  var GRAY  = '#DAD9D9';
  var NS    = 'http://www.w3.org/2000/svg';
  var FLAG  = 'ptt-transition';

  // ── Dot positions ──────────────────────────────────────────────────────
  var START = {
    tl: { x: -18, y: -18, color: GRAY  },
    tr: { x:  18, y: -18, color: CORAL },
    bl: { x: -18, y:  18, color: CORAL },
    br: { x:  18, y:  18, color: GRAY  }
  };

  // END positions derived so each bar has equal stubs on both sides of the
  // crossings (stub ≈ 24.6% of bar, middle ≈ 50.8%, stub ≈ 24.6%).
  // tl/br move (±14, ±43) — near-vertical; tr/bl move (∓43, ±14) — near-horizontal.
  var END = {
    tl: { x:  -4, y:  25 },
    br: { x:   4, y: -25 },
    tr: { x: -25, y:  -4 },
    bl: { x:  25, y:   4 }
  };

  var KEYS = ['tl', 'tr', 'bl', 'br'];

  // ── Build SVG ──────────────────────────────────────────────────────────
  var overlay = document.getElementById('ptt-overlay');
  overlay.innerHTML = '';

  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-80 -80 160 160');
  svg.setAttribute('width',  '160');
  svg.setAttribute('height', '160');
  svg.style.overflow = 'visible';
  overlay.appendChild(svg);

  var lineEls = {};
  var dotEls  = {};

  KEYS.forEach(function (k) {
    var s  = START[k];
    var e  = END[k];
    var dx = e.x - s.x;
    var dy = e.y - s.y;
    var len = Math.sqrt(dx * dx + dy * dy);

    var line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', s.x);
    line.setAttribute('y1', s.y);
    line.setAttribute('x2', e.x);
    line.setAttribute('y2', e.y);
    line.setAttribute('stroke', s.color);
    line.setAttribute('stroke-width', '10');   // matches dot diameter
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-dasharray', len);
    line.setAttribute('stroke-dashoffset', len);
    line._len = len;
    lineEls[k] = line;
    svg.appendChild(line);
  });

  KEYS.forEach(function (k) {
    var s   = START[k];
    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r',    '5');
    dot.setAttribute('cx',   s.x);
    dot.setAttribute('cy',   s.y);
    dot.setAttribute('fill', s.color);
    dotEls[k] = dot;
    svg.appendChild(dot);
  });

  // ── Render progress 0 (square) → 1 (hashtag) ──────────────────────────
  function setProgress(p) {
    KEYS.forEach(function (k) {
      var s = START[k];
      var e = END[k];
      dotEls[k].setAttribute('cx', s.x + (e.x - s.x) * p);
      dotEls[k].setAttribute('cy', s.y + (e.y - s.y) * p);
      lineEls[k].setAttribute('stroke-dashoffset', lineEls[k]._len * (1 - p));
    });
  }

  // ── Easing ────────────────────────────────────────────────────────────
  function ease(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // ── Tween: runs fn(eased 0→1) over ms, calls done when finished ───────
  function tween(ms, fn, done) {
    var t0 = null;
    (function step(ts) {
      if (!t0) t0 = ts;
      var raw = Math.min((ts - t0) / ms, 1);
      fn(ease(raw));
      if (raw < 1) requestAnimationFrame(step);
      else if (done) done();
    }(performance.now()));
  }

  // ── Animation phases ───────────────────────────────────────────────────

  // Click: fade to white and draw hashtag simultaneously, then navigate
  function playEnter(href) {
    setProgress(0);
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'all';

    tween(360, function (t) {
      overlay.style.opacity = t;   // fade to white
      setProgress(t);              // draw hashtag in sync
    }, function () {
      sessionStorage.setItem(FLAG, '1');
      window.location.href = href;
    });
  }

  // New page: hashtag already drawn, retrace and fade out simultaneously
  function playExit() {
    setProgress(1);
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'all';

    setTimeout(function () {
      tween(360, function (t) {
        overlay.style.opacity = 1 - t;   // fade from white
        setProgress(1 - t);              // retrace hashtag in sync
      }, function () {
        overlay.style.pointerEvents = 'none';
      });
    }, 80);
  }

  // Fresh load or bfcache restore: just clear the white screen
  function playFresh() {
    setProgress(0);
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'all';
    setTimeout(function () {
      tween(300, function (t) {
        overlay.style.opacity = 1 - t;
      }, function () {
        overlay.style.pointerEvents = 'none';
      });
    }, 60);
  }

  // ── Intercept internal link clicks ─────────────────────────────────────
  var busy = false;

  document.addEventListener('click', function (e) {
    if (busy) return;
    var a = e.target.closest('a[href]');
    if (!a) return;

    var href = a.getAttribute('href');
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;
    if (a.target && a.target !== '_self') return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    try {
      var url = new URL(href, location.href);
      if (url.origin !== location.origin) return;
    } catch (err) { return; }

    busy = true;
    e.preventDefault();
    playEnter(href);
  });

  // ── On page load decide which animation to run ─────────────────────────
  if (sessionStorage.getItem(FLAG)) {
    sessionStorage.removeItem(FLAG);
    playExit();
  } else {
    playFresh();
  }

  // ── Handle bfcache restore (back/forward button) ───────────────────────
  // When the browser restores a page from cache, JS doesn't re-run and the
  // overlay is frozen at opacity 1 (the state it was in when we navigated
  // away). pageshow with persisted:true catches this and clears it.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      busy = false;
      sessionStorage.removeItem(FLAG);
      playExit();
    }
  });

}());

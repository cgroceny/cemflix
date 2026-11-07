/* Cemflix TV - logo ve açılış introsu */
var Brand = (function () {
  'use strict';

  // "C" halkası + oynat üçgeni. Halka sağa açık, üçgen boşluğa doğru bakar.
  var RING = '<svg class="mk-ring" viewBox="0 0 100 100"><defs><linearGradient id="cfg1" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#ffc061"/><stop offset="1" stop-color="#ff5a1f"/></linearGradient></defs>' +
    '<path d="M80.3 27.5 A38 38 0 1 0 80.3 72.5" fill="none" stroke="url(#cfg1)" stroke-width="13" stroke-linecap="round"/></svg>';
  var PLAY = '<svg class="mk-play" viewBox="0 0 100 100"><path d="M41 33.5 Q41 30 44 31.7 L70 47 Q73 50 70 53 L44 68.3 Q41 70 41 66.5 Z" fill="#fff"/></svg>';

  var uid = 0;
  function mark(cls) {
    var d = document.createElement('div');
    d.className = 'mark' + (cls ? ' ' + cls : '');
    var id = 'cfg' + (++uid);
    d.innerHTML = RING.replace(/cfg1/g, id) + PLAY;
    return d;
  }

  function word(cls) {
    var d = document.createElement('div');
    d.className = 'word' + (cls ? ' ' + cls : '');
    var letters = 'cemflix'.split('');
    for (var i = 0; i < letters.length; i++) {
      var s = document.createElement('span');
      s.textContent = letters[i];
      if (i >= 3) s.className = 'acc';
      s.style.webkitAnimationDelay = s.style.animationDelay = (1.05 + i * 0.075) + 's';
      d.appendChild(s);
    }
    return d;
  }

  function lockup(cls) {
    var d = document.createElement('div');
    d.className = 'lockup ' + (cls || '');
    d.appendChild(mark());
    d.appendChild(word());
    return d;
  }

  // ---------- açılış introsu ----------
  var shownAt = 0, done = false, MIN = 3000;

  function showSplash() {
    shownAt = Date.now();
    var sp = document.getElementById('splash');
    var logo = document.createElement('div');
    logo.className = 'sp-logo';
    logo.appendChild(mark('sp-mark'));
    var w = word('sp-word');
    w.appendChild(document.createElement('i')); // ışık süzmesi
    logo.appendChild(w);
    sp.appendChild(logo);
    var tag = document.createElement('div');
    tag.className = 'sp-tag';
    tag.textContent = 'FİLM  ·  DİZİ  ·  CANLI TV';
    sp.appendChild(tag);
    var bar = document.createElement('div');
    bar.className = 'sp-bar';
    bar.appendChild(document.createElement('i'));
    sp.appendChild(bar);
  }

  function hideSplash() {
    if (done) return;
    done = true;
    var wait = Math.max(0, MIN - (Date.now() - shownAt));
    setTimeout(function () {
      var sp = document.getElementById('splash');
      sp.className = 'out';
      setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 800);
    }, wait);
  }

  function splashVisible() {
    var sp = document.getElementById('splash');
    return !!(sp && sp.parentNode && sp.className !== 'out');
  }

  return { mark: mark, word: word, lockup: lockup, showSplash: showSplash, hideSplash: hideSplash, splashVisible: splashVisible };
})();

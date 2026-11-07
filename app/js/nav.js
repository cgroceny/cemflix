/* Cemflix TV - kumanda tuşları, uzamsal odak yönetimi ve ekran yığını */
var Nav = (function () {
  'use strict';

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, BACKSPACE: 8,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412,
    CHUP: 427, CHDOWN: 428, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, INFO: 457,
    IME_DONE: 65376, IME_CANCEL: 65385, PAGEUP: 33, PAGEDOWN: 34
  };

  var screens = {}, stack = [], cur = null, modals = [];
  var screensRoot, topbar, modalRoot;

  function visible(el) {
    if (!el || !document.body.contains(el)) return false;
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    var p = el;
    while (p && p !== document.body) {
      if (p.classList && p.classList.contains('hidden')) return false;
      p = p.parentNode;
    }
    return true;
  }

  function closestCls(el, cls, stop) {
    while (el && el !== stop && el !== document) {
      if (el.classList && el.classList.contains(cls)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function activeScreen() { return stack.length ? screens[stack[stack.length - 1].name] : null; }

  function roots() {
    if (modals.length) return [modals[modals.length - 1].el];
    var s = activeScreen();
    if (!s) return [];
    var r = [s.el];
    if (s.nav) r.push(topbar);
    return r;
  }

  function candidates() {
    var out = [];
    roots().forEach(function (r) {
      var list = r.querySelectorAll('.f');
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.classList.contains('disabled') && visible(e)) out.push(e);
      }
    });
    return out;
  }

  function ensureVisible(el) {
    var p = el.parentNode;
    while (p && p !== document.body) {
      if (p.classList) {
        var sx = p.classList.contains('sx'), sy = p.classList.contains('sy');
        if (sx || sy) {
          var cr = p.getBoundingClientRect(), er = el.getBoundingClientRect();
          if (sx) {
            var px = p._padX !== undefined ? p._padX : 70;
            if (er.left < cr.left + px) p.scrollLeft -= (cr.left + px - er.left);
            else if (er.right > cr.right - px) p.scrollLeft += (er.right - (cr.right - px));
          }
          if (sy && p._snap) {
            // Odaktaki satırı kabın en üstüne hizala; önceki satır yarım görünmesin
            var rw = el; while (rw && rw.parentNode !== p) rw = rw.parentNode;
            if (rw) p.scrollTop = Math.max(0, rw.offsetTop - (p._padY || 0));
          } else if (sy) {
            var py = p._padY !== undefined ? p._padY : 60;
            if (er.top < cr.top + py) p.scrollTop -= (cr.top + py - er.top);
            else if (er.bottom > cr.bottom - py) p.scrollTop += (er.bottom - (cr.bottom - py));
          }
        }
      }
      p = p.parentNode;
    }
  }

  function focus(el) {
    if (!el) return;
    if (cur && cur !== el) cur.classList.remove('focused');
    cur = el;
    el.classList.add('focused');
    ensureVisible(el);
    var g = closestCls(el.parentNode, 'fgroup');
    if (g) g._last = el;
    if (el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('track')) el.parentNode._last = el;
    if (el._focus) { try { el._focus(el); } catch (e) { console.error(e); } }
  }

  function focusFirst() {
    var s = activeScreen(), target = null;
    if (modals.length) {
      var m = modals[modals.length - 1];
      target = (m.focus && visible(m.focus)) ? m.focus : m.el.querySelector('.f');
    } else if (s && s.defaultFocus) target = s.defaultFocus();
    if (!target || !visible(target)) target = candidates()[0];
    if (target) focus(target);
  }

  function okF(n) { return n && n.classList && n.classList.contains('f') && !n.classList.contains('disabled') && visible(n); }
  function sib(el, d) {
    var n = el;
    do { n = d > 0 ? n.nextElementSibling : n.previousElementSibling; } while (n && !okF(n));
    return n;
  }
  // Hızlı yol: satır içinde yatay, listede dikey, ızgarada geçiş doğrudan komşuya.
  // (Binlerce öğede her basışta tüm ekranı ölçmek TV'de gecikme yapıyordu.)
  // Kenarda (satır/liste sonu) odak yerinde kalır: yanlışlıkla başka sütuna ya da üst menüye kaçmaz.
  var STAY = {};
  function isVList(cl) { return cl.contains('cats') || cl.contains('chans') || cl.contains('panel-list') || cl.contains('tcol') || cl.contains('set-box'); }
  function fastMove(dir) {
    var par = cur.parentNode, cl = par && par.classList;
    if (!cl) return null;
    var h = dir === 'left' || dir === 'right', d = (dir === 'right' || dir === 'down') ? 1 : -1, n;
    // Yatay satırlar (ana sayfa, benzer içerikler, bölümler): uçta dur
    if (h && (cl.contains('track') || cl.contains('eps'))) return sib(cur, d) || STAY;
    // Dikey listeler (kategoriler, kanallar, ayarlar, menü sütunları)
    if (!h && isVList(cl) && (cur.classList.contains('li') || cur.classList.contains('ch') || cur.classList.contains('set-row'))) {
      n = sib(cur, d);
      if (n) return n;
      // Listenin sonunda dur; başında ekrandaysa üst menüye çıkılabilsin (pencerede dur)
      if (d > 0) return STAY;
      return modals.length ? STAY : null;
    }
    if (cl.contains('grid')) {
      var kids = par.children, idx = -1, cols = 0, top0 = kids.length ? kids[0].offsetTop : 0;
      for (var i = 0; i < kids.length; i++) { if (kids[i] === cur) idx = i; if (kids[i].offsetTop === top0) cols++; }
      if (idx < 0 || !cols) return null;
      var col = idx % cols;
      if (h) {
        if (d < 0) return col === 0 ? null : (okF(kids[idx - 1]) ? kids[idx - 1] : null);   // ilk sütundan sola: kategorilere
        return (col === cols - 1 || idx === kids.length - 1) ? STAY : (okF(kids[idx + 1]) ? kids[idx + 1] : STAY);
      }
      var t = idx + d * cols;
      if (t < 0) return null;   // ilk satırdan yukarı: sıralama / üst menü
      if (t >= kids.length) { var lastRowStart = kids.length - ((kids.length % cols) || cols); return idx < lastRowStart ? kids[kids.length - 1] : STAY; }
      return okF(kids[t]) ? kids[t] : STAY;
    }
    return null;
  }

  function move(dir) {
    if (!cur || !visible(cur) || roots().every(function (r) { return !r.contains(cur); })) { focusFirst(); return; }
    if (cur._move && cur._move(dir)) return;
    var fm = fastMove(dir);
    if (fm === STAY) return;
    if (fm) { focus(fm); return; }
    var r = cur.getBoundingClientRect();
    var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    var best = null, bestScore = Infinity, T = 6;
    candidates().forEach(function (c) {
      if (c === cur) return;
      var b = c.getBoundingClientRect(), primary, orth, center;
      var bcx = (b.left + b.right) / 2, bcy = (b.top + b.bottom) / 2;
      if (dir === 'right' || dir === 'left') {
        if (dir === 'right') { if (!(bcx > cx + T && b.left > r.left + T)) return; primary = Math.max(0, b.left - r.right); }
        else { if (!(bcx < cx - T && b.right < r.right - T)) return; primary = Math.max(0, r.left - b.right); }
        if (b.bottom > r.top && b.top < r.bottom) orth = 0;
        else orth = Math.min(Math.abs(b.top - r.bottom), Math.abs(r.top - b.bottom));
        center = Math.abs(bcy - cy);
      } else {
        if (dir === 'down') { if (!(bcy > cy + T && b.top > r.top + T)) return; primary = Math.max(0, b.top - r.bottom); }
        else { if (!(bcy < cy - T && b.bottom < r.bottom - T)) return; primary = Math.max(0, r.top - b.bottom); }
        if (b.right > r.left && b.left < r.right) orth = 0;
        else orth = Math.min(Math.abs(b.left - r.right), Math.abs(r.left - b.right));
        center = Math.abs(bcx - cx);
      }
      var score = primary + orth * 4 + center * 0.15;
      if (score < bestScore) { bestScore = score; best = c; }
    });
    if (!best) return;
    // Satır hafızası: başka bir satıra geçerken o satırda en son kalınan karta dön
    var bt = best.parentNode;
    if (bt && bt.classList && bt.classList.contains('track') && bt !== cur.parentNode && bt._last && bt._last !== best && bt.contains(bt._last) && visible(bt._last)) best = bt._last;
    var g = closestCls(best.parentNode, 'fgroup');
    if (g && g !== closestCls(cur.parentNode, 'fgroup') && g._pref) {
      var p = g._pref();
      if (p && visible(p) && g.contains(p)) best = p;
    }
    focus(best);
  }

  // ---------- ekranlar ----------
  function register(name, s) {
    s.name = name;
    screens[name] = s;
    s.el.classList.add('screen');
    screensRoot.appendChild(s.el);
  }

  function setVisible(name) {
    Object.keys(screens).forEach(function (n) {
      screens[n].el.classList.toggle('active', n === name);
    });
    var s = screens[name];
    topbar.classList.toggle('hidden', !s.nav);
    if (s.nav) {
      U.$$('.tab', topbar).forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === (s.tab || name)); });
    }
  }

  function go(name, params) {
    if (stack.length) stack[stack.length - 1].focus = cur;
    stack.push({ name: name, params: params || {} });
    setVisible(name);
    cur && cur.classList.remove('focused');
    cur = null;
    var s = screens[name];
    if (s.show) s.show(params || {});
    if (!cur) focusFirst();
  }

  function root(name, params) {
    while (stack.length) {
      var s = screens[stack.pop().name];
      if (s.hide) s.hide();
    }
    closeAllModals();
    go(name, params);
  }

  function pop() {
    if (stack.length < 2) return false;
    var top = stack.pop();
    if (screens[top.name].hide) screens[top.name].hide();
    var e = stack[stack.length - 1];
    setVisible(e.name);
    var s = screens[e.name];
    cur && cur.classList.remove('focused');
    cur = null;
    if (s.resume) s.resume(e.params);
    if (!cur) {
      if (e.focus && visible(e.focus)) focus(e.focus);
      else focusFirst();
    }
    return true;
  }

  function back() {
    if (modals.length) { closeModal(); return; }
    var s = activeScreen();
    if (s && s.back && s.back()) return;
    if (pop()) return;
    if (s && s.name !== 'home' && s.name !== 'login') { root('home'); return; }
    confirm('Cemflix\'ten çıkmak istiyor musunuz?', 'Çık', exitApp);
  }

  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { U.toast('Çıkış'); }
  }

  // ---------- modallar ----------
  function openModal(el, opts) {
    opts = opts || {};
    var m = { el: el, prev: cur, onClose: opts.onClose, focus: opts.focus, key: opts.key };
    modals.push(m);
    modalRoot.appendChild(el);
    modalRoot.classList.add('show');
    cur && cur.classList.remove('focused');
    cur = null;
    focusFirst();
    return m;
  }

  function closeModal() {
    var m = modals.pop();
    if (!m) return;
    if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
    if (!modals.length) modalRoot.classList.remove('show');
    cur && cur.classList.remove('focused');
    cur = null;
    if (m.prev && visible(m.prev)) focus(m.prev); else focusFirst();
    if (m.onClose) m.onClose();
  }

  function closeAllModals() {
    while (modals.length) {
      var m = modals.pop();
      if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
    }
    modalRoot.classList.remove('show');
  }

  function confirm(text, yes, onYes) {
    var h = U.h;
    var box = h('div', { class: 'dialog' }, [
      h('div', { class: 'dialog-text', text: text }),
      h('div', { class: 'dialog-btns' }, [
        h('div', { class: 'btn f', text: 'Vazgeç', _enter: function () { closeModal(); } }),
        h('div', { class: 'btn primary f', text: yes, _enter: function () { closeModal(); onYes(); } })
      ])
    ]);
    openModal(h('div', { class: 'modal center' }, [box]));
  }

  // ---------- tuş işleme ----------
  function onKey(e) {
    var k = e.keyCode;
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
      if (k === 13 || k === KEY.IME_DONE || k === KEY.IME_CANCEL || k === KEY.BACK || k === KEY.ESC || k === 38 || k === 40) {
        e.preventDefault();
        ae.blur();
        if (ae._done && (k === 13 || k === KEY.IME_DONE)) ae._done();
      }
      return;
    }
    if (Brand.splashVisible()) { e.preventDefault(); return; }
    if (U.$('#loader').className === 'show' && k !== KEY.BACK) { e.preventDefault(); return; }

    // Basılı tutulan ok tuşu: TV'de tuş tekrarları birikip gecikme yapmasın diye seyrelt
    if (k >= 37 && k <= 40) {
      var now = Date.now();
      if (e.repeat && now - lastArrow < 95) { e.preventDefault(); return; }
      lastArrow = now;
    }
    var m = modals.length ? modals[modals.length - 1] : null;
    var s = activeScreen();
    if (m && m.key && m.key(k, e)) { e.preventDefault(); return; }
    if (!m && s && s.key && s.key(k, e)) { e.preventDefault(); return; }

    switch (k) {
      case KEY.LEFT: move('left'); break;
      case KEY.RIGHT: move('right'); break;
      case KEY.UP: move('up'); break;
      case KEY.DOWN: move('down'); break;
      // CH+ / CH− ve Sayfa tuşları: listelerde hızlı ilerleme (bir sayfa)
      case KEY.CHUP: case KEY.PAGEUP: pageMove('up'); break;
      case KEY.CHDOWN: case KEY.PAGEDOWN: pageMove('down'); break;
      case KEY.ENTER:
        if (cur && visible(cur) && cur._long) {
          // Uzun basış destekleyen öğe: kısa basış bırakınca, uzun basış 700 ms sonra
          if (!press) {
            var el = cur;
            el.classList.add('pressing');
            press = { el: el, t: setTimeout(function () {
              press = null;
              el.classList.remove('pressing');
              if (visible(el)) el._long(el);
            }, 700) };
          }
        } else if (cur && visible(cur) && cur._enter) cur._enter(cur);
        else if (!cur) focusFirst();
        break;
      case KEY.BACK: case KEY.ESC: case KEY.BACKSPACE: back(); break;
      default: return;
    }
    e.preventDefault();
  }

  var lastArrow = 0;
  function pageMove(dir) {
    var start = cur;
    for (var i = 0; i < 7; i++) { var before = cur; move(dir); if (cur === before) break; }
    if (cur === start) return;
  }

  var press = null;
  function onKeyUp(e) {
    if (e.keyCode !== KEY.ENTER || !press) return;
    clearTimeout(press.t);
    var el = press.el;
    press = null;
    el.classList.remove('pressing');
    if (visible(el) && el._enter) el._enter(el);
    e.preventDefault();
  }

  function init(sr, tb, mr) {
    screensRoot = sr; topbar = tb; modalRoot = mr;
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    // fare ile kullanım (geliştirme / Samsung işaretçi kumanda)
    document.addEventListener('mouseover', function (e) {
      var el = closestCls(e.target, 'f');
      if (el && el !== cur && roots().some(function (r) { return r.contains(el); })) focus(el);
    });
    document.addEventListener('click', function (e) {
      var el = closestCls(e.target, 'f');
      if (el && el._enter && roots().some(function (r) { return r.contains(el); })) { focus(el); el._enter(el); }
    });
  }

  return {
    KEY: KEY, init: init, register: register, go: go, root: root, back: back, pop: pop,
    focus: focus, focusFirst: focusFirst, move: move, current: function () { return cur; },
    openModal: openModal, closeModal: closeModal, confirm: confirm, visible: visible,
    active: activeScreen, exitApp: exitApp, hasModal: function () { return modals.length > 0; }
  };
})();

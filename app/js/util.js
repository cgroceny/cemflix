/* Cemflix TV - yardımcılar ve kalıcı depolama (ES5, Tizen 3.0 uyumlu) */
var U = (function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // h('div', {class:'x', text:'..', _enter: fn}, [children])
  function h(tag, attrs, children) {
    var e = document.createElement(tag), k, v;
    if (attrs) {
      for (k in attrs) {
        if (!attrs.hasOwnProperty(k)) continue;
        v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k.charAt(0) === '_') e[k] = v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children !== undefined && children !== null) {
      if (!Array.isArray(children)) children = [children];
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c === null || c === undefined || c === false) continue;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return e;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    return (hh ? hh + ':' + pad(mm) : mm) + ':' + pad(ss);
  }

  function fmtClock(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function fmtDuration(min) {
    min = Math.round(min || 0);
    if (!min) return '';
    var hh = Math.floor(min / 60), mm = min % 60;
    return (hh ? hh + ' sa ' : '') + (mm ? mm + ' dk' : '');
  }

  function b64(s) {
    if (!s) return '';
    try { return decodeURIComponent(escape(atob(s))); } catch (e) {
      try { return atob(s); } catch (e2) { return s; }
    }
  }

  // Türkçe karakter duyarsız arama için sadeleştirme
  var FOLD = { 'İ': 'i', 'I': 'i', 'ı': 'i', 'Ş': 's', 'ş': 's', 'Ğ': 'g', 'ğ': 'g', 'Ü': 'u', 'ü': 'u', 'Ö': 'o', 'ö': 'o', 'Ç': 'c', 'ç': 'c', 'Â': 'a', 'â': 'a', 'Î': 'i', 'î': 'i', 'Û': 'u', 'û': 'u' };
  function fold(s) {
    return String(s || '').replace(/[İIıŞşĞğÜüÖöÇçÂâÎîÛû]/g, function (c) { return FOLD[c]; }).toLowerCase();
  }

  function initials(name) {
    var w = String(name || '?').replace(/[^\wÀ-ſ ]/g, ' ').trim().split(/\s+/);
    return ((w[0] || '?').charAt(0) + (w[1] ? w[1].charAt(0) : '')).toUpperCase();
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, ms || 3000);
  }

  function loading(on, text) {
    var l = $('#loader');
    $('#loader-text').textContent = text || '';
    l.className = on ? 'show' : '';
  }

  function spinner() { return h('div', { class: 'spin-wrap' }, [h('div', { class: 'spin' })]); }

  return {
    $: $, $$: $$, h: h, clear: clear, debounce: debounce, fmtTime: fmtTime, fmtClock: fmtClock,
    fmtDuration: fmtDuration, b64: b64, fold: fold, initials: initials, toast: toast,
    loading: loading, spinner: spinner, pad: pad
  };
})();

/* Kalıcı veri: hesap, Listem, izleme ilerlemesi, ayarlar */
var Store = (function () {
  'use strict';
  var P = 'cemflix.';
  function get(k, d) {
    try { var v = localStorage.getItem(P + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
  }
  function set(k, v) {
    try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { }
  }

  // ---- profiller: her profilin kendi Listem'i, izleme geçmişi ve son kanalları ----
  // "main" profili eski (öneksiz) anahtarları kullanır; mevcut veriler korunur.
  var profiles = get('profiles', [{ id: 'main', name: 'Ana profil', kids: false, color: 0 }]);
  // Gizli profil: sabit, silinemez; hiçbir izleme verisi diske yazılmaz.
  // Uygulama yeniden açıldığında gizli oturum sürmez, ana profile dönülür.
  var INC = { id: 'incognito', name: 'Gizli', kids: false, priv: true, color: 7 };
  var curProfile = get('curProfile', 'main');
  if (curProfile === 'incognito' || !profiles.some(function (p) { return p.id === curProfile; })) curProfile = 'main';
  function isPriv() { return curProfile === INC.id; }
  // Profil verisini kaydet (gizli profilde yalnızca bellekte kalır)
  function sp(k, v) { if (!isPriv()) set(k, v); }
  function pk(k, id) { id = id || curProfile; return id === 'main' ? k : 'p.' + id + '.' + k; }

  var favs, progress, seriesLast, recent;
  function loadProfile() {
    if (isPriv()) { favs = []; progress = {}; seriesLast = {}; recent = { live: [], search: [] }; return; }
    favs = get(pk('favs'), []);
    progress = get(pk('progress'), {});
    seriesLast = get(pk('seriesLast'), {});
    recent = get(pk('recent'), { live: [], search: [] });
  }
  loadProfile();
  var settings = get('settings', {});
  var DEF = {
    liveExt: 'ts', autoNext: true, hero: true, display: 'PLAYER_DISPLAY_MODE_LETTER_BOX', buffer: 'normal',
    adultHide: true, pin: '', audioLang: 'tr', subLang: 'tr', subSize: 'm', subBg: 'shadow',
    startup: 'home', saver: '10', theme: 'dark', hideLang: [], hideCat: {}
  };

  function slim(item) {
    // Listem/ilerleme için öğenin küçük bir kopyası
    var o = {};
    ['type', 'id', 'name', 'poster', 'catId', 'ext', 'rating', 'url', 'year', 'genre', 'plot', 'backdrop', 'num', 'epgId', 'archive', 'added'].forEach(function (k) {
      if (item[k] !== undefined && item[k] !== '') o[k] = item[k];
    });
    return o;
  }

  return {
    account: function () { return get('account', null); },
    setAccount: function (a) { set('account', a); },
    lastLogin: function () { return get('lastLogin', {}); },
    setLastLogin: function (a) { set('lastLogin', a); },
    accInfo: function () { return get('accInfo', null); },
    setAccInfo: function (i) { set('accInfo', i); },

    // ---- profiller ----
    profiles: function () { return profiles.slice(); },
    profile: function () { return isPriv() ? INC : (profiles.filter(function (p) { return p.id === curProfile; })[0] || profiles[0]); },
    privateProfile: function () { return INC; },
    isPrivate: isPriv,
    isKids: function () { var p = this.profile(); return !!(p && p.kids); },
    useProfile: function (id) { curProfile = id; if (id !== INC.id) set('curProfile', id); loadProfile(); },
    addProfile: function (name, kids) {
      var used = {}; profiles.forEach(function (p) { used[p.color] = 1; });
      var color = 0; while (used[color] && color < 7) color++;
      var p = { id: 'p' + Date.now().toString(36), name: name, kids: !!kids, color: color };
      profiles.push(p); set('profiles', profiles);
      return p;
    },
    updateProfile: function (id, fields) {
      profiles.forEach(function (p) { if (p.id === id) for (var k in fields) if (fields.hasOwnProperty(k)) p[k] = fields[k]; });
      set('profiles', profiles);
    },
    removeProfile: function (id) {
      if (id === 'main') return;
      profiles = profiles.filter(function (p) { return p.id !== id; });
      set('profiles', profiles);
      ['favs', 'progress', 'seriesLast', 'recent'].forEach(function (k) { try { localStorage.removeItem(P + pk(k, id)); } catch (e) { } });
      if (curProfile === id) this.useProfile('main');
    },

    setting: function (k) { return settings[k] === undefined ? DEF[k] : settings[k]; },
    setSetting: function (k, v) { settings[k] = v; set('settings', settings); },

    favs: function (type) {
      return type ? favs.filter(function (f) { return f.type === type; }) : favs.slice();
    },
    isFav: function (item) {
      for (var i = 0; i < favs.length; i++) if (favs[i].type === item.type && favs[i].id === item.id) return true;
      return false;
    },
    toggleFav: function (item) {
      for (var i = 0; i < favs.length; i++) {
        if (favs[i].type === item.type && favs[i].id === item.id) { favs.splice(i, 1); sp(pk('favs'), favs); return false; }
      }
      favs.unshift(slim(item)); sp(pk('favs'), favs); return true;
    },

    progress: function (key) { return progress[key] || null; },
    setProgress: function (key, entry) {
      if (isPriv()) return; // gizli: kaldığı yer / izlendi bilgisi tutulmaz
      entry.ts = Date.now();
      if (entry.item) entry.item = slim(entry.item);
      if (entry.series) entry.series = slim(entry.series);
      progress[key] = entry;
      var keys = Object.keys(progress);
      if (keys.length > 300) {
        keys.sort(function (a, b) { return progress[a].ts - progress[b].ts; });
        for (var i = 0; i < keys.length - 300; i++) delete progress[keys[i]];
      }
      sp(pk('progress'), progress);
    },
    continueList: function () {
      var seen = {}, out = [];
      Object.keys(progress).map(function (k) { return progress[k]; })
        .sort(function (a, b) { return b.ts - a.ts; })
        .forEach(function (e) {
          if (e.kind === 'movie' && !e.done) out.push(e);
          if (e.kind === 'episode' && e.series && !seen[e.series.id]) {
            seen[e.series.id] = 1;
            if (!e.done || e.hasNext) out.push(e);
          }
        });
      return out.slice(0, 30);
    },
    seriesLast: function (id) { return seriesLast[id] || null; },
    setSeriesLast: function (id, epId) { if (isPriv()) return; seriesLast[id] = epId; sp(pk('seriesLast'), seriesLast); },
    // Son izlenen kanallar ve son aramalar (en yeni başta)
    recentLive: function () { return recent.live.slice(); },
    addRecentLive: function (item) {
      if (isPriv()) return;
      recent.live = [slim(item)].concat(recent.live.filter(function (x) { return x.id !== item.id; })).slice(0, 15);
      sp(pk('recent'), recent);
    },
    recentSearch: function () { return recent.search.slice(); },
    addRecentSearch: function (q) {
      q = String(q || '').trim();
      if (q.length < 2 || isPriv()) return;
      recent.search = [q].concat(recent.search.filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); })).slice(0, 8);
      sp(pk('recent'), recent);
    },
    clearRecentSearch: function () { recent.search = []; sp(pk('recent'), recent); },

    // "İzlemeye devam et"ten çıkar: film için ilerleme, dizi için tüm bölümlerin ilerlemesi
    removeContinue: function (e) {
      Object.keys(progress).forEach(function (k) {
        var p = progress[k];
        if (e.kind === 'movie' && p.kind === 'movie' && p.item && p.item.id === e.item.id) delete progress[k];
        if (e.kind === 'episode' && p.kind === 'episode' && p.series && p.series.id === e.series.id) delete progress[k];
      });
      if (e.kind === 'episode') { delete seriesLast[e.series.id]; sp(pk('seriesLast'), seriesLast); }
      sp(pk('progress'), progress);
    },
    clearHistory: function () { progress = {}; seriesLast = {}; sp(pk('progress'), progress); sp(pk('seriesLast'), seriesLast); },
    logout: function () { set('account', null); set('accInfo', null); }
  };
})();

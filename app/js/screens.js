/* Cemflix TV - ekranlar */
var Screens = (function () {
  'use strict';
  var h = U.h, $ = U.$, clear = U.clear;

  // ================= ortak bileşenler =================
  function img(url, cls) {
    var wrap = h('div', { class: cls });
    if (url && /^(https?:|data:)/i.test(url)) {
      var im = new Image();
      im.onload = function () { im.className = 'ok'; };
      im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
      im.src = url;
      wrap.appendChild(im);
    }
    return wrap;
  }

  function poster(url, name, cls) {
    var w = img(url, cls || 'poster');
    w.insertBefore(h('div', { class: 'ph', text: U.initials(name) }), w.firstChild);
    return w;
  }

  function fmtRating(r) { r = +r || 0; return r ? (r > 10 ? (r / 10) : r).toFixed(1) : ''; }

  // Alt kısımdaki tuş ipuçları
  function setHints(text) {
    var el = document.getElementById('hints');
    if (el) el.textContent = text || '';
  }

  // Son 7 günde eklenen içerik
  function isNew(item) { return item.added && (Date.now() / 1000 - item.added) < 7 * 86400; }

  // Yayın akışı: kanal başına 3 dakikalık önbellek
  var epgCache = {};
  function epgCached(item) {
    var c = epgCache[item.id];
    if (c && Date.now() - c.t < 180000) return c.p;
    var p = Data.epg(item);
    epgCache[item.id] = { t: Date.now(), p: p };
    return p;
  }

  // "2019 · Dram · ★ 7.2 · 1 sa 45 dk" gibi bilgi satırı
  function metaLine(i, extra) {
    var m = [];
    if (i.year) m.push(i.year);
    if (i.genre) m.push(String(i.genre).split(/\s*[,/]\s*/).slice(0, 2).join(', '));
    if (i.rating) m.push('★ ' + fmtRating(i.rating));
    if (i.duration) m.push(U.fmtDuration(i.duration));
    return m.concat(extra || []).join('  ·  ');
  }

  function card(item, o) {
    o = o || {};
    var p = poster(item.poster, item.name, item.type === 'live' ? 'poster logo' : 'poster');
    if (item.rating && item.type !== 'live') p.appendChild(h('div', { class: 'badge', text: '★ ' + fmtRating(item.rating) }));
    // İzlenme durumu: film izlendiyse rozet, yarım kaldıysa ilerleme; dizide kalınan bölüm
    var watched = null;
    if (item.type === 'movie') watched = Store.progress('movie:' + item.id);
    if (watched && watched.done) p.appendChild(h('div', { class: 'badge done', text: '✓ İzlendi' }));
    else if (isNew(item)) p.appendChild(h('div', { class: 'badge new', text: 'YENİ' }));
    var label = o.label, prog = o.progress;
    if (item.type === 'series' && label === undefined) {
      var lastEp = Store.seriesLast(item.id), ep = lastEp && Store.progress('ep:' + lastEp);
      if (ep && ep.ep) { label = 'S' + ep.ep.season + ' · B' + ep.ep.num + (ep.done ? ' ✓' : ''); if (prog === undefined && !ep.done && ep.dur) prog = ep.pos / ep.dur; }
    }
    if (prog === undefined && watched && !watched.done && watched.dur) prog = watched.pos / watched.dur;
    if (label) p.appendChild(h('div', { class: 'clabel', text: label }));
    if (prog !== undefined) p.appendChild(h('div', { class: 'pbar' }, [h('i', { style: 'width:' + Math.round(Math.min(1, prog) * 100) + '%' })]));
    return h('div', {
      class: 'card f' + (item.type === 'live' ? ' wide' : ''),
      _enter: o.enter || function () { openItem(item); },
      _focus: o.focus,
      _long: o.long
    }, [p, h('div', { class: 'ctitle', text: item.name })]);
  }

  // Yatay "izlemeye devam et" kartı: görsel + başlık + kalan süre + ilerleme
  function contCard(item, o) {
    var p = h('div', { class: 'poster' });
    var src = item.backdrop || item.poster;
    if (src) p.appendChild(img(src, ''));
    else p.appendChild(h('div', { class: 'ph', text: U.initials(item.name) }));
    p.appendChild(h('div', { class: 'cc-shade' }));
    p.appendChild(h('div', { class: 'cc-play', text: '▶' }));
    p.appendChild(h('div', { class: 'cc-info' }, [
      h('div', { class: 'cc-title', text: item.name }),
      o.sub ? h('div', { class: 'cc-sub', text: o.sub }) : null
    ]));
    if (o.progress !== undefined) p.appendChild(h('div', { class: 'pbar' }, [h('i', { style: 'width:' + Math.round(Math.min(1, o.progress) * 100) + '%' })]));
    return h('div', { class: 'card f cont', _enter: o.enter || function () { openItem(item); }, _focus: o.focus, _long: o.long }, [p]);
  }

  // ---- uzun basışla listeden çıkarma ----
  // Silmeden sonra aynı satırda yakın karta odaklan
  function refocusRow(rowsEl, title, idx) {
    var rowEl = null;
    U.$$('.row', rowsEl).forEach(function (r) { var t = $('.row-title', r); if (!rowEl && t && t.textContent.indexOf(title) === 0) rowEl = r; });
    var cards = rowEl ? U.$$('.card.f', rowEl) : [];
    if (cards.length) Nav.focus(cards[Math.min(idx, cards.length - 1)]);
    else Nav.focusFirst();
  }

  function cardPos(el) {
    var rowEl = el.parentNode; while (rowEl && !(rowEl.classList && rowEl.classList.contains('row'))) rowEl = rowEl.parentNode;
    var title = rowEl ? $('.row-title', rowEl).textContent : '';
    return { title: title.split('  ·')[0], idx: rowEl ? U.$$('.card.f', rowEl).indexOf(el) : 0 };
  }

  function askRemoveFav(item, rowsEl, rebuild) {
    return function (el) {
      var pos = cardPos(el);
      Nav.confirm('"' + item.name + '" ' + (item.type === 'live' ? 'favori kanallardan' : 'Listem\'den') + ' çıkarılsın mı?', 'Çıkar', function () {
        if (Store.isFav(item)) Store.toggleFav(item);
        rebuild();
        refocusRow(rowsEl, pos.title, pos.idx);
        U.toast(item.type === 'live' ? 'Favori kanallardan çıkarıldı' : 'Listem\'den çıkarıldı');
      });
    };
  }

  function askRemoveCont(entry, rowsEl, rebuild) {
    var it = entry.item || entry.series;
    return function (el) {
      var pos = cardPos(el);
      Nav.confirm('"' + it.name + '" izlemeye devam et listesinden kaldırılsın mı? İzleme ilerlemesi silinir.', 'Kaldır', function () {
        Store.removeContinue(entry);
        rebuild();
        refocusRow(rowsEl, pos.title, pos.idx);
        U.toast('İzlemeye devam et listesinden kaldırıldı');
      });
    };
  }

  function seeAll(label, enter) {
    return h('div', { class: 'card f more', _enter: enter }, [
      h('div', { class: 'poster' }, [h('div', { class: 'more-in' }, [h('div', { class: 'more-arrow', text: '→' }), h('div', { text: label })])])
    ]);
  }

  function openItem(item, list) {
    if (item.type === 'movie') Nav.go('movie', { item: item });
    else if (item.type === 'series') Nav.go('series', { item: item });
    else if (item.type === 'live') playLive(list || [item], list ? list.indexOf(item) : 0);
  }

  function playLive(list, index) {
    Nav.go('player', { kind: 'live', list: list, index: Math.max(0, index) });
  }

  // Yavaş TV'ler için parça parça doldurulan ızgara/liste
  function fillLazy(container, items, make, chunk) {
    chunk = chunk || 42;
    clear(container);
    var n = 0;
    function more() {
      var end = Math.min(items.length, n + chunk);
      var frag = document.createDocumentFragment();
      for (var i = n; i < end; i++) {
        (function (idx) {
          var el = make(items[idx], idx);
          var prev = el._focus;
          el._focus = function (e) { if (prev) prev(e); if (idx > n - 14 && n < items.length) more(); };
          frag.appendChild(el);
        })(i);
      }
      n = end;
      container.appendChild(frag);
    }
    more();
  }

  function row(title, items, opts) {
    opts = opts || {};
    var track = h('div', { class: 'track' });
    var r = h('div', { class: 'row' }, [h('div', { class: 'row-title', text: title }), h('div', { class: 'track-wrap sx' }, [track])]);
    if (items) items.forEach(function (it) { track.appendChild(it); });
    r._track = track;
    return r;
  }

  function emptyMsg(t) { return h('div', { class: 'empty', text: t }); }

  // ================= üst menü =================
  var TABS = [['home', 'Ana Sayfa'], ['live', 'Canlı TV'], ['movies', 'Filmler'], ['seriesList', 'Diziler'], ['search', 'Ara'], ['mylist', 'Listem'], ['settings', 'Ayarlar']];

  function buildTopbar(tb) {
    var tabs = h('div', { class: 'tabs fgroup' });
    TABS.forEach(function (t) {
      tabs.appendChild(h('div', { class: 'tab f', 'data-tab': t[0], text: t[1], _enter: function () { Nav.root(t[0]); } }));
    });
    tabs._pref = function () { return $('.tab.active', tabs); };
    var clock = h('div', { class: 'clock' });
    var accDays = h('div', { class: 'acc-days' });
    // Etkin profil: OK ile "Kim izliyor?" ekranına geçilir
    var prof = h('div', { class: 'prof-chip f', _enter: function () { guardKids(function () { Nav.root('profiles'); }); } });
    function tick() { clock.textContent = U.fmtClock(new Date()); }
    tick(); setInterval(tick, 15000);
    tb.appendChild(Brand.lockup('logo'));
    tb.appendChild(tabs);
    tb.appendChild(accDays);
    tb.appendChild(prof);
    tb.appendChild(clock);
  }

  function refreshProfChip() {
    var el = document.querySelector('#topbar .prof-chip');
    if (!el) return;
    var p = Store.profile();
    clear(el);
    el.appendChild(avatar(p, 'avatar tiny'));
    el.appendChild(h('span', { text: p.name }));
  }

  // Üst menüde hesabın kalan süresi
  function refreshAccDays() {
    var el = document.querySelector('#topbar .acc-days');
    if (!el) return;
    var i = Store.accInfo() || {};
    el.className = 'acc-days';
    if (!i.exp_date) { el.textContent = ''; return; }
    var days = Math.ceil((+i.exp_date * 1000 - Date.now()) / 86400000);
    if (days < 0) { el.textContent = 'Hesap süresi doldu'; el.className += ' warn'; return; }
    el.textContent = 'Hesap: ' + days + ' gün';
    if (days <= 7) el.className += ' warn';
  }

  // ================= giriş =================
  function makeLogin() {
    var s = { el: h('div', { class: 'login' }) };
    var mode = 'xtream';
    function field(label, ph, type) {
      var input = h('input', { type: type || 'text', placeholder: ph, autocomplete: 'off', spellcheck: 'false' });
      var f = h('div', { class: 'field f', _enter: function () { input.focus(); } }, [h('label', { text: label }), input]);
      f._input = input;
      return f;
    }
    var fServer = field('Sunucu adresi', 'http://ornek-sunucu.com:8080');
    var fUser = field('Kullanıcı adı', '');
    var fPass = field('Şifre', '', 'password');
    var fUrl = field('M3U bağlantısı', 'http://.../get.php?username=...&password=...&type=m3u_plus');
    var err = h('div', { class: 'login-err' });
    var help = h('div', { class: 'login-help' });
    var HELP = {
      qr: 'En kolay yol: bilgileri kumandayla yazmak yerine telefonunuzdan girin.',
      xtream: 'Sunucu adresi, kullanıcı adı ve şifre IPTV sağlayıcınızın gönderdiği mesajda yer alır. Adres genelde port içerir (ör. :8080).',
      m3u: 'Sağlayıcınızın verdiği, http ile başlayan tek satırlık liste bağlantısını girin. get.php içeren bağlantılar Xtream hesabı olarak açılır (daha hızlı).'
    };
    function friendly(msg) {
      if (/bağlanılamadı|yanıt vermedi/i.test(msg)) return msg + '. Sunucu adresini ve port numarasını kontrol edin (ör. http://alanadi.com:8080).';
      if (/geçersiz yanıt/i.test(msg)) return msg + '. Adres bir Xtream sunucusu değil gibi görünüyor; M3U bağlantısıyla deneyin.';
      if (/HTTP 40[13]/.test(msg)) return 'Sunucu erişimi reddetti (' + msg + '). Hesap bilgilerini veya hesap süresini kontrol edin.';
      return msg;
    }
    var tabX = h('div', { class: 'seg f', text: 'Xtream Codes', _enter: function () { setMode('xtream'); } });
    var tabM = h('div', { class: 'seg f', text: 'M3U Bağlantısı', _enter: function () { setMode('m3u'); } });
    var tabQ = h('div', { class: 'seg f', text: 'Telefonla (QR)', _enter: function () { setMode('qr'); } });
    var xBox = h('div', {}, [fServer, fUser, fPass]);
    var mBox = h('div', {}, [fUrl]);
    var btn = h('div', { class: 'btn primary wide f', text: 'Giriş yap', _enter: submit });

    // ---- QR ile giriş ----
    var qrImg = h('div', { class: 'qr-img' });
    var qrStatus = h('div', { class: 'qr-status' });
    var qrNew = h('div', { class: 'btn f hidden', text: 'Yeni QR kodu', _enter: function () { startQr(); } });
    var qBox = h('div', { class: 'qr-wrap' }, [
      qrImg,
      h('div', { class: 'qr-text' }, [
        h('div', { class: 'qr-title', text: 'Telefonunuzla giriş yapın' }),
        h('div', { class: 'qr-steps' }, [
          h('div', { text: '1. Telefonun kamerasıyla QR kodu okutun.' }),
          h('div', { text: '2. Açılan sayfada hesap bilgilerinizi girin.' }),
          h('div', { text: '3. "TV\'ye gönder"e dokunun; giriş otomatik yapılır.' })
        ]),
        qrStatus,
        qrNew
      ])
    ]);

    function qrState(st) {
      if (mode !== 'qr') return;
      qrStatus.className = 'qr-status' + (st === 'ready' ? ' ok' : '');
      if (st === 'ready') qrStatus.textContent = '● Telefondan bilgi bekleniyor…';
      else if (st === 'waiting') qrStatus.textContent = 'Bağlantı kuruluyor…';
      else if (st === 'expired') {
        qrStatus.textContent = 'QR kodunun süresi doldu.';
        qrImg.classList.add('expired');
        qrNew.classList.remove('hidden');
      }
    }

    function startQr() {
      qrNew.classList.add('hidden');
      qrImg.classList.remove('expired');
      qrStatus.className = 'qr-status';
      qrStatus.textContent = 'Bağlantı kuruluyor…';
      clear(qrImg);
      try {
        var url = QrLogin.start(function (c) {
          if (c.type === 'xtream') {
            fServer._input.value = c.server; fUser._input.value = c.user; fPass._input.value = c.pass;
          } else {
            fUrl._input.value = c.url;
          }
          setMode(c.type);
          U.toast('Bilgiler telefondan alındı');
          submit();
        }, qrState);
        qrImg.appendChild(h('img', { src: QrLogin.image(url), alt: 'QR' }));
      } catch (e) {
        qrStatus.textContent = 'QR oluşturulamadı: ' + (e.message || e);
      }
    }
    [fServer, fUser, fPass, fUrl].forEach(function (f) { f._input._done = function () { }; });
    fPass._input._done = submit;
    fUrl._input._done = submit;

    function setMode(m) {
      var was = mode;
      mode = m;
      tabX.classList.toggle('sel', m === 'xtream');
      tabM.classList.toggle('sel', m === 'm3u');
      tabQ.classList.toggle('sel', m === 'qr');
      xBox.classList.toggle('hidden', m !== 'xtream');
      mBox.classList.toggle('hidden', m !== 'm3u');
      qBox.classList.toggle('hidden', m !== 'qr');
      btn.classList.toggle('hidden', m === 'qr');
      help.textContent = HELP[m] || '';
      err.textContent = '';
      if (m === 'qr' && was !== 'qr') startQr();
      else if (m !== 'qr') QrLogin.stop();
    }

    function submit() {
      var a;
      if (mode === 'xtream') {
        a = { type: 'xtream', server: fServer._input.value, user: fUser._input.value.trim(), pass: fPass._input.value };
        if (!a.server.trim() || !a.user || !a.pass) { err.textContent = 'Lütfen tüm alanları doldurun.'; return; }
      } else {
        a = { type: 'm3u', url: fUrl._input.value.trim() };
        if (!/^https?:\/\//i.test(a.url)) { err.textContent = 'Geçerli bir http(s) bağlantısı girin.'; return; }
      }
      err.textContent = '';
      U.loading(true, 'Hesap kontrol ediliyor…');
      Data.login(a).then(function (r) {
        U.loading(false);
        Store.setAccount(r.account);
        Store.setAccInfo(r.info);
        Store.setLastLogin({ mode: mode, server: fServer._input.value, user: fUser._input.value, url: fUrl._input.value });
        Data.setAccount(r.account);
        if (r.parsed) Data.useParsed(r.parsed);
        Nav.root('home');
      }, function (e) {
        U.loading(false);
        err.textContent = friendly(e.message || 'Giriş yapılamadı');
      });
    }

    s.el.appendChild(h('div', { class: 'login-box' }, [
      Brand.lockup('login-logo'),
      h('div', { class: 'login-sub', text: 'IPTV hesabınızla filmler, diziler ve canlı yayınlar' }),
      h('div', { class: 'segs' }, [tabQ, tabX, tabM]),
      help, xBox, mBox, qBox, err, btn,
      h('div', { class: 'login-note', text: 'Cemflix içerik barındırmaz. Hesap bilgileriniz yalnızca bu TV\'de saklanır.' })
    ]));

    s.show = function () {
      var l = Store.lastLogin();
      fServer._input.value = l.server || '';
      fUser._input.value = l.user || '';
      fUrl._input.value = l.url || '';
      fPass._input.value = '';
      mode = '';
      setMode(l.mode || 'qr');
      setHints('◀ ▶ ▲ ▼ gezin     OK seç / yaz     Geri: çıkış');
    };
    s.hide = function () { QrLogin.stop(); };
    s.defaultFocus = function () { return mode === 'xtream' ? fServer : mode === 'qr' ? tabQ : fUrl; };
    return s;
  }

  // ================= ana sayfa =================
  function makeHome() {
    var s = { nav: true, el: h('div', { class: 'home' }) };
    var hero = h('div', { class: 'hero' });
    var rows = h('div', { class: 'rows sy' });
    rows._padY = 0;
    rows._snap = true;
    s.el.appendChild(hero);
    s.el.appendChild(rows);
    var built = false, focusedItem = null;

    var setHero = U.debounce(function (item, extra) {
      if (!Store.setting('hero')) return;
      clear(hero);
      if (!item) return;
      var bg = item.backdrop || item.poster;
      hero.appendChild(img(bg, 'hero-bg' + (item.backdrop ? '' : ' blur')));
      hero.appendChild(h('div', { class: 'hero-shade' }));
      var meta = [];
      if (item.year) meta.push(item.year);
      if (item.genre) meta.push(item.genre);
      if (item.rating) meta.push('★ ' + fmtRating(item.rating));
      if (extra) meta.push(extra);
      hero.appendChild(h('div', { class: 'hero-info' }, [
        h('div', { class: 'hero-kind', text: item.type === 'series' ? 'DİZİ' : item.type === 'movie' ? 'FİLM' : 'CANLI' }),
        h('div', { class: 'hero-title', text: item.name }),
        h('div', { class: 'hero-meta', text: meta.join('  ·  ') }),
        item.plot ? h('div', { class: 'hero-plot', text: item.plot }) : null
      ]));
      if (item.type === 'movie' && !item.plot) {
        var my = item;
        Data.movieInfo(item).then(function (i) {
          if (focusedItem !== my) return;
          var plot = $('.hero-plot', hero) || hero.querySelector('.hero-info').appendChild(h('div', { class: 'hero-plot' }));
          plot.textContent = i.plot || '';
          if (i.backdrop) {
            var bgEl = $('.hero-bg', hero);
            var nb = img(i.backdrop, 'hero-bg');
            hero.replaceChild(nb, bgEl);
          }
          var m2 = [];
          if (i.year) m2.push(i.year);
          if (i.genre) m2.push(i.genre);
          if (i.duration) m2.push(U.fmtDuration(i.duration));
          if (i.rating) m2.push('★ ' + fmtRating(i.rating));
          $('.hero-meta', hero).textContent = m2.join('  ·  ');
        });
      }
    }, 300);

    function hcard(item, o) {
      o = o || {};
      var f = o.focus;
      o.focus = function () { focusedItem = item; setHero(item, o.heroExtra); if (f) f(); };
      return o.cont ? contCard(item, o) : card(item, o);
    }

    var builtAt = 0;
    function build() {
      builtAt = Date.now();
      clear(rows);
      hero.classList.toggle('hidden', !Store.setting('hero'));
      rows.classList.toggle('full', !Store.setting('hero'));
      // İzlemeye devam et
      var cont = Store.continueList();
      if (cont.length) {
        var cr = row('İzlemeye devam et', cont.map(function (e) {
          var rm = askRemoveCont(e, rows, build);
          var left = e.dur && !e.done ? Math.max(1, Math.round((e.dur - e.pos) / 60000)) + ' dk kaldı' : '';
          if (e.kind === 'movie') {
            return hcard(e.item, { cont: true, sub: left || 'Devam et', progress: e.dur ? e.pos / e.dur : 0, heroExtra: left, long: rm });
          }
          var lab = 'S' + e.ep.season + ' · B' + e.ep.num;
          return hcard(e.series, { cont: true, sub: (e.done ? 'Sıradaki: ' : '') + lab + (left ? '  ·  ' + left : ''), progress: e.done ? 0 : (e.dur ? e.pos / e.dur : 0), heroExtra: lab, long: rm });
        }));
        cr.classList.add('row-cont');
        rows.appendChild(cr);
      }
      var favs = Store.favs().filter(function (f) { return f.type !== 'live'; });
      if (favs.length) rows.appendChild(row('Listem', favs.slice(0, 30).map(function (f) { return hcard(f, { long: askRemoveFav(f, rows, build) }); })));
      // Kanallarım: önce favoriler, sonra son izlenenler (tek, kısa satır)
      var favLive = Store.favs('live'), recentLive = Store.recentLive();
      var seenCh = {}, chList = [];
      favLive.concat(recentLive).forEach(function (c) { if (!seenCh[c.id]) { seenCh[c.id] = 1; chList.push(c); } });
      chList = chList.slice(0, 30);
      if (chList.length) {
        var chr = row(favLive.length ? 'Kanallarım' : 'Son izlenen kanallar', chList.map(function (f) {
          var el = card(f, { enter: function () { playLive(chList, chList.indexOf(f)); }, long: Store.isFav(f) ? askRemoveFav(f, rows, build) : null });
          if (Store.isFav(f)) $('.poster', el).appendChild(h('div', { class: 'badge fav', text: '★' }));
          $('.poster', el).appendChild(h('div', { class: 'live-dot', text: 'CANLI' }));
          return el;
        }));
        chr.classList.add('row-ch');
        rows.appendChild(chr);
      }

      // Akıllı satırlar: tüm kütüphaneden son eklenenler ve en yüksek puanlılar
      function smartRow(title, type, pick) {
        var r = row(title, [h('div', { class: 'card skeleton' })]);
        rows.appendChild(r);
        Data.all(type).then(function (items) {
          var list = pick(items);
          if (list.length < 4) { if (r.parentNode) r.parentNode.removeChild(r); return; }
          clear(r._track);
          list.forEach(function (it) { r._track.appendChild(hcard(it)); });
          var rtt = $('.row-title', r); if (rtt) rtt.appendChild(h('span', { class: 'row-count', text: String(list.length) }));
        }, function () { if (r.parentNode) r.parentNode.removeChild(r); });
      }
      function topBy(key, n) {
        return function (items) {
          return items.filter(function (i) { return i[key] > 0; }).sort(function (a, b) { return b[key] - a[key]; }).slice(0, n);
        };
      }
      smartRow('Son eklenen filmler', 'movie', topBy('added', 24));
      smartRow('En yüksek puanlı filmler', 'movie', topBy('rating', 24));
      smartRow('Yeni bölüm gelen diziler', 'series', topBy('added', 24));

      Promise.all([Data.cats('movie').then(null, function () { return []; }), Data.cats('series').then(null, function () { return []; })]).then(function (r) {
        var mc = r[0].slice(0, 6), sc = r[1].slice(0, 6), plan = [];
        for (var i = 0; i < 6; i++) {
          if (mc[i]) plan.push(['movie', mc[i]]);
          if (sc[i]) plan.push(['series', sc[i]]);
        }
        if (!plan.length && !rows.children.length) rows.appendChild(emptyMsg('Bu hesapta film veya dizi bulunamadı. Canlı TV sekmesine göz atın.'));
        plan.forEach(function (p) {
          var type = p[0], c = p[1];
          var r2 = row((type === 'movie' ? 'Filmler · ' : 'Diziler · ') + c.name, [h('div', { class: 'card skeleton' })]);
          rows.appendChild(r2);
          Data.list(type, c.id).then(function (items) {
            if (!items.length) { r2.parentNode && r2.parentNode.removeChild(r2); return; }
            var hadFocus = r2.contains(Nav.current());
            clear(r2._track);
            items.slice(0, 24).forEach(function (it) { r2._track.appendChild(hcard(it)); });
            var rt2 = $('.row-title', r2); if (rt2) rt2.appendChild(h('span', { class: 'row-count', text: String(items.length) }));
            if (items.length > 24) r2._track.appendChild(seeAll('Tümünü gör (' + items.length + ')', function () {
              Nav.root(type === 'movie' ? 'movies' : 'seriesList', { cat: c.id });
            }));
            var c = Nav.current();
            var auto = !c || c.classList.contains('tab') || c === rows._autoEl;
            if (Nav.active() === s && !Nav.hasModal() && (hadFocus || (Date.now() - builtAt < 8000 && auto))) {
              Nav.focusFirst();
              rows._autoEl = Nav.current();
            }
            if (!focusedItem && items[0]) setHero(items[0]);
          }, function () { r2.parentNode && r2.parentNode.removeChild(r2); });
        });
      });
      var first = cont[0] ? (cont[0].item || cont[0].series) : favs[0];
      if (first) setHero(first);
      built = true;
    }

    s.show = function () {
      focusedItem = null; build(); refreshAccDays(); refreshProfChip();
      setHints('◀ ▶ ▲ ▼ gezin     OK aç     Listem / devam et: OK basılı tut = çıkar     Geri: çıkış');
    };
    s.resume = function () {
      // Oynatıcıdan dönüşte "devam et" satırını tazele
      var cur = Nav.current();
      build();
      void cur;
    };
    s.defaultFocus = function () { return $('.card.f', rows); };
    return s;
  }

  // ================= kategori + ızgara (Filmler / Diziler) =================
  function makeBrowse(type) {
    var s = { nav: true, el: h('div', { class: 'browse' }) };
    var cats = h('div', { class: 'cats sy fgroup' });
    var title = h('div', { class: 'gtitle' });
    var grid = h('div', { class: 'grid' });
    var right = h('div', { class: 'gridwrap sy' }, [grid]);
    right._padY = 80;

    // Başlık + sıralama + odaklanılan içeriğin bilgisi
    var SORTS = [['def', 'Varsayılan'], ['new', 'Yeni eklenen'], ['rate', 'Puan'], ['az', 'A–Z']];
    var sortKey = Store.setting('sort_' + type) || 'def';
    var sortBar = h('div', { class: 'sortbar fgroup' });
    var sortEls = {};
    SORTS.forEach(function (o) {
      var el = h('div', { class: 'seg small f' + (o[0] === sortKey ? ' sel' : ''), text: o[1], _enter: function () { setSort(o[0]); } });
      sortEls[o[0]] = el;
      sortBar.appendChild(el);
    });
    sortBar._pref = function () { return sortEls[sortKey]; };
    var giName = h('div', { class: 'gi-name' }), giMeta = h('div', { class: 'gi-meta' }), giPlot = h('div', { class: 'gi-plot' });
    var ginfo = h('div', { class: 'ginfo' }, [giName, giMeta, giPlot]);
    var head = h('div', { class: 'ghead' }, [h('div', { class: 'ghead-top' }, [title, sortBar]), ginfo]);

    s.el.appendChild(cats);
    s.el.appendChild(head);
    s.el.appendChild(right);
    var loaded = false, selEl = null, curCat = null, req = 0, catEls = {}, curItems = [], curName = '', focusReq = 0;
    cats._pref = function () { return selEl; };

    function sorted(items) {
      var a = items.slice();
      if (sortKey === 'new') a.sort(function (x, y) { return (y.added || 0) - (x.added || 0); });
      else if (sortKey === 'rate') a.sort(function (x, y) { return (y.rating || 0) - (x.rating || 0); });
      else if (sortKey === 'az') a.sort(function (x, y) { return U.fold(x.name) < U.fold(y.name) ? -1 : 1; });
      return a;
    }

    function setSort(k) {
      if (sortEls[sortKey]) sortEls[sortKey].classList.remove('sel');
      sortKey = k; sortEls[k].classList.add('sel');
      Store.setSetting('sort_' + type, k);
      if (curItems.length) { right.scrollTop = 0; fillGrid(); }
    }

    function fillGrid() {
      fillLazy(grid, sorted(curItems), function (it) {
        var el = card(it, { focus: function () { showInfo(it); } });
        // İlk sıradan yukarı: üst menü yerine sıralama düğmeleri
        el._move = function (dir) {
          if (dir !== 'up' || !grid.firstChild || el.offsetTop > grid.firstChild.offsetTop) return false;
          Nav.focus(sortEls[sortKey]);
          return true;
        };
        return el;
      });
    }

    var showInfo = U.debounce(function (it) {
      var my = ++focusReq;
      giName.textContent = it.name;
      giMeta.textContent = metaLine(it, isNew(it) ? ['Yeni eklendi'] : []);
      giPlot.textContent = it.plot || '';
      if (type === 'movie' && !Data.isM3U()) {
        Data.movieInfo(it).then(function (i) {
          if (my !== focusReq) return;
          giMeta.textContent = metaLine({ year: i.year || it.year, genre: i.genre, rating: i.rating || it.rating, duration: i.duration }, isNew(it) ? ['Yeni eklendi'] : []);
          giPlot.textContent = i.plot || '';
        });
      }
    }, 250);

    function clearInfo(text) { giName.textContent = ''; giMeta.textContent = ''; giPlot.textContent = text || ''; }

    function select(c, el, toGrid) {
      if (curCat === c.id && grid.children.length && !grid.querySelector('.spin-wrap')) {
        if (toGrid) Nav.focus($('.card', grid));
        return;
      }
      curCat = c.id;
      if (selEl) selEl.classList.remove('sel');
      selEl = el; el.classList.add('sel');
      title.textContent = c.name;
      curName = c.name; curItems = [];
      clearInfo('');
      clear(grid).appendChild(U.spinner());
      right.scrollTop = 0;
      var my = ++req;
      var p = c.id === '__fav' ? Promise.resolve(Store.favs(type)) : c.id === '__cont' ? Promise.resolve(contItems()) : Data.list(type, c.id);
      p.then(function (items) {
        if (my !== req) return;
        title.textContent = c.name + '  ·  ' + items.length + (type === 'movie' ? ' film' : ' dizi');
        if (!items.length) { clear(grid).appendChild(emptyMsg(c.id === '__fav' ? 'Listenize henüz bir şey eklemediniz.' : 'Bu kategoride içerik yok.')); return; }
        curItems = items;
        var fresh = items.filter(isNew).length;
        clearInfo('▶ tuşuyla içeriklere geçin. Odaklandığınız içeriğin yılı, türü, puanı ve özeti burada görünür.' + (fresh ? '  Bu kategoride son 7 günde ' + fresh + ' yeni içerik var.' : ''));
        fillGrid();
        if (toGrid) Nav.focus($('.card', grid));
      }, function (e) {
        if (my !== req) return;
        clear(grid).appendChild(emptyMsg('Yüklenemedi: ' + e.message));
      });
    }

    function contItems() {
      return Store.continueList().filter(function (e) { return type === 'movie' ? e.kind === 'movie' : e.kind === 'episode'; })
        .map(function (e) { return e.item || e.series; });
    }

    var delayed = U.debounce(function (c, el) { if (Nav.current() === el) select(c, el, false); }, 450);

    function load(params) {
      clear(cats).appendChild(U.spinner());
      Data.cats(type).then(function (list) {
        clear(cats);
        var all = [{ id: '__cont', name: 'İzlemeye devam et' }, { id: '__fav', name: 'Listem' }].concat(list);
        if (!list.length && Store.isKids()) U.toast('Çocuk profili: sağlayıcıda bu bölüm için çocuk kategorisi bulunamadı', 4000);
        all.forEach(function (c) {
          var el = h('div', {
            class: 'li f' + (c.id.charAt(0) === '_' ? ' special' : ''), text: c.name, _cid: c.id,
            _long: c.id.charAt(0) === '_' ? null : askHideCat(type, c, function () { load(); }),
            _focus: function (e) { delayed(c, e); },
            _enter: function (e) { select(c, e, true); }
          });
          catEls[c.id] = el;
          cats.appendChild(el);
        });
        loaded = true;
        var startId = (params && params.cat && catEls[params.cat]) ? params.cat : (list[0] ? list[0].id : '__fav');
        var startC = all.filter(function (c) { return c.id === startId; })[0];
        select(startC, catEls[startId], !!(params && params.cat));
        if (!(params && params.cat)) Nav.focus(catEls[startId]);
      }, function (e) {
        clear(cats).appendChild(h('div', { class: 'li f', text: 'Tekrar dene', _enter: function () { load(params); } }));
        U.toast('Kategoriler yüklenemedi: ' + e.message);
        Nav.focusFirst();
      });
    }

    s.show = function (params) {
      setHints('▲ ▼ kategori seç     ▶ içeriğe geç     CH + / CH − sayfa atla     Kategoride OK basılı tut: gizle');
      if (!loaded) { load(params); return; }
      if (params && params.cat && catEls[params.cat]) {
        var el = catEls[params.cat];
        select({ id: params.cat, name: el.textContent }, el, true);
      } else if (curCat === '__fav' || curCat === '__cont') {
        curCat = null;
        select({ id: selEl._cid || '__fav', name: selEl.textContent }, selEl, false);
      }
    };
    s.defaultFocus = function () { return selEl || $('.li', cats); };
    s.reset = function () { loaded = false; curCat = null; selEl = null; clear(grid); clear(cats); };
    return s;
  }

  // ================= canlı TV =================
  function makeLive() {
    var s = { nav: true, el: h('div', { class: 'live' }) };
    var cats = h('div', { class: 'cats sy fgroup' });
    var chans = h('div', { class: 'chans sy fgroup' });
    var info = h('div', { class: 'linfo' });
    chans._pref = function () { return chans._last && chans.contains(chans._last) ? chans._last : $('.ch', chans); };
    s.el.appendChild(cats); s.el.appendChild(chans); s.el.appendChild(info);
    var loaded = false, selEl = null, curCat = null, req = 0, curList = [];
    cats._pref = function () { return selEl; };

    var showInfo = U.debounce(function (item) {
      clear(info);
      var fav = Store.isFav(item);
      info.appendChild(img(item.poster, 'linfo-logo'));
      info.appendChild(h('div', { class: 'linfo-name', text: item.name }));
      var epgBox = h('div', { class: 'epg' }, [h('div', { class: 'muted', text: 'Yayın akışı yükleniyor…' })]);
      info.appendChild(epgBox);
      var favBtn = h('div', {
        class: 'btn f', text: fav ? '★ Favorilerden çıkar' : '☆ Favorilere ekle', _enter: function () {
          var on = Store.toggleFav(item);
          favBtn.textContent = on ? '★ Favorilerden çıkar' : '☆ Favorilere ekle';
          U.toast(on ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
        }
      });
      info.appendChild(h('div', { class: 'linfo-btns' }, [
        h('div', { class: 'btn primary f', text: '▶ İzle', _enter: function () { playLive(curList, curList.indexOf(item)); } }),
        item.archive ? h('div', { class: 'btn f', text: '↺ Geri izle', _enter: function () { openCatchup(item); } }) : null,
        favBtn
      ]));
      if (item.archive) info.insertBefore(h('div', { class: 'cu-badge', text: '↺ ' + item.archive + ' gün geri izlenebilir' }), epgBox);
      epgCached(item).then(function (list) {
        clear(epgBox);
        if (!list.length) { epgBox.appendChild(h('div', { class: 'muted', text: 'Yayın akışı bilgisi yok' })); return; }
        list.slice(0, 3).forEach(function (e, i) {
          var now = Date.now(), pr = i === 0 && e.start < now ? (now - e.start) / (e.end - e.start) : -1;
          epgBox.appendChild(h('div', { class: 'epg-item' + (i === 0 ? ' now' : '') }, [
            h('div', { class: 'epg-time', text: U.fmtClock(new Date(e.start)) + ' – ' + U.fmtClock(new Date(e.end)) + (i === 0 && pr >= 0 ? '  ŞİMDİ' : '') }),
            h('div', { class: 'epg-title', text: e.title }),
            pr >= 0 ? h('div', { class: 'pbar inline' }, [h('i', { style: 'width:' + Math.round(pr * 100) + '%' })]) : null,
            i === 0 && e.desc ? h('div', { class: 'epg-desc', text: e.desc }) : null
          ]));
        });
      });
    }, 350);

    function select(c, el, toList) {
      if (curCat === c.id && chans.children.length && !chans.querySelector('.spin-wrap')) { if (toList) Nav.focus($('.ch', chans)); return; }
      curCat = c.id;
      if (selEl) selEl.classList.remove('sel');
      selEl = el; el.classList.add('sel');
      clear(chans).appendChild(U.spinner());
      chans.scrollTop = 0;
      var my = ++req;
      var p = c.id === '__fav' ? Promise.resolve(Store.favs('live')) : c.id === '__recent' ? Promise.resolve(Store.recentLive()) : Data.list('live', c.id);
      p.then(function (items) {
        if (my !== req) return;
        curList = items;
        if (!items.length) {
          clear(chans).appendChild(emptyMsg(c.id === '__fav' ? 'Henüz favori kanal yok. Bir kanala gelip sağdaki "Favorilere ekle" düğmesini kullanın.' : c.id === '__recent' ? 'Henüz kanal izlemediniz. İzlediğiniz son 15 kanal burada görünür.' : 'Kanal yok'));
          clear(info);
          return;
        }
        var epgQueue = [];
        fillLazy(chans, items, function (it, i) {
          var now = h('div', { class: 'ch-now' });
          var bar = h('i');
          var prog = h('div', { class: 'ch-prog hidden' }, [bar]);
          epgQueue.push({ it: it, now: now, prog: prog, bar: bar });
          return h('div', {
            class: 'ch f', _focus: function () { showInfo(it); },
            _enter: function () { playLive(items, i); }
          }, [
            h('span', { class: 'ch-num', text: String(it.num || i + 1) }), img(it.poster, 'ch-logo'),
            h('div', { class: 'ch-main' }, [h('div', { class: 'ch-name', text: it.name }), now, prog]),
            it.archive ? h('span', { class: 'ch-arc', text: '↺' }) : null,
            Store.isFav(it) ? h('span', { class: 'ch-fav', text: '★' }) : null
          ]);
        }, 60);
        loadNowPlaying(epgQueue, my);
        if (toList) Nav.focus($('.ch', chans));
        else showInfo(items[0]);
      }, function (e) { if (my === req) clear(chans).appendChild(emptyMsg('Yüklenemedi: ' + e.message)); });
    }

    // Listedeki kanalların "şimdi" bilgisini aynı anda en fazla 3 istekle doldur
    function loadNowPlaying(queue, my) {
      if (Data.isM3U()) return;
      queue = queue.slice(0, 40);
      var idx = 0;
      function next() {
        if (my !== req || idx >= queue.length) return;
        var q = queue[idx++];
        epgCached(q.it).then(function (l) {
          if (my !== req) return;
          var e = l[0], t = Date.now();
          if (e && e.start <= t) {
            q.now.textContent = e.title + '  ·  ' + U.fmtClock(new Date(e.end)) + "'e kadar";
            q.bar.style.width = Math.round((t - e.start) / (e.end - e.start) * 100) + '%';
            q.prog.classList.remove('hidden');
          } else if (e) q.now.textContent = U.fmtClock(new Date(e.start)) + '  ' + e.title;
          next();
        }, next);
      }
      next(); next(); next();
    }

    var delayed = U.debounce(function (c, el) { if (Nav.current() === el) select(c, el, false); }, 450);

    function load() {
      clear(cats).appendChild(U.spinner());
      Data.cats('live').then(function (list) {
        clear(cats);
        var all = [{ id: '__fav', name: '★ Favori kanallar' }, { id: '__recent', name: '↺ Son izlenenler' }].concat(list);
        var firstEl = null, firstC = null;
        var startIdx = Store.favs('live').length ? 0 : Store.recentLive().length ? 1 : (all.length > 2 ? 2 : 0);
        all.forEach(function (c, i) {
          var el = h('div', { class: 'li f' + (i < 2 ? ' special' : ''), text: c.name, _long: i < 2 ? null : askHideCat('live', c, load), _focus: function (e) { delayed(c, e); }, _enter: function (e) { select(c, e, true); } });
          cats.appendChild(el);
          if (i === startIdx) { firstEl = el; firstC = c; }
        });
        loaded = true;
        if (firstEl) { select(firstC, firstEl, false); Nav.focus(firstEl); }
      }, function (e) {
        clear(cats).appendChild(h('div', { class: 'li f', text: 'Tekrar dene', _enter: load }));
        U.toast('Kanallar yüklenemedi: ' + e.message);
        Nav.focusFirst();
      });
    }

    s.show = function () {
      setHints('▲ ▼ kanal seç     CH + / CH − sayfa atla     OK izle     Kategoride OK basılı tut: gizle');
      if (!loaded) load();
    };
    s.defaultFocus = function () { return selEl || $('.li', cats); };
    s.reset = function () { loaded = false; curCat = null; selEl = null; clear(chans); clear(info); };
    return s;
  }

  // ================= geri izle (catch-up) =================
  var DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  function dayLabel(t) {
    var d = new Date(t), today = new Date();
    var d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    var diff = Math.round((t0 - d0) / 86400000);
    if (diff === 0) return 'Bugün';
    if (diff === 1) return 'Dün';
    return DAYS[d.getDay()] + '  ' + U.pad(d.getDate()) + '.' + U.pad(d.getMonth() + 1);
  }

  function playCatchup(item, e) {
    Nav.go('player', { kind: 'catchup', item: item, prog: e, url: Data.url('timeshift', { id: item.id, prog: e }), alt: Data.timeshiftAlt({ id: item.id, prog: e }), title: item.name, start: 0 });
  }

  function makeCatchup() {
    var s = { nav: true, tab: 'live', el: h('div', { class: 'live catchup' }) };
    var days = h('div', { class: 'cats sy fgroup' });
    var progs = h('div', { class: 'chans sy fgroup' });
    var info = h('div', { class: 'linfo' });
    s.el.appendChild(days); s.el.appendChild(progs); s.el.appendChild(info);
    var item = null, groups = [], selDay = null, req = 0;
    days._pref = function () { return selDay; };
    progs._pref = function () { return progs._last && progs.contains(progs._last) ? progs._last : $('.ch', progs); };

    var showProg = U.debounce(function (e) {
      clear(info);
      var now = Date.now(), live = e.end > now;
      info.appendChild(img(item.poster, 'linfo-logo'));
      info.appendChild(h('div', { class: 'cu-chan', text: item.name + '  ·  ' + item.archive + ' günlük arşiv' }));
      info.appendChild(h('div', { class: 'linfo-name', text: e.title }));
      info.appendChild(h('div', { class: 'cu-time', text: dayLabel(e.start) + '  ·  ' + U.fmtClock(new Date(e.start)) + ' – ' + U.fmtClock(new Date(e.end)) + '  ·  ' + U.fmtDuration((e.end - e.start) / 60000) + (live ? '  ·  ŞİMDİ YAYINDA' : '') }));
      if (e.desc) info.appendChild(h('div', { class: 'epg-desc', text: e.desc }));
      info.appendChild(h('div', { class: 'linfo-btns' }, [
        h('div', { class: 'btn primary f', text: live ? '↺ Baştan izle' : '▶ İzle', _enter: function () { playCatchup(item, e); } }),
        h('div', { class: 'btn f', text: '● Canlıya dön', _enter: function () { playLive([item], 0); } })
      ]));
    }, 200);

    function selectDay(g, el, toList) {
      if (selDay) selDay.classList.remove('sel');
      selDay = el; el.classList.add('sel');
      progs.scrollTop = 0;
      fillLazy(progs, g.items, function (e) {
        var now = Date.now(), live = e.end > now;
        return h('div', { class: 'ch f cu-row' + (live ? ' now' : ''), _focus: function () { showProg(e); }, _enter: function () { playCatchup(item, e); } }, [
          h('span', { class: 'cu-clock', text: U.fmtClock(new Date(e.start)) }),
          h('div', { class: 'ch-main' }, [
            h('div', { class: 'ch-name', text: e.title }),
            h('div', { class: 'ch-now', text: (live ? 'ŞİMDİ YAYINDA · baştan izlenebilir' : U.fmtDuration((e.end - e.start) / 60000)) })
          ])
        ]);
      }, 60);
      if (toList) Nav.focus($('.ch', progs)); else showProg(g.items[0]);
    }

    function load() {
      var my = ++req;
      clear(days).appendChild(U.spinner()); clear(progs); clear(info);
      Data.archive(item).then(function (list) {
        if (my !== req) return;
        clear(days);
        if (!list.length) {
          progs.appendChild(emptyMsg('Bu kanal için arşivde program bulunamadı. Sağlayıcı arşivi kapatmış ya da yayın akışı göndermiyor olabilir.'));
          days.appendChild(h('div', { class: 'li f', text: '● Canlıya dön', _enter: function () { playLive([item], 0); } }));
          Nav.focusFirst();
          return;
        }
        // Günlere ayır (en yeni gün başta)
        groups = [];
        var byKey = {};
        list.forEach(function (e) {
          var k = dayLabel(e.start);
          if (!byKey[k]) { byKey[k] = { name: k, items: [] }; groups.push(byKey[k]); }
          byKey[k].items.push(e);
        });
        groups.forEach(function (g) {
          var el = h('div', { class: 'li f', text: g.name + '  (' + g.items.length + ')', _focus: function (e) { if (selDay !== e) selectDay(g, e, false); }, _enter: function (e) { selectDay(g, e, true); } });
          days.appendChild(el);
        });
        selectDay(groups[0], days.firstChild, false);
        Nav.focus(days.firstChild);
      }, function (e) {
        if (my !== req) return;
        clear(days).appendChild(h('div', { class: 'li f', text: 'Tekrar dene', _enter: load }));
        U.toast('Arşiv yüklenemedi: ' + e.message);
        Nav.focusFirst();
      });
    }

    s.show = function (p) {
      setHints('▲ ▼ gün / program seç     ▶ programlar     OK izle     Geri: canlı TV');
      if (p && p.item && (!item || p.item.id !== item.id)) { item = p.item; load(); }
    };
    s.defaultFocus = function () { return selDay || $('.li', days); };
    return s;
  }

  // Canlı yayındaki programı baştan başlat (oynatıcıdan çağrılır)
  function startOverLive(item) {
    U.loading(true, 'Program başı aranıyor…');
    Data.archive(item).then(function (list) {
      U.loading(false);
      var now = Date.now(), e = list.filter(function (x) { return x.start <= now && x.end > now; })[0];
      if (!e) { U.toast('Bu programın başı arşivde yok'); return; }
      Nav.pop();
      playCatchup(item, e);
    }, function (err) { U.loading(false); U.toast('Arşiv yüklenemedi: ' + err.message); });
  }

  function openCatchup(item) {
    if (!item.archive) { U.toast('Bu kanalda geri izleme yok'); return; }
    Nav.go('catchup', { item: item });
  }

  // ================= detay: film =================
  function detailFrame(info, item) {
    var el = h('div', { class: 'detail-in' });
    el.appendChild(img(info.backdrop || info.poster || item.poster, 'd-bg' + (info.backdrop ? '' : ' blur')));
    el.appendChild(h('div', { class: 'd-shade' }));
    var meta = [];
    if (info.year) meta.push(info.year);
    if (info.genre) meta.push(info.genre);
    if (info.duration) meta.push(U.fmtDuration(info.duration));
    if (info.country) meta.push(info.country);
    // Bilgi rozetleri: sezon/bölüm sayısı, dosya biçimi, bitiş saati
    var facts = [];
    if (info.seasons && info.seasons.length) {
      var epCount = 0;
      info.seasons.forEach(function (sn) { epCount += sn.episodes.length; });
      facts.push(info.seasons.length + ' sezon');
      facts.push(epCount + ' bölüm');
    }
    var ext = info.ext || item.ext;
    if (ext && item.type === 'movie') facts.push(String(ext).toUpperCase());
    if (info.duration && item.type === 'movie') facts.push('Şimdi başlarsa ' + U.fmtClock(new Date(Date.now() + info.duration * 60000)) + "'de biter");
    if (isNew(item)) facts.push('Yeni eklendi');
    var body = h('div', { class: 'd-body' }, [
      poster(info.poster || item.poster, item.name, 'poster d-poster'),
      h('div', { class: 'd-text' }, [
        h('div', { class: 'd-title', text: info.title || item.name }),
        info.originalTitle && info.originalTitle !== info.title ? h('div', { class: 'd-orig', text: info.originalTitle }) : null,
        h('div', { class: 'd-meta' }, [
          info.rating ? h('span', { class: 'd-rate', text: '★ ' + fmtRating(info.rating) }) : null,
          h('span', { text: meta.join('  ·  ') })
        ]),
        facts.length ? h('div', { class: 'd-facts' }, facts.map(function (f) { return h('span', { text: f }); })) : null,
        info.plot ? h('div', { class: 'd-plot', text: info.plot }) : null,
        info.director ? h('div', { class: 'd-credit' }, [h('b', { text: 'Yönetmen  ' }), info.director]) : null,
        info.cast ? h('div', { class: 'd-credit' }, [h('b', { text: 'Oyuncular  ' }), String(info.cast).split(',').slice(0, 6).join(',')]) : null,
        h('div', { class: 'd-btns' })
      ])
    ]);
    el.appendChild(body);
    return el;
  }

  // ---- künye ve fragman ----
  function fmtDate(d) {
    if (!d) return '';
    if (typeof d === 'number') { var x = new Date(d * 1000); return U.pad(x.getDate()) + '.' + U.pad(x.getMonth() + 1) + '.' + x.getFullYear(); }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    return m ? m[3] + '.' + m[2] + '.' + m[1] : String(d);
  }

  function openTrailer(id) {
    if (typeof tizen !== 'undefined' && tizen.application && tizen.ApplicationControl) {
      try {
        // Samsung TV'deki YouTube uygulamasında videoyu aç
        var ac = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', null, null, null,
          [new tizen.ApplicationControlData('PAYLOAD', [JSON.stringify({ values: 'v=' + id })])]);
        tizen.application.launchAppControl(ac, '111299001912', null, function () { U.toast('YouTube açılamadı. TV\'de YouTube uygulaması yüklü mü?'); });
        return;
      } catch (e) { }
      U.toast('Fragman açılamadı');
      return;
    }
    window.open('https://www.youtube.com/watch?v=' + id, '_blank');
  }

  function showKunye(item, info) {
    info = info || {};
    var rows = [];
    function add(k, v) { if (v) rows.push(h('div', { class: 'k-row' }, [h('span', { class: 'k-key', text: k }), h('span', { class: 'k-val', text: String(v) })])); }
    add('Orijinal adı', info.originalTitle && info.originalTitle !== info.title ? info.originalTitle : '');
    add('Tür', info.genre);
    add('Çıkış tarihi', fmtDate(info.released) || info.year);
    add('Ülke', info.country);
    add(item.type === 'series' ? 'Bölüm süresi' : 'Süre', info.duration ? U.fmtDuration(info.duration) : '');
    if (info.seasons && info.seasons.length) {
      var n = 0; info.seasons.forEach(function (s) { n += s.episodes.length; });
      add('Sezon / bölüm', info.seasons.length + ' sezon, ' + n + ' bölüm');
    }
    add('Puan', info.rating ? '★ ' + fmtRating(info.rating) + ' / 10' : '');
    add('Yönetmen', info.director);
    var v = info.video;
    add('Görüntü', v && v.height ? v.width + '×' + v.height + (v.codec_name ? '  ·  ' + String(v.codec_name).toUpperCase() : '') : '');
    add('Bit hızı', info.bitrate ? (info.bitrate / 1000).toFixed(1) + ' Mbps' : '');
    add('Dosya biçimi', item.type === 'movie' && (info.ext || item.ext) ? String(info.ext || item.ext).toUpperCase() : '');
    add('Kütüphaneye eklendi', item.added ? fmtDate(item.added) : '');
    var cast = String(info.cast || '').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    var close = h('div', { class: 'btn primary f', text: 'Kapat', _enter: function () { Nav.closeModal(); } });
    var box = h('div', { class: 'kunye' }, [
      h('div', { class: 'k-title', text: info.title || item.name }),
      h('div', { class: 'k-grid' }, rows.length ? rows : [h('div', { class: 'muted', text: 'Sağlayıcı bu içerik için künye bilgisi vermiyor.' })]),
      cast.length ? h('div', { class: 'k-sub', text: 'Oyuncular (' + cast.length + ')' }) : null,
      cast.length ? h('div', { class: 'k-cast' }, cast.map(function (c) { return h('span', { text: c }); })) : null,
      info.plot ? h('div', { class: 'k-sub', text: 'Konu' }) : null,
      info.plot ? h('div', { class: 'k-plot', text: info.plot }) : null,
      h('div', { class: 'k-btns' }, [close])
    ]);
    Nav.openModal(h('div', { class: 'modal center' }, [box]), { focus: close });
  }

  // Detay düğmeleri: Künye ve (varsa) Fragman
  function extraButtons(btns, item, info) {
    if (info && info.trailer) btns.appendChild(h('div', { class: 'btn f', text: '▶ Fragman', _enter: function () { openTrailer(info.trailer); } }));
    btns.appendChild(h('div', { class: 'btn f', text: 'ⓘ Künye', _enter: function () { showKunye(item, info); } }));
  }

  function favButton(item) {
    var b = h('div', {
      class: 'btn f', _enter: function () {
        var on = Store.toggleFav(item);
        b.textContent = on ? '✓ Listemde' : '+ Listeme ekle';
        U.toast(on ? 'Listeme eklendi' : 'Listemden çıkarıldı');
      }
    });
    b.textContent = Store.isFav(item) ? '✓ Listemde' : '+ Listeme ekle';
    return b;
  }

  function makeMovie() {
    var s = { el: h('div', { class: 'detail' }) };
    var item = null, info = null, req = 0;

    function render() {
      clear(s.el);
      var fr = detailFrame(info || {}, item);
      s.el.appendChild(fr);
      var btns = $('.d-btns', fr);
      var pr = Store.progress('movie:' + item.id);
      var ext = (info && info.ext) || item.ext;
      var play = function (start) {
        var it = {}; for (var k in item) if (item.hasOwnProperty(k)) it[k] = item[k];
        it.ext = ext;
        Nav.go('player', { kind: 'movie', item: it, url: Data.url('movie', it), title: item.name, start: start });
      };
      if (pr && !pr.done && pr.pos > 10000) {
        btns.appendChild(h('div', { class: 'btn primary f', text: '▶ Devam et  ' + U.fmtTime(pr.pos / 1000), _enter: function () { play(pr.pos / 1000); } }));
        btns.appendChild(h('div', { class: 'btn f', text: '↺ Baştan başla', _enter: function () { play(0); } }));
        btns.appendChild(h('div', { class: 'd-prog' }, [h('div', { class: 'pbar inline' }, [h('i', { style: 'width:' + Math.round(pr.pos / pr.dur * 100) + '%' })]), h('span', { text: U.fmtTime((pr.dur - pr.pos) / 1000) + ' kaldı' })]));
      } else {
        btns.appendChild(h('div', { class: 'btn primary f', text: pr && pr.done ? '▶ Tekrar izle' : '▶ Oynat', _enter: function () { play(0); } }));
      }
      btns.appendChild(favButton(item));
      if (info) extraButtons(btns, item, info);
      Nav.focus($('.btn', btns));
      if (item.catId) {
        var my = req;
        Data.list('movie', item.catId).then(function (list) {
          if (my !== req || Nav.active() !== s) return;
          var sim = list.filter(function (x) { return x.id !== item.id; });
          if (!sim.length) return;
          var start = Math.max(0, list.indexOf(list.filter(function (x) { return x.id === item.id; })[0]));
          sim = sim.slice(start).concat(sim.slice(0, start)).slice(0, 20);
          var r = row('Benzer içerikler', sim.map(function (it) { return card(it, { enter: function () { Nav.go('movie', { item: it }); } }); }));
          r.className += ' d-similar';
          var old = $('.d-similar', s.el);
          if (old) old.parentNode.removeChild(old);
          $('.detail-in', s.el).appendChild(r);
        }, function () { });
      }
    }

    s.show = function (p) {
      setHints('');
      item = p.item; info = null;
      render();
      var my = ++req;
      Data.movieInfo(item).then(function (i) { if (my === req && Nav.active() === s) { info = i; render(); } });
    };
    s.resume = function () { render(); };
    s.defaultFocus = function () { return $('.btn', s.el); };
    return s;
  }

  // ================= detay: dizi =================
  function makeSeries() {
    var s = { el: h('div', { class: 'detail series' }) };
    var item = null, info = null, req = 0, season = null, plotEl = null, basePlot = '';

    function epKey(e) { return 'ep:' + e.id; }

    // Bölüme odaklanınca üstteki özet alanında o bölümün bilgisi görünür
    function showEpPlot(e) {
      if (!plotEl) return;
      clear(plotEl);
      var head = e.season + '. Sezon ' + e.num + '. Bölüm' + (e.duration ? '  ·  ' + Math.round(e.duration) + ' dk' : '');
      var pr = Store.progress(epKey(e));
      if (pr) head += pr.done ? '  ·  İzlendi' : '  ·  ' + U.fmtTime((pr.dur - pr.pos) / 1000) + ' kaldı';
      plotEl.appendChild(h('b', { class: 'd-ephead', text: head }));
      plotEl.appendChild(document.createTextNode(e.plot || 'Bu bölüm için özet yok.'));
    }
    function restorePlot() { if (plotEl) plotEl.textContent = basePlot; }

    function nextTarget() {
      // Kaldığın bölüm ya da sıradaki
      var all = [];
      info.seasons.forEach(function (sn) { sn.episodes.forEach(function (e) { all.push(e); }); });
      if (!all.length) return null;
      var lastId = Store.seriesLast(item.id);
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === lastId) {
          var pr = Store.progress(epKey(all[i]));
          if (pr && pr.done) return all[i + 1] ? { ep: all[i + 1], resume: 0, next: true } : { ep: all[0], resume: 0, again: true };
          return { ep: all[i], resume: pr ? pr.pos / 1000 : 0 };
        }
      }
      return { ep: all[0], resume: 0, first: true };
    }

    function playEp(ep, start) {
      Nav.go('player', { kind: 'episode', series: item, info: info, ep: ep, start: start || 0 });
    }

    function renderEpisodes(epRow, sn) {
      clear(epRow);
      sn.episodes.forEach(function (e) {
        var pr = Store.progress(epKey(e));
        var th = img(e.img || info.backdrop || info.poster, 'ep-thumb');
        if (pr) th.appendChild(pr.done ? h('div', { class: 'ep-done', text: '✓ İzlendi' }) : h('div', { class: 'pbar' }, [h('i', { style: 'width:' + Math.round(pr.pos / pr.dur * 100) + '%' })]));
        epRow.appendChild(h('div', { class: 'ep f', _epId: e.id, _focus: function () { showEpPlot(e); }, _enter: function () { playEp(e, pr && !pr.done ? pr.pos / 1000 : 0); } }, [
          th,
          h('div', { class: 'ep-num', text: e.num + '. Bölüm' + (e.duration ? '  ·  ' + Math.round(e.duration) + ' dk' : '') }),
          h('div', { class: 'ep-title', text: e.title && !/^\s*$/.test(e.title) ? e.title.replace(item.name, '').replace(/^[\s\-–:|]+/, '') || e.title : '' })
        ]));
      });
    }

    function render(keepFocusSeason) {
      clear(s.el);
      var fr = detailFrame(info || {}, item);
      s.el.appendChild(fr);
      var btns = $('.d-btns', fr);
      plotEl = $('.d-plot', fr);
      if (!plotEl) { plotEl = h('div', { class: 'd-plot' }); btns.parentNode.insertBefore(plotEl, btns); }
      basePlot = plotEl.textContent;
      if (!info || !info.seasons) {
        btns.appendChild(U.spinner());
        btns.appendChild(favButton(item));
        Nav.focus($('.btn', btns));
        return;
      }
      if (!info.seasons.length) {
        btns.appendChild(h('div', { class: 'muted', text: 'Bu dizi için bölüm bulunamadı.' }));
        btns.appendChild(favButton(item));
        Nav.focus($('.btn', btns));
        return;
      }
      var t = nextTarget();
      var lab = 'S' + t.ep.season + ' · B' + t.ep.num;
      btns.appendChild(h('div', {
        class: 'btn primary f', text: (t.first ? '▶ Oynat  ' : t.next ? '▶ Sıradaki  ' : t.again ? '▶ Baştan izle  ' : '▶ Devam et  ') + lab,
        _focus: restorePlot,
        _enter: function () { playEp(t.ep, t.resume); }
      }));
      btns.appendChild(favButton(item));
      extraButtons(btns, item, info);

      var seasonsEl = h('div', { class: 'seasons sx fgroup' });
      var epWrap = h('div', { class: 'eps-wrap sx fgroup' });
      var epRow = h('div', { class: 'eps' });
      epWrap.appendChild(epRow);
      var selS = null;
      seasonsEl._pref = function () { return selS; };
      epWrap._pref = function () {
        var target = null;
        U.$$('.ep', epRow).forEach(function (e) { if (!target && e._epId === t.ep.id) target = e; });
        return epWrap._last && epRow.contains(epWrap._last) ? epWrap._last : (target || $('.ep', epRow));
      };
      var want = season || t.ep.season;
      info.seasons.forEach(function (sn) {
        var el = h('div', {
          class: 'seg f', text: sn.num + '. Sezon  (' + sn.episodes.length + ')', _focus: function () {
            restorePlot();
            if (selS === el) return;
            if (selS) selS.classList.remove('sel');
            selS = el; el.classList.add('sel'); season = sn.num;
            epWrap._last = null; epWrap.scrollLeft = 0;
            renderEpisodes(epRow, sn);
          }, _enter: function () { Nav.move('down'); }
        });
        seasonsEl.appendChild(el);
        if (sn.num === want) { selS = el; el.classList.add('sel'); renderEpisodes(epRow, sn); }
      });
      if (!selS) { selS = seasonsEl.firstChild; selS.classList.add('sel'); renderEpisodes(epRow, info.seasons[0]); }
      fr.appendChild(h('div', { class: 'd-lower' }, [seasonsEl, epWrap]));
      if (keepFocusSeason) Nav.focus(selS);
      else Nav.focus($('.btn', btns));
    }

    s.show = function (p) {
      setHints('');
      item = p.item; info = null; season = null;
      render();
      var my = ++req;
      Data.seriesInfo(item).then(function (i) { if (my === req && Nav.active() === s) { info = i; render(); } }, function (e) {
        if (my !== req) return;
        info = { seasons: [], title: item.name, poster: item.poster };
        render(); U.toast('Bölümler yüklenemedi: ' + e.message);
      });
    };
    s.resume = function () { season = null; render(); };
    s.defaultFocus = function () { return $('.btn', s.el); };
    return s;
  }

  // ================= oynatıcı =================
  function makePlayer() {
    var s = { el: h('div', { class: 'player' }) };
    var osdClock = h('div', { class: 'osd-clock' });
    var top = h('div', { class: 'osd-top' }, [osdClock, h('div', { class: 'osd-title' }), h('div', { class: 'osd-sub' })]);
    var fill = h('i'), buf = h('div', { class: 'osd-thumb' });
    var bar = h('div', { class: 'osd-bar' }, [fill, buf]);
    var tCur = h('span', { class: 'osd-cur' }), tEnd = h('span', { class: 'osd-end' }), stateIc = h('span', { class: 'osd-state' });
    var hint = h('div', { class: 'osd-hint' });
    var bottom = h('div', { class: 'osd-bottom' }, [h('div', { class: 'osd-line' }, [stateIc, tCur, bar, tEnd]), hint]);
    var osd = h('div', { class: 'osd' }, [top, bottom]);
    var spin = h('div', { class: 'p-spin hidden' }, [h('div', { class: 'spin' })]);
    var subs = h('div', { class: 'subs' });
    var msg = h('div', { class: 'p-msg hidden' });
    var liveBox = h('div', { class: 'live-osd hidden' });
    var nextBox = h('div', { class: 'next-card hidden' });
    var numBox = h('div', { class: 'num-box hidden' });
    s.el.appendChild(subs); s.el.appendChild(osd); s.el.appendChild(liveBox); s.el.appendChild(spin); s.el.appendChild(msg);
    s.el.appendChild(nextBox); s.el.appendChild(numBox);

    var p = null, pos = 0, dur = 0, osdTimer = null, seekTarget = null, seekTimer = null, lastSeek = 0, seekCount = 0, saveTimer = null, liveTimer = null, epgReq = 0;
    var nextShown = false, nextCancelled = false, langApplied = false;
    var sleepAt = 0, sleepAtEnd = false, sleepTimer = null, numBuf = '', numTimer = null;

    // ---- sıradaki bölüm kartı (bölüm bitmeden 20 sn önce) ----
    function checkNext() {
      if (p.kind !== 'episode' || nextShown || nextCancelled || sleepAtEnd || !Store.setting('autoNext')) return;
      var d = dur || Player.duration(), n = nextEp();
      if (!n || !d || d < 120000 || d - pos > 20000) return;
      nextShown = true;
      clear(nextBox);
      nextBox.appendChild(img(n.img || (p.info && (p.info.backdrop || p.info.poster)), 'next-thumb'));
      nextBox.appendChild(h('div', { class: 'next-text' }, [
        h('div', { class: 'next-kicker', text: 'SIRADAKİ BÖLÜM' }),
        h('div', { class: 'next-title', text: n.season + '. Sezon ' + n.num + '. Bölüm' }),
        h('div', { class: 'next-count' }),
        h('div', { class: 'next-hint', text: 'OK: şimdi oynat     Geri: iptal' })
      ]));
      nextBox.classList.remove('hidden');
      updateNext();
    }
    function updateNext() {
      if (nextBox.classList.contains('hidden')) return;
      var d = dur || Player.duration();
      var left = Math.max(0, Math.ceil((d - pos) / 1000));
      var c = $('.next-count', nextBox);
      if (c) c.textContent = left + ' saniye içinde başlıyor';
    }
    function hideNext() { nextBox.classList.add('hidden'); }
    function playNextNow() {
      var n = nextEp();
      hideNext();
      if (!n) return;
      pos = dur || pos; save(true);
      startEpisode(n, 0);
    }

    // ---- uyku zamanlayıcısı ----
    function setSleep(min, atEnd) {
      sleepAt = min ? Date.now() + min * 60000 : 0;
      sleepAtEnd = !!atEnd;
      clearInterval(sleepTimer);
      if (sleepAt) sleepTimer = setInterval(function () { if (Date.now() >= sleepAt) sleepNow(); }, 15000);
    }
    function sleepLabel() {
      if (sleepAtEnd) return 'Bu içerik bitince';
      if (!sleepAt) return 'Kapalı';
      return Math.max(1, Math.round((sleepAt - Date.now()) / 60000)) + ' dk kaldı';
    }
    function sleepNow() {
      setSleep(0);
      save(true);
      Player.pause(); setState();
      U.toast('Uyku zamanlayıcısı: oynatma durduruldu', 4000);
      setTimeout(function () { if (Nav.active() === s) Nav.back(); }, 1500);
    }

    // ---- canlı: kanal numarası girişi ----
    function numKey(d) {
      numBuf = (numBuf + d).slice(-4);
      numBox.textContent = numBuf;
      numBox.classList.remove('hidden');
      clearTimeout(numTimer);
      numTimer = setTimeout(goNumber, 1500);
    }
    function goNumber() {
      var want = numBuf; numBuf = '';
      numBox.classList.add('hidden');
      var i = -1;
      p.list.forEach(function (it, k) { if (i < 0 && String(it.num) === want) i = k; });
      if (i >= 0) { p.index = i; begin(Data.url('live', liveItem()), 0); showLive(); return; }
      Data.all('live').then(function (all) {
        var hit = all.filter(function (it) { return String(it.num) === want; })[0];
        if (!hit || !p || p.kind !== 'live') { U.toast(want + ' numaralı kanal bulunamadı'); return; }
        p.list = all.slice().sort(function (a, b) { return (+a.num || 0) - (+b.num || 0); });
        p.index = p.list.indexOf(hit);
        begin(Data.url('live', hit), 0); showLive();
      }, function () { U.toast(want + ' numaralı kanal bulunamadı'); });
    }

    function subStyle() {
      subs.className = 'subs s-' + Store.setting('subSize') + ' b-' + Store.setting('subBg');
    }

    function showOsd(sticky) {
      if (p.kind === 'live') { showLive(); return; }
      osdClock.textContent = U.fmtClock(new Date());
      osd.classList.add('show');
      clearTimeout(osdTimer);
      if (!sticky && Player.isPlaying()) osdTimer = setTimeout(function () { osd.classList.remove('show'); }, 4500);
    }
    function hideOsd() { osd.classList.remove('show'); liveBox.classList.add('hidden'); }

    function updateBar() {
      var d = dur || Player.duration();
      if (d && !dur) dur = d;
      var t = seekTarget !== null ? seekTarget : pos;
      var pct = d ? Math.min(100, t / d * 100) : 0;
      fill.style.width = pct + '%';
      buf.style.left = pct + '%';
      tCur.textContent = U.fmtTime(t / 1000);
      if (d) {
        var endAt = new Date(Date.now() + (d - t));
        tEnd.textContent = '-' + U.fmtTime((d - t) / 1000) + '   ·   Bitiş ' + U.fmtClock(endAt);
      } else tEnd.textContent = '';
      bar.classList.toggle('seeking', seekTarget !== null);
    }

    function setState() { stateIc.textContent = Player.isPlaying() ? '▶' : '❚❚'; }

    function key() {
      if (!p) return null;
      return p.kind === 'movie' ? 'movie:' + p.item.id : p.kind === 'episode' ? 'ep:' + p.ep.id : null;
    }

    function nextEp() {
      if (p.kind !== 'episode' || !p.info) return null;
      var all = [];
      p.info.seasons.forEach(function (sn) { sn.episodes.forEach(function (e) { all.push(e); }); });
      for (var i = 0; i < all.length; i++) if (all[i].id === p.ep.id) return all[i + 1] || null;
      return null;
    }

    function save(force) {
      var k = key();
      if (!k) return;
      var d = dur || Player.duration();
      if (!d || (pos < 5000 && !force)) return;
      var done = pos / d > 0.93 || (d - pos) < 120000 && pos / d > 0.85;
      if (p.kind === 'movie') Store.setProgress(k, { kind: 'movie', item: p.item, pos: pos, dur: d, done: done });
      else {
        Store.setProgress(k, { kind: 'episode', series: p.series, ep: { id: p.ep.id, season: p.ep.season, num: p.ep.num, title: p.ep.title }, pos: pos, dur: d, done: done, hasNext: !!nextEp() });
        Store.setSeriesLast(p.series.id, p.ep.id);
      }
    }

    function listeners() {
      return {
        onReady: function () {
          dur = Player.duration(); spin.classList.add('hidden'); msg.classList.add('hidden'); updateBar(); setState();
          if (!langApplied) {
            langApplied = true;
            // Tercih edilen ses/altyazı dilini seç (izler biraz geç gelebilir)
            setTimeout(function () { if (p) Player.applyLangPrefs(Store.setting('audioLang'), Store.setting('subLang')); }, 800);
          }
        },
        onRetry: function (n, max) {
          // Kopma/donma: oynatıcı kendisi yeniden bağlanıyor
          spin.classList.remove('hidden');
          msg.classList.add('hidden');
          U.toast('Bağlantı yeniden kuruluyor… (' + n + '/' + max + ')', 2500);
        },
        onBuffer: function (b) { spin.classList.toggle('hidden', !b); },
        onTime: function (t) {
          pos = t;
          if (osd.classList.contains('show')) updateBar();
          if (p.kind === 'episode') { checkNext(); updateNext(); }
        },
        onSub: function (t) { subs.textContent = String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, ''); },
        onEnd: function () {
          if (p.kind === 'live') { showError('Yayın sona erdi'); return; }
          pos = dur; save(true);
          hideNext();
          if (sleepAtEnd) { setSleep(0); U.toast('Uyku zamanlayıcısı: içerik bitti', 4000); Nav.back(); return; }
          var n = nextEp();
          if (n && Store.setting('autoNext') && !nextCancelled) {
            U.toast('Sıradaki bölüm: ' + n.season + '. Sezon ' + n.num + '. Bölüm');
            startEpisode(n, 0);
          } else Nav.back();
        },
        onError: function (m) {
          spin.classList.add('hidden');
          showError('Yayın açılamadı' + (m ? ' (' + m + ')' : '') + '\nBirkaç kez yeniden denendi. Ayarlar > Arabellek: Geniş seçeneği takılmaları azaltabilir.');
        }
      };
    }

    function showError(t) {
      msg.textContent = t + (p && p.kind === 'live' ? '\nCH + / CH − ile başka kanala geçebilirsiniz' : '\nGeri tuşuyla dönebilirsiniz');
      msg.classList.remove('hidden');
    }

    function begin(url, startSec) {
      pos = (startSec || 0) * 1000; dur = 0; seekTarget = null;
      msg.classList.add('hidden'); subs.textContent = '';
      nextShown = false; nextCancelled = false; langApplied = false; hideNext();
      subStyle();
      if (p.kind === 'live') Store.addRecentLive(liveItem());
      spin.classList.remove('hidden');
      Player.open(url, pos, listeners(), { live: p.kind === 'live', alt: p.kind === 'catchup' ? p.alt : null });
      updateBar(); setState();
      clearInterval(saveTimer);
      if (p.kind !== 'live') saveTimer = setInterval(function () { save(false); }, 10000);
    }

    function startEpisode(ep, start) {
      p.ep = ep;
      $('.osd-title', top).textContent = p.series.name;
      $('.osd-sub', top).textContent = ep.season + '. Sezon  ·  ' + ep.num + '. Bölüm' + (ep.title ? '  ·  ' + ep.title : '');
      hint.textContent = '◀ ▶ geri / ileri    OK duraklat    ▲ kalite · ses · altyazı    ▼ bilgi' + (nextEp() ? '    ⏩ uzun: sonraki bölüm' : '');
      begin(Data.url('episode', ep), start);
      Store.setSeriesLast(p.series.id, ep.id);
      showOsd();
    }

    // ---- canlı ----
    function liveItem() { return p.list[p.index]; }
    function showLive() {
      var it = liveItem();
      clear(liveBox);
      liveBox.appendChild(img(it.poster, 'lo-logo'));
      var txt = h('div', { class: 'lo-text' }, [
        h('div', { class: 'lo-name' }, [h('span', { class: 'lo-num', text: String(it.num || p.index + 1) }), it.name]),
        h('div', { class: 'lo-epg muted', text: '' }),
        h('div', { class: 'osd-hint', text: 'CH + / CH − kanal değiştir    ◀ kanal listesi    ▶ ▲ menü' + (it.archive ? ' (↺ baştan izle · arşiv)' : ' (kalite · ses · altyazı · uyku)') + '    0–9 kanal no' })
      ]);
      liveBox.appendChild(txt);
      liveBox.classList.remove('hidden');
      clearTimeout(liveTimer);
      liveTimer = setTimeout(function () { liveBox.classList.add('hidden'); }, 5000);
      var my = ++epgReq;
      Data.epg(it).then(function (l) {
        if (my !== epgReq || !l.length) return;
        var now = l[0], nx = l[1];
        var e = $('.lo-epg', liveBox);
        if (!e) return;
        e.textContent = 'Şimdi: ' + now.title + ' (' + U.fmtClock(new Date(now.start)) + '–' + U.fmtClock(new Date(now.end)) + ')' + (nx ? '    Sonra: ' + nx.title : '');
      });
    }
    // Hızlı art arda basışta her kanalı açmaya çalışma: bilgi kartı anında güncellenir,
    // yayın tuşlar bırakıldıktan kısa süre sonra başlar.
    var zapTimer = null;
    function zap(d) {
      if (!p.list.length) return;
      p.index = (p.index + d + p.list.length) % p.list.length;
      showLive();
      clearTimeout(zapTimer);
      zapTimer = setTimeout(function () { zapTimer = null; if (p && p.kind === 'live') begin(Data.url('live', liveItem()), 0); }, 450);
    }
    function channelList() {
      var list = h('div', { class: 'panel-list sy' });
      var box = h('div', { class: 'modal side' }, [h('div', { class: 'panel' }, [h('div', { class: 'panel-title', text: 'Kanallar' }), list])]);
      var curEl = null;
      fillLazy(list, p.list, function (it, i) {
        var el = h('div', { class: 'ch f' + (i === p.index ? ' sel' : ''), _enter: function () { Nav.closeModal(); if (i !== p.index) { p.index = i; begin(Data.url('live', it), 0); } showLive(); } },
          [h('span', { class: 'ch-num', text: String(it.num || i + 1) }), img(it.poster, 'ch-logo'), h('span', { class: 'ch-name', text: it.name })]);
        return el;
      }, Math.max(60, p.index + 20));
      U.$$('.ch', list).forEach(function (e, i) { if (i === p.index) curEl = e; });
      Nav.openModal(box, { focus: curEl });
    }

    // ---- ses / altyazı / görüntü menüsü ----
    function trackMenu() {
      var t = Player.tracks();
      var cols = [];
      function col(title, items) {
        var l = h('div', { class: 'tcol sy fgroup' }, [h('div', { class: 'tcol-title', text: title })]);
        var sel = null;
        items.forEach(function (it) {
          if (it.sep) { l.appendChild(h('div', { class: 'tcol-sep', text: it.sep })); return; }
          // keep: menü açık kalır ve etiket güncellenir (ör. altyazı senkronu)
          var el = h('div', { class: 'li f' + (it.on ? ' sel' : ''), text: (it.on ? '✓  ' : '') + it.label, _enter: function () {
            var r = it.fn();
            if (it.keep) { if (r) el.textContent = r; } else Nav.closeModal();
          } });
          if (it.on) sel = el;
          l.appendChild(el);
        });
        l._pref = function () { return sel; };
        cols.push(l);
        return sel;
      }
      var focusEl = null;
      // Kalite / çözünürlük
      var qs = Player.qualities(), curQ = Player.quality(), now = Player.currentVideo();
      if (qs.length) {
        col('Kalite', [{ label: 'Otomatik (en yüksekten)' + (now && !curQ ? '  ·  ' + now : ''), on: !curQ, fn: function () { Player.setQuality(0); U.toast('Kalite: otomatik'); } }]
          .concat(qs.map(function (q) { return { label: q.label, on: curQ === q.bitrate, fn: function () { Player.setQuality(q.bitrate); U.toast('Kalite: ' + q.label); } }; })));
      } else {
        col('Kalite', [{ label: now ? now + ' (tek)' : 'Tek kalite', on: true, fn: function () { U.toast('Bu yayın tek kalitede geliyor; TV en iyi şekilde ölçekliyor.'); } }]);
      }
      if (t.audio.length) focusEl = col('Ses', t.audio.map(function (a) { return { label: a.label, on: a.index === t.curAudio, fn: function () { Player.selectTrack('AUDIO', a.index); U.toast('Ses: ' + a.label); } }; }));
      else col('Ses', [{ label: Player.isNative() ? 'Varsayılan' : 'Varsayılan (tarayıcı)', on: true, fn: function () { } }]);
      var subItems = [{ label: 'Kapalı', on: t.subsOff || t.curText < 0, fn: function () { Player.subsOff(); U.toast('Altyazı kapalı'); } }];
      t.text.forEach(function (a) { subItems.push({ label: a.label, on: !t.subsOff && a.index === t.curText, fn: function () { Player.selectTrack('TEXT', a.index); U.toast('Altyazı: ' + a.label); } }); });
      if (t.text.length) {
        // Altyazı kayıksa: ±0,5 sn senkron
        var offTxt = function () { var o = Player.subOffset() / 1000; return 'Sıfırla  (şu an ' + (o > 0 ? '+' : '') + o.toFixed(1) + ' sn)'; };
        subItems.push({ sep: 'Senkron' });
        subItems.push({ label: 'Senkron  −0,5 sn', keep: true, fn: function () { Player.subShift(-500); U.toast('Altyazı ' + (Player.subOffset() / 1000).toFixed(1) + ' sn'); } });
        subItems.push({ label: 'Senkron  +0,5 sn', keep: true, fn: function () { Player.subShift(500); U.toast('Altyazı ' + (Player.subOffset() / 1000).toFixed(1) + ' sn'); } });
        subItems.push({ label: offTxt(), keep: true, fn: function () { Player.subShift(null); U.toast('Altyazı senkronu sıfırlandı'); return offTxt(); } });
      }
      col('Altyazı', subItems);
      var dm = Store.setting('display');
      col('Görüntü', [
        ['PLAYER_DISPLAY_MODE_LETTER_BOX', 'Orijinal oran'],
        ['PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO', 'Otomatik'],
        ['PLAYER_DISPLAY_MODE_FULL_SCREEN', 'Tam ekran (uzat)']
      ].map(function (d) { return { label: d[1], on: dm === d[0], fn: function () { Player.setDisplay(d[0]); U.toast('Görüntü: ' + d[1]); } }; }));
      // Canlı yayında: bu kanalın arşivi
      if (p.kind === 'live' && liveItem().archive) {
        var ch = liveItem();
        col('Geri izle', [
          { label: 'Bu programı baştan izle', fn: function () { setTimeout(function () { startOverLive(ch); }, 0); } },
          { label: 'Arşiv (' + ch.archive + ' gün)', fn: function () { setTimeout(function () { Nav.pop(); openCatchup(ch); }, 0); } }
        ]);
      }
      // Uyku zamanlayıcısı
      var sl = [{ label: 'Kapalı', on: !sleepAt && !sleepAtEnd, fn: function () { setSleep(0); U.toast('Uyku zamanlayıcısı kapalı'); } }];
      [15, 30, 60, 90].forEach(function (m) { sl.push({ label: m + ' dakika sonra', on: false, fn: function () { setSleep(m); U.toast('Oynatma ' + m + ' dakika sonra duracak'); } }); });
      if (p.kind !== 'live') sl.push({ label: 'Bu ' + (p.kind === 'episode' ? 'bölüm' : 'film') + ' bitince', on: sleepAtEnd, fn: function () { setSleep(0, true); U.toast('İçerik bitince oynatma duracak'); } });
      if (sleepAt) sl[0].label = 'Kapat  (' + sleepLabel() + ')';
      col('Uyku', sl);
      var box = h('div', { class: 'modal bottom' }, [h('div', { class: 'tmenu' }, cols)]);
      Nav.openModal(box, { focus: focusEl });
    }

    // ---- ileri / geri sarma (art arda basınca hızlanır) ----
    function seekBy(sec) {
      var d = dur || Player.duration();
      if (!d) return;
      var now = Date.now();
      seekCount = now - lastSeek < 450 ? seekCount + 1 : 0;
      lastSeek = now;
      var mult = seekCount > 14 ? 6 : seekCount > 8 ? 3 : seekCount > 3 ? 2 : 1;
      if (seekTarget === null) seekTarget = pos;
      seekTarget = Math.max(0, Math.min(d - 3000, seekTarget + sec * 1000 * mult));
      showOsd(true);
      updateBar();
      clearTimeout(seekTimer);
      seekTimer = setTimeout(commitSeek, 750);
    }
    function commitSeek() {
      if (seekTarget === null) return;
      Player.seek(seekTarget);
      pos = seekTarget; seekTarget = null;
      updateBar();
      showOsd();
    }

    s.show = function (params) {
      p = params;
      document.body.classList.add('playing');
      hideOsd();
      if (p.kind === 'live') {
        osd.classList.remove('show');
        begin(Data.url('live', liveItem()), 0);
        showLive();
      } else if (p.kind === 'episode') {
        startEpisode(p.ep, p.start);
      } else {
        $('.osd-title', top).textContent = p.title || p.item.name;
        $('.osd-sub', top).textContent = p.kind === 'catchup' && p.prog ?
          '↺ Geri izle  ·  ' + p.prog.title + '  ·  ' + dayLabel(p.prog.start) + ' ' + U.fmtClock(new Date(p.prog.start)) + '–' + U.fmtClock(new Date(p.prog.end)) : '';
        hint.textContent = '◀ ▶ geri / ileri    OK duraklat    ▲ kalite · ses · altyazı    ▼ bilgi    0–9 konuma atla';
        begin(p.url, p.start);
        showOsd();
      }
    };

    s.hide = function () {
      if (seekTarget !== null) { pos = seekTarget; seekTarget = null; }
      save(false);
      clearInterval(saveTimer); clearTimeout(osdTimer); clearTimeout(seekTimer); clearTimeout(liveTimer);
      clearTimeout(numTimer); clearTimeout(zapTimer); numBuf = ''; numBox.classList.add('hidden'); hideNext(); setSleep(0);
      Player.stop();
      document.body.classList.remove('playing');
      hideOsd();
      p = null;
    };

    s.back = function () {
      if (!nextBox.classList.contains('hidden')) { hideNext(); nextCancelled = true; U.toast('Sıradaki bölüm iptal edildi'); return true; }
      if (numBuf) { numBuf = ''; clearTimeout(numTimer); numBox.classList.add('hidden'); return true; }
      if (seekTarget !== null) { clearTimeout(seekTimer); seekTarget = null; updateBar(); showOsd(); return true; }
      if (p.kind !== 'live' && osd.classList.contains('show') && Player.isPlaying()) { hideOsd(); return true; }
      return false;
    };

    s.key = function (k) {
      var K = Nav.KEY;
      if (p.kind === 'live') {
        switch (k) {
          case K.CHUP: zap(1); return true;
          case K.CHDOWN: zap(-1); return true;
          case K.LEFT: channelList(); return true;
          case K.RIGHT: case K.UP: trackMenu(); return true;
          case K.DOWN:
            if (liveBox.classList.contains('hidden')) showLive(); else liveBox.classList.add('hidden');
            return true;
          case K.ENTER: case K.INFO:
            if (liveBox.classList.contains('hidden')) showLive(); else liveBox.classList.add('hidden');
            return true;
          case K.STOP: Nav.back(); return true;
          case K.PLAYPAUSE: case K.PAUSE: case K.PLAY: Player.toggle(); return true;
        }
        if (k >= 48 && k <= 57) { numKey(String(k - 48)); return true; }
        return false;
      }
      // Sıradaki bölüm kartı açıkken OK hemen oynatır
      if (!nextBox.classList.contains('hidden') && (k === K.ENTER || k === K.PLAYPAUSE)) { playNextNow(); return true; }
      switch (k) {
        case K.LEFT: seekBy(-10); return true;
        case K.RIGHT: seekBy(10); return true;
        case K.RW: seekBy(-60); return true;
        case K.FF:
          seekBy(60); return true;
        case K.ENTER: case K.PLAYPAUSE:
          if (seekTarget !== null) { clearTimeout(seekTimer); commitSeek(); return true; }
          Player.toggle(); setState(); showOsd(!Player.isPlaying()); return true;
        case K.PLAY: Player.resume(); setState(); showOsd(); return true;
        case K.PAUSE: Player.pause(); setState(); showOsd(true); return true;
        case K.UP: trackMenu(); return true;
        case K.DOWN: case K.INFO: updateBar(); setState(); showOsd(); return true;
        case K.STOP: Nav.back(); return true;
        case K.CHUP: case K.CHDOWN:
          if (p.kind === 'episode') { var n = nextEp(); if (k === K.CHUP && n) { save(true); startEpisode(n, 0); } return true; }
          return true;
      }
      if (k >= 48 && k <= 57) {
        var d = dur || Player.duration();
        if (d) { seekTarget = (k - 48) / 10 * d; showOsd(true); updateBar(); clearTimeout(seekTimer); seekTimer = setTimeout(commitSeek, 900); }
        return true;
      }
      return false;
    };
    s.defaultFocus = function () { return null; };
    return s;
  }

  // ================= arama =================
  function makeSearch() {
    var s = { nav: true, el: h('div', { class: 'search' }) };
    var input = h('input', { type: 'text', placeholder: 'Film, dizi veya kanal ara…', autocomplete: 'off', spellcheck: 'false' });
    var field = h('div', { class: 'field big f', _enter: function () { input.focus(); } }, [input]);
    var go = h('div', { class: 'btn primary f', text: 'Ara', _enter: run });
    var res = h('div', { class: 'rows sy results' });
    input._done = run;
    s.el.appendChild(h('div', { class: 'search-bar' }, [field, go]));
    s.el.appendChild(res);
    var req = 0;

    function run() {
      var q = U.fold(input.value.trim());
      clear(res);
      if (q.length < 2) { res.appendChild(emptyMsg('En az 2 harf yazın.')); showRecent(); return; }
      Store.addRecentSearch(input.value.trim());
      res.appendChild(U.spinner());
      var my = ++req;
      var types = [['movie', 'Filmler'], ['series', 'Diziler'], ['live', 'Canlı kanallar']];
      Promise.all(types.map(function (t) { return Data.all(t[0]).then(null, function () { return []; }); })).then(function (lists) {
        if (my !== req) return;
        clear(res);
        var any = false, words = q.split(/\s+/);
        lists.forEach(function (list, i) {
          var found = [];
          for (var j = 0; j < list.length && found.length < 60; j++) {
            var n = list[j]._f || (list[j]._f = U.fold(list[j].name));
            var ok = true;
            for (var w = 0; w < words.length; w++) if (n.indexOf(words[w]) < 0) { ok = false; break; }
            if (ok) found.push(list[j]);
          }
          if (!found.length) return;
          any = true;
          var type = types[i][0];
          res.appendChild(row(types[i][1] + '  ·  ' + found.length + (found.length === 60 ? '+' : ''), found.map(function (it) {
            return type === 'live' ? card(it, { enter: function () { playLive(found, found.indexOf(it)); } }) : card(it);
          })));
        });
        if (!any) res.appendChild(emptyMsg('"' + input.value.trim() + '" için sonuç bulunamadı.'));
        else Nav.focus($('.card', res));
      });
    }

    // Son aramalar: tek tuşla tekrar ara
    function showRecent() {
      var rs = Store.recentSearch();
      if (!rs.length) return;
      var chips = h('div', { class: 'recent-chips' }, [h('div', { class: 'row-title', text: 'Son aramalar' })]);
      var line = h('div', { class: 'recent-line' });
      rs.forEach(function (q) {
        line.appendChild(h('div', { class: 'seg f', text: q, _enter: function () { input.value = q; run(); } }));
      });
      line.appendChild(h('div', { class: 'seg f muted', text: '✕ Temizle', _enter: function () { Store.clearRecentSearch(); if (chips.parentNode) chips.parentNode.removeChild(chips); Nav.focus(field); } }));
      chips.appendChild(line);
      res.appendChild(chips);
    }

    s.show = function () {
      setHints('OK: kutuya yaz     Film, dizi ve kanal adlarında Türkçe karakter fark etmez');
      if (!res.children.length) { res.appendChild(emptyMsg('Aramak için kutuya gelip OK tuşuna basın.')); showRecent(); }
    };
    s.defaultFocus = function () { return field; };
    return s;
  }

  // ================= Listem =================
  function makeMyList() {
    var s = { nav: true, el: h('div', { class: 'mylist' }) };
    var rows = h('div', { class: 'rows sy full' });
    s.el.appendChild(rows);
    function build() {
      clear(rows);
      var cont = Store.continueList();
      if (cont.length) rows.appendChild(row('İzlemeye devam et', cont.map(function (e) {
        var rm = askRemoveCont(e, rows, build);
        return e.kind === 'movie' ? card(e.item, { progress: e.dur ? e.pos / e.dur : 0, long: rm }) :
          card(e.series, { label: 'S' + e.ep.season + ' · B' + e.ep.num, progress: e.done ? 0 : e.pos / e.dur, long: rm });
      })));
      var m = Store.favs('movie'), sr = Store.favs('series'), l = Store.favs('live');
      if (m.length) rows.appendChild(row('Filmler', m.map(function (i) { return card(i, { long: askRemoveFav(i, rows, build) }); })));
      if (sr.length) rows.appendChild(row('Diziler', sr.map(function (i) { return card(i, { long: askRemoveFav(i, rows, build) }); })));
      if (l.length) rows.appendChild(row('Kanallar', l.map(function (i) { return card(i, { enter: function () { playLive(l, l.indexOf(i)); }, long: askRemoveFav(i, rows, build) }); })));
      if (!rows.children.length) rows.appendChild(emptyMsg('Listeniz boş. Film ve dizi sayfalarındaki "+ Listeme ekle" düğmesiyle ekleyebilirsiniz.'));
    }
    s.show = function () { setHints('◀ ▶ ▲ ▼ gezin     OK aç     OK basılı tut: listeden çıkar'); build(); };
    s.resume = build;
    s.defaultFocus = function () { return $('.card', rows); };
    return s;
  }

  // ---- PIN penceresi: ekran tuş takımı + kumandanın numara tuşları ----
  // check(pin) → true: kapanır, string: hata mesajı gösterilir
  function pinDialog(title, sub, check) {
    var val = '';
    var dots = h('div', { class: 'pin-dots' });
    var subEl = h('div', { class: 'pin-sub', text: sub || '' });
    function draw() { dots.textContent = '●●●●'.slice(0, val.length) + '○○○○'.slice(val.length); }
    function push(d) {
      if (val.length >= 4) return;
      val += d; draw();
      if (val.length === 4) setTimeout(function () {
        var r = check(val);
        if (r === true) { Nav.closeModal(); return; }
        val = ''; draw();
        if (typeof r === 'string') { subEl.textContent = r; subEl.className = 'pin-sub err'; }
      }, 150);
    }
    var keys = h('div', { class: 'pin-keys' });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✕'].forEach(function (k) {
      keys.appendChild(h('div', { class: 'btn f', text: k, _enter: function () {
        if (k === '⌫') { val = val.slice(0, -1); draw(); } else if (k === '✕') Nav.closeModal(); else push(k);
      } }));
    });
    draw();
    var box = h('div', { class: 'pin-box' }, [h('div', { class: 'pin-title', text: title }), subEl, dots, keys]);
    Nav.openModal(h('div', { class: 'modal center' }, [box]), {
      focus: keys.firstChild,
      key: function (k) { if (k >= 48 && k <= 57) { push(String(k - 48)); return true; } return false; }
    });
  }

  // Yeni PIN oluştur (iki kez sor)
  function createPin(done) {
    pinDialog('Çocuk kilidi PIN\'i oluşturun', '4 haneli bir PIN seçin', function (a) {
      setTimeout(function () {
        pinDialog('PIN\'i tekrar girin', 'Onaylamak için aynı PIN\'i girin', function (b) {
          if (a !== b) return 'PIN\'ler eşleşmedi, tekrar deneyin';
          Store.setSetting('pin', a);
          U.toast('PIN kaydedildi');
          setTimeout(done, 50);
          return true;
        });
      }, 50);
      return true;
    });
  }

  function askPin(title, done) {
    pinDialog(title, 'Çocuk kilidi PIN\'inizi girin', function (v) {
      if (v !== Store.setting('pin')) return 'PIN yanlış';
      setTimeout(done, 50);
      return true;
    });
  }


  // ================= içerik filtresi =================
  var TYPE_NAMES = { live: 'Canlı TV', movie: 'Filmler', series: 'Diziler' };
  function hideCatCount() { return Object.keys(Store.setting('hideCat') || {}).length; }
  function setCatHidden(type, id, on) {
    var hc = {}, cur = Store.setting('hideCat') || {};
    for (var k in cur) if (cur.hasOwnProperty(k)) hc[k] = 1;
    if (on) hc[type + ':' + id] = 1; else delete hc[type + ':' + id];
    Store.setSetting('hideCat', hc);
  }
  function setLangHidden(code, on) {
    var l = (Store.setting('hideLang') || []).filter(function (c) { return c !== code; });
    if (on) l.push(code);
    Store.setSetting('hideLang', l);
  }
  function isLangHidden(code) { return (Store.setting('hideLang') || []).indexOf(code) >= 0; }

  // Kategori listesinde OK basılı tut: bu kategoriyi gizle
  function askHideCat(type, c, after) {
    return function () {
      Nav.confirm('"' + c.name + '" kategorisi gizlensin mi?\nAyarlar > İçerik filtresi bölümünden geri açabilirsiniz.', 'Gizle', function () {
        setCatHidden(type, c.id, true);
        resetAll();
        U.toast('"' + c.name + '" gizlendi');
        if (after) after();
      });
    };
  }

  // Tüm türlerdeki kategorileri dil/ülke koduna göre grupla
  function langGroups() {
    return Promise.all(['live', 'movie', 'series'].map(function (t) { return Data.rawCats(t).then(null, function () { return []; }); })).then(function (r) {
      var g = {}, none = 0;
      ['live', 'movie', 'series'].forEach(function (t, i) {
        r[i].forEach(function (c) {
          var code = Data.langOf(c.name);
          if (!code) { none++; return; }
          var x = g[code] || (g[code] = { code: code, live: 0, movie: 0, series: 0, total: 0 });
          x[t]++; x.total++;
        });
      });
      var list = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return a.code === 'TR' ? -1 : b.code === 'TR' ? 1 : b.total - a.total; });
      return { list: list, none: none };
    });
  }

  function langFilter(onDone) {
    U.loading(true, 'Kategoriler inceleniyor…');
    langGroups().then(function (res) {
      U.loading(false);
      var list = h('div', { class: 'flist sy' });
      function label(x) {
        var parts = [];
        if (x.live) parts.push(x.live + ' canlı');
        if (x.movie) parts.push(x.movie + ' film');
        if (x.series) parts.push(x.series + ' dizi');
        return [h('span', { class: 'fl-mark', text: isLangHidden(x.code) ? '✕' : '✓' }), h('span', { class: 'fl-code', text: x.code }),
          h('span', { class: 'fl-name', text: Data.langName(x.code) }), h('span', { class: 'fl-cnt', text: parts.join(' · ') + ' kategori' })];
      }
      function paint() {
        U.$$('.fl-row', list).forEach(function (el) {
          clear(el);
          label(el._x).forEach(function (n) { el.appendChild(n); });
          el.classList.toggle('off', isLangHidden(el._x.code));
        });
      }
      if (!res.list.length) list.appendChild(h('div', { class: 'empty', text: 'Kategori adlarında dil/ülke kodu bulunamadı. Kategorileri tek tek gizleyebilirsiniz.' }));
      res.list.forEach(function (x) {
        list.appendChild(h('div', { class: 'li f fl-row', _x: x, _enter: function () { setLangHidden(x.code, !isLangHidden(x.code)); paint(); } }));
      });
      paint();
      var btns = h('div', { class: 'dialog-btns fgroup' }, [
        h('div', { class: 'btn f', text: 'Yalnızca Türkiye', _enter: function () {
          Store.setSetting('hideLang', res.list.map(function (x) { return x.code; }).filter(function (c) { return c !== 'TR'; })); paint();
        } }),
        h('div', { class: 'btn f', text: 'Hepsini göster', _enter: function () { Store.setSetting('hideLang', []); paint(); } }),
        h('div', { class: 'btn primary f', text: 'Tamam', _enter: function () { Nav.closeModal(); } })
      ]);
      var box = h('div', { class: 'dialog fbox' }, [
        h('div', { class: 'dialog-text', text: 'Dil / ülke filtresi' }),
        h('div', { class: 'fl-note', text: 'OK ile göster (✓) ya da gizle (✕). Gizlenen gruplar Canlı TV, Filmler, Diziler, arama ve ana sayfadan kalkar. Kodsuz ' + res.none + ' kategori her zaman görünür.' }),
        list, btns
      ]);
      Nav.openModal(h('div', { class: 'modal center' }, [box]), { onClose: function () { resetAll(); if (onDone) onDone(); } });
    }, function (e) { U.loading(false); U.toast('Kategoriler alınamadı: ' + e.message); });
  }

  function catFilter(onDone) {
    U.loading(true, 'Kategoriler yükleniyor…');
    Promise.all(['live', 'movie', 'series'].map(function (t) { return Data.rawCats(t).then(null, function () { return []; }); })).then(function (r) {
      U.loading(false);
      var cols = [], first = null;
      ['live', 'movie', 'series'].forEach(function (t, i) {
        var col = h('div', { class: 'tcol fcol sy fgroup' }, [h('div', { class: 'tcol-title', text: TYPE_NAMES[t] + '  (' + r[i].length + ')' })]);
        r[i].forEach(function (c) {
          var code = Data.langOf(c.name), byLang = code && isLangHidden(code);
          var el = h('div', { class: 'li f' });
          function paint() {
            var hid = !!(Store.setting('hideCat') || {})[t + ':' + c.id];
            el.textContent = (byLang ? '◌  ' : hid ? '✕  ' : '✓  ') + c.name + (byLang ? '  (dil filtresi)' : '');
            el.classList.toggle('off', hid || byLang);
          }
          el._enter = function () {
            if (byLang) { U.toast(code + ' grubu dil filtresiyle gizli; önce oradan açın'); return; }
            setCatHidden(t, c.id, !(Store.setting('hideCat') || {})[t + ':' + c.id]); paint();
          };
          paint();
          if (!first) first = el;
          col.appendChild(el);
        });
        cols.push(col);
      });
      var box = h('div', { class: 'dialog fbox wide' }, [
        h('div', { class: 'dialog-text', text: 'Kategorileri gizle' }),
        h('div', { class: 'fl-note', text: 'OK ile gizle (✕) ya da göster (✓).  ◀ ▶ sütun değiştir   CH + / CH − sayfa atla   Geri: kaydet ve çık' }),
        h('div', { class: 'fcols' }, cols)
      ]);
      Nav.openModal(h('div', { class: 'modal center' }, [box]), { focus: first, onClose: function () { resetAll(); if (onDone) onDone(); } });
    }, function (e) { U.loading(false); U.toast('Kategoriler alınamadı: ' + e.message); });
  }

  // ================= profiller =================
  function avatar(p, cls) {
    return h('div', { class: (cls || 'avatar') + ' av-' + (p.color || 0) }, [
      h('span', { text: U.initials(p.name).charAt(0) || '?' }),
      p.kids ? h('i', { class: 'av-kid', text: 'ÇOCUK' }) : null,
      p.priv ? h('i', { class: 'av-kid av-priv', text: 'GİZLİ' }) : null
    ]);
  }

  // Ad girme penceresi (TV ekran klavyesi açılır)
  function nameDialog(title, value, done) {
    var input = h('input', { type: 'text', value: value || '', autocomplete: 'off', spellcheck: 'false', maxlength: '16', placeholder: 'Örn. Defne' });
    var field = h('div', { class: 'field big f', _enter: function () { input.focus(); } }, [input]);
    var err = h('div', { class: 'login-err' });
    function save() {
      var v = input.value.trim();
      if (!v) { err.textContent = 'Bir ad yazın'; return; }
      Nav.closeModal();
      done(v.slice(0, 16));
    }
    input._done = save;
    var box = h('div', { class: 'dialog' }, [
      h('div', { class: 'dialog-text', text: title }), field, err,
      h('div', { class: 'dialog-btns' }, [
        h('div', { class: 'btn f', text: 'Vazgeç', _enter: function () { Nav.closeModal(); } }),
        h('div', { class: 'btn primary f', text: 'Kaydet', _enter: save })
      ])
    ]);
    Nav.openModal(h('div', { class: 'modal center' }, [box]), { focus: field });
  }

  // Çocuk profilinden çıkmak / ayarlara girmek için PIN (yoksa önce oluşturulur)
  function guardKids(done) {
    if (!Store.isKids()) { done(); return; }
    if (!Store.setting('pin')) { createPin(done); return; }
    askPin('Çocuk profilinden çık', done);
  }

  function switchProfile(id) {
    Store.useProfile(id);
    resetAll();
    Nav.root('home');
    var p = Store.profile();
    U.toast(p.priv ? 'Gizli profil: izleme geçmişi kaydedilmez, kaldığın yer tutulmaz' : (p.kids ? 'Çocuk profili: ' : 'Profil: ') + p.name, p.priv ? 4500 : 3000);
  }

  function makeProfiles() {
    var s = { el: h('div', { class: 'profiles' }) };
    var row = h('div', { class: 'prof-row' });
    s.el.appendChild(h('div', { class: 'prof-title', text: 'Kim izliyor?' }));
    s.el.appendChild(row);
    s.el.appendChild(h('div', { class: 'prof-note', text: 'Her profilin kendi Listem\'i, izleme geçmişi ve son kanalları vardır. Gizli profilde hiçbir şey kaydedilmez.  ·  Düzenlemek için profile gelip OK\'a basılı tutun.' }));

    function manage(p) {
      var items = [
        h('div', { class: 'btn f', text: 'Adını değiştir', _enter: function () {
          Nav.closeModal();
          nameDialog('Profil adı', p.name, function (v) { Store.updateProfile(p.id, { name: v }); build(); });
        } }),
        h('div', { class: 'btn f', text: p.kids ? 'Çocuk profilini kapat' : 'Çocuk profili yap', _enter: function () {
          Nav.closeModal();
          var next = !p.kids;
          var apply = function () {
            Store.updateProfile(p.id, { kids: next });
            if (p.id === Store.profile().id) resetAll();
            build();
            U.toast(next ? 'Çocuk profili: yalnızca çocuk içerikleri' : 'Artık normal profil');
          };
          // Çocuk korumasını kaldırmak PIN ister; açmak için PIN yoksa oluşturulur
          if (p.kids) { if (Store.setting('pin')) askPin('Çocuk profilini kapat', apply); else apply(); }
          else if (!Store.setting('pin')) createPin(apply); else apply();
        } })
      ];
      if (p.id !== 'main') items.push(h('div', { class: 'btn danger f', text: 'Profili sil', _enter: function () {
        Nav.closeModal();
        Nav.confirm('"' + p.name + '" profili silinsin mi? Listem ve izleme geçmişi de silinir.', 'Sil', function () {
          var go = function () { Store.removeProfile(p.id); build(); U.toast('Profil silindi'); };
          if (p.kids && Store.setting('pin')) askPin('Çocuk profilini sil', go); else go();
        });
      } }));
      items.push(h('div', { class: 'btn primary f', text: 'Kapat', _enter: function () { Nav.closeModal(); } }));
      var box = h('div', { class: 'dialog prof-manage' }, [avatar(p, 'avatar small'), h('div', { class: 'dialog-text', text: p.name }), h('div', { class: 'prof-btns' }, items)]);
      Nav.openModal(h('div', { class: 'modal center' }, [box]));
    }

    function build() {
      clear(row);
      var cur = Store.profile().id;
      Store.profiles().forEach(function (p) {
        row.appendChild(h('div', { class: 'prof f' + (p.id === cur ? ' cur' : ''), _enter: function () {
          if (p.id === Store.profile().id) { Nav.root('home'); return; }
          guardKids(function () { switchProfile(p.id); });
        }, _long: function () { guardKids(function () { manage(p); }); } }, [avatar(p), h('div', { class: 'prof-name', text: p.name })]));
      });
      // Gizli profil: her zaman en sonda, düzenlenemez
      var ip = Store.privateProfile();
      row.appendChild(h('div', { class: 'prof f priv' + (ip.id === cur ? ' cur' : ''), _enter: function () {
        if (ip.id === Store.profile().id) { Nav.root('home'); return; }
        guardKids(function () { switchProfile(ip.id); });
      }, _long: function () { U.toast('Gizli profil düzenlenemez. İzleme geçmişi ve devam noktası kaydedilmez.', 4000); } }, [avatar(ip), h('div', { class: 'prof-name', text: ip.name })]));
      if (Store.profiles().length < 6) row.appendChild(h('div', { class: 'prof f add', _enter: function () {
        guardKids(function () {
          nameDialog('Yeni profil adı', '', function (v) {
            var np = Store.addProfile(v, false);
            build();
            U.toast('"' + np.name + '" eklendi. Çocuk profili yapmak için OK\'a basılı tutun.', 4000);
          });
        });
      } }, [h('div', { class: 'avatar add-av' }, [h('span', { text: '+' })]), h('div', { class: 'prof-name', text: 'Profil ekle' })]));
      var c = null;
      U.$$('.prof', row).forEach(function (e) { if (!c && e.classList.contains('cur')) c = e; });
      Nav.focus(c || $('.prof', row));
    }

    s.show = function () { setHints('◀ ▶ seç     OK izlemeye başla     OK basılı tut: düzenle'); build(); };
    s.defaultFocus = function () { return $('.prof.cur', row) || $('.prof', row); };
    return s;
  }

  // ================= ayarlar =================
  function makeSettings() {
    var s = { nav: true, el: h('div', { class: 'settings' }) };
    var box = h('div', { class: 'set-box sy' });
    s.el.appendChild(box);

    function toggleRow(label, getText, onEnter) {
      var v = h('span', { class: 'set-val', text: getText() });
      return h('div', { class: 'set-row f', _enter: function () { onEnter(); v.textContent = getText(); } }, [h('span', { text: label }), v]);
    }
    function info(label, value) { return h('div', { class: 'set-info' }, [h('span', { text: label }), h('span', { class: 'set-val', text: value || '—' })]); }

    function build() {
      clear(box);
      var a = Store.account() || {}, i = Store.accInfo() || {};
      var prof = Store.profile();
      // Çocuk profilinde ayarlar kapalı; yalnızca PIN ile profilden çıkılabilir
      if (Store.isKids()) {
        box.appendChild(h('div', { class: 'set-title', text: 'Çocuk profili' }));
        box.appendChild(info('Profil', prof.name));
        box.appendChild(info('Görünen içerik', 'Yalnızca çocuk ve aile kategorileri'));
        box.appendChild(h('div', { class: 'set-row f', _enter: function () { guardKids(function () { Nav.root('profiles'); }); } }, [h('span', { text: 'Profil değiştir (PIN gerekir)' })]));
        return;
      }
      box.appendChild(h('div', { class: 'set-title', text: 'Profil' }));
      box.appendChild(info('Etkin profil', prof.name + '  ·  ' + Store.profiles().length + ' profil'));
      box.appendChild(h('div', { class: 'set-row f', _enter: function () { Nav.root('profiles'); } }, [h('span', { text: 'Profil değiştir / ekle / düzenle' })]));
      box.appendChild(h('div', { class: 'set-title', text: 'Hesap' }));
      if (a.type === 'xtream') {
        box.appendChild(info('Sunucu', a.server));
        box.appendChild(info('Kullanıcı', a.user));
        if (i.status) box.appendChild(info('Durum', i.status === 'Active' ? 'Aktif' : i.status));
        if (i.exp_date) {
          var exp = new Date(+i.exp_date * 1000), days = Math.ceil((exp - Date.now()) / 86400000);
          box.appendChild(info('Bitiş tarihi', exp.toLocaleDateString ? U.pad(exp.getDate()) + '.' + U.pad(exp.getMonth() + 1) + '.' + exp.getFullYear() + '  (' + days + ' gün kaldı)' : ''));
        } else if (i.auth) box.appendChild(info('Bitiş tarihi', 'Süresiz'));
        if (i.max_connections) box.appendChild(info('Eşzamanlı bağlantı', i.active_cons + ' / ' + i.max_connections));
      } else box.appendChild(info('M3U listesi', a.url));

      // İçerik filtresi: dil/ülke ve tek tek kategori gizleme
      box.appendChild(h('div', { class: 'set-title', text: 'İçerik filtresi' }));
      var nl = (Store.setting('hideLang') || []).length, nc = hideCatCount();
      box.appendChild(h('div', { class: 'set-row f', _enter: function () { langFilter(function () { build(); Nav.focus(findRow('Dil / ülke')); }); } },
        [h('span', { text: 'Dil / ülke filtresi' }), h('span', { class: 'set-val', text: nl ? nl + ' grup gizli: ' + (Store.setting('hideLang') || []).slice(0, 6).join(', ') + (nl > 6 ? '…' : '') : 'Hepsi görünür' })]));
      box.appendChild(h('div', { class: 'set-row f', _enter: function () { catFilter(function () { build(); Nav.focus(findRow('Kategorileri')); }); } },
        [h('span', { text: 'Kategorileri tek tek gizle' }), h('span', { class: 'set-val', text: nc ? nc + ' kategori gizli' : 'Gizli kategori yok' })]));
      if (nl || nc) box.appendChild(h('div', { class: 'set-row f', _enter: function () {
        Nav.confirm('Tüm içerik filtreleri kaldırılsın mı?', 'Kaldır', function () { Store.setSetting('hideLang', []); Store.setSetting('hideCat', {}); resetAll(); build(); U.toast('Tüm kategoriler görünür'); });
      } }, [h('span', { text: 'Filtreleri sıfırla' })]));
      box.appendChild(info('İpucu', 'Canlı TV, Filmler ve Diziler\'de bir kategoride OK\'a basılı tutarak da gizleyebilirsiniz'));

      box.appendChild(h('div', { class: 'set-title', text: 'Oynatma' }));
      if (a.type === 'xtream') box.appendChild(toggleRow('Canlı yayın biçimi', function () { return Store.setting('liveExt') === 'ts' ? 'MPEG-TS (önerilen)' : 'HLS (m3u8)'; }, function () {
        Store.setSetting('liveExt', Store.setting('liveExt') === 'ts' ? 'm3u8' : 'ts');
      }));
      box.appendChild(toggleRow('Arabellek (donmalara karşı)', function () { return Store.setting('buffer') === 'large' ? 'Geniş · 15 sn' : 'Normal · 6 sn'; }, function () {
        Store.setSetting('buffer', Store.setting('buffer') === 'large' ? 'normal' : 'large');
      }));
      box.appendChild(info('Kopma ve donmalarda', 'Otomatik yeniden bağlanır (6 deneme)'));
      box.appendChild(toggleRow('Bölüm bitince sıradakini oynat', function () { return Store.setting('autoNext') ? 'Açık' : 'Kapalı'; }, function () { Store.setSetting('autoNext', !Store.setting('autoNext')); }));
      // Altyazı ve ses tercihleri
      var LANGS = { tr: 'Türkçe', en: 'İngilizce', orig: 'Orijinal (değiştirme)', off: 'Kapalı' };
      function cycle(key, order) { var v = Store.setting(key), i = order.indexOf(v); Store.setSetting(key, order[(i + 1) % order.length]); }
      box.appendChild(h('div', { class: 'set-title', text: 'Altyazı ve ses' }));
      box.appendChild(toggleRow('Tercih edilen ses dili', function () { return LANGS[Store.setting('audioLang')]; }, function () { cycle('audioLang', ['tr', 'en', 'orig']); }));
      box.appendChild(toggleRow('Tercih edilen altyazı', function () { return LANGS[Store.setting('subLang')]; }, function () { cycle('subLang', ['tr', 'en', 'off']); }));
      box.appendChild(toggleRow('Altyazı boyutu', function () { return { s: 'Küçük', m: 'Orta', l: 'Büyük' }[Store.setting('subSize')]; }, function () { cycle('subSize', ['s', 'm', 'l']); }));
      box.appendChild(toggleRow('Altyazı görünümü', function () { return Store.setting('subBg') === 'box' ? 'Siyah kutu (okunaklı)' : 'Gölgeli yazı'; }, function () { cycle('subBg', ['shadow', 'box']); }));
      box.appendChild(info('Nasıl çalışır', 'Yayında bu dil varsa kendiliğinden seçilir; oynatırken ▲ menüsünden değiştirilebilir'));

      // Çocuk kilidi
      box.appendChild(h('div', { class: 'set-title', text: 'Çocuk kilidi' }));
      var lockRow = toggleRow('Yetişkin kategorileri', function () { return Store.setting('adultHide') ? 'Gizli (kilitli)' : 'Görünür'; }, function () { });
      lockRow._enter = function () {
        if (!Store.setting('adultHide')) { Store.setSetting('adultHide', true); resetAll(); build(); U.toast('Yetişkin kategorileri gizlendi'); Nav.focus(findRow('Yetişkin')); return; }
        var unlock = function () { Store.setSetting('adultHide', false); resetAll(); build(); U.toast('Yetişkin kategorileri görünür'); Nav.focus(findRow('Yetişkin')); };
        if (!Store.setting('pin')) createPin(unlock); else askPin('Kilidi aç', unlock);
      };
      box.appendChild(lockRow);
      if (Store.setting('pin')) box.appendChild(h('div', { class: 'set-row f', _enter: function () { askPin('Mevcut PIN', function () { createPin(function () { }); }); } }, [h('span', { text: 'PIN\'i değiştir' })]));
      var adultInfo = info('Kapsam', 'Adında +18, yetişkin, adult, xxx geçen kategoriler; aramada ve ana sayfada da gizlenir');
      box.appendChild(adultInfo);

      box.appendChild(h('div', { class: 'set-title', text: 'Görünüm' }));
      box.appendChild(toggleRow('Tema', function () { return Theme.label(); }, function () {
        cycle('theme', ['dark', 'light', 'auto']);
        Theme.apply();
      }));
      box.appendChild(toggleRow('Açılışta', function () { return Store.setting('startup') === 'lastLive' ? 'Son izlenen kanalı oynat' : 'Ana sayfa'; }, function () {
        Store.setSetting('startup', Store.setting('startup') === 'lastLive' ? 'home' : 'lastLive');
      }));
      box.appendChild(toggleRow('Ekran koruyucu (OLED)', function () { var v = Store.setting('saver'); return v === 'off' ? 'Kapalı' : v + ' dk hareketsizlikte'; }, function () {
        cycle('saver', ['5', '10', '15', '30', 'off']);
      }));
      box.appendChild(toggleRow('Ana sayfada vitrin', function () { return Store.setting('hero') ? 'Açık' : 'Kapalı'; }, function () { Store.setSetting('hero', !Store.setting('hero')); }));
      box.appendChild(h('div', { class: 'set-title', text: 'Görüntü kalitesi' }));
      box.appendChild(info('4K çözme modu', Player.isNative() ? (Player.isUhd() ? 'Açık (4K panel)' : 'Bu TV 4K değil') : 'Yalnızca TV\'de'));
      box.appendChild(info('Çok kaliteli yayınlar', 'En yüksek kaliteden başlar; oynatırken ▲ > Kalite ile seçilebilir'));
      box.appendChild(info('TV ayarı önerisi', 'Ayarlar > Görüntü > Uzman Ayarları: Görüntü Netliği "Otomatik", Kontrast Artırıcı "Düşük"'));
      box.appendChild(h('div', { class: 'set-title', text: 'Veriler' }));
      box.appendChild(h('div', { class: 'set-row f', _enter: function () { Nav.confirm('İzleme geçmişi silinsin mi?', 'Sil', function () { Store.clearHistory(); U.toast('İzleme geçmişi silindi'); }); } }, [h('span', { text: 'İzleme geçmişini temizle' })]));
      box.appendChild(h('div', { class: 'set-row f', _enter: function () { Data.setAccount(Data.account()); if (Data.account() && Data.account().type === 'm3u') { U.loading(true, 'Liste yenileniyor…'); Data.loadM3U().then(function () { U.loading(false); resetAll(); U.toast('Liste yenilendi'); }, function (e) { U.loading(false); U.toast(e.message); }); } else { resetAll(); U.toast('Listeler yenilendi'); } } }, [h('span', { text: 'Listeleri yenile' })]));
      box.appendChild(h('div', { class: 'set-row f danger', _enter: function () { Nav.confirm('Hesaptan çıkış yapılsın mı? Listem ve izleme geçmişi bu TV\'de kalır.', 'Çıkış yap', function () { Store.logout(); resetAll(); Nav.root('login'); }); } }, [h('span', { text: 'Hesaptan çıkış yap / hesap değiştir' })]));
      box.appendChild(h('div', { class: 'set-ver', text: 'Cemflix 1.0.0  ·  Samsung Tizen  ·  ' + (Player.isNative() ? 'AVPlay' : 'HTML5 video') }));
    }
    function findRow(text) {
      var r = null;
      U.$$('.set-row', box).forEach(function (e) { if (!r && e.textContent.indexOf(text) >= 0) r = e; });
      return r;
    }
    s.show = function () { setHints('▲ ▼ seç     OK değiştir'); build(); };
    s.defaultFocus = function () { return $('.set-row', box); };
    return s;
  }

  // ================= OLED ekran koruyucu =================
  // Menülerde ya da duraklatılmış videoda uzun süre tuşa basılmazsa ekran kararır,
  // saat yavaşça yer değiştirir (sabit görüntü izi riskini azaltır).
  var Saver = (function () {
    var el = null, clockEl = null, dateEl = null, last = Date.now(), on = false, moveT = null;
    function mins() { var v = Store.setting('saver'); return v === 'off' ? 0 : +v || 10; }
    function idleOk() {
      // Video gerçekten oynarken ekran koruyucu açılmaz
      return !(document.body.classList.contains('playing') && Player.isPlaying());
    }
    function place() {
      var d = new Date();
      clockEl.textContent = U.fmtClock(d);
      dateEl.textContent = DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][d.getMonth()];
      var box = el.firstChild;
      box.style.left = Math.round(80 + Math.random() * 1360) + 'px';
      box.style.top = Math.round(80 + Math.random() * 760) + 'px';
    }
    function show() {
      if (on) return;
      on = true;
      el.classList.add('show');
      place();
      moveT = setInterval(place, 20000);
    }
    function hide() {
      on = false;
      el.classList.remove('show');
      clearInterval(moveT);
    }
    function init() {
      clockEl = h('div', { class: 'sv-clock' });
      dateEl = h('div', { class: 'sv-date' });
      el = h('div', { id: 'saver' }, [h('div', { class: 'sv-box' }, [clockEl, dateEl, h('div', { class: 'sv-hint', text: 'Devam etmek için bir tuşa basın' })])]);
      document.body.appendChild(el);
      // Yakalama aşamasında dinle: ekran koruyucuyu kapatan tuş başka işlem yapmasın
      window.addEventListener('keydown', function (e) {
        last = Date.now();
        if (on) { hide(); e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
      document.addEventListener('mousemove', function () { last = Date.now(); if (on) hide(); });
      setInterval(function () {
        var m = mins();
        if (!on && m && idleOk() && Date.now() - last > m * 60000) show();
        if (!idleOk()) last = Math.max(last, Date.now() - 1000); // oynarken sayaç ilerlemesin
      }, 5000);
    }
    return { init: init, show: show, hide: hide };
  })();

  // ================= tema: koyu / açık / otomatik =================
  var Theme = (function () {
    function isLight() {
      var t = Store.setting('theme');
      if (t === 'light') return true;
      if (t === 'auto') { var hr = new Date().getHours(); return hr >= 7 && hr < 19; }
      return false;
    }
    function apply() { document.body.classList.toggle('light', isLight()); }
    function label() {
      var t = Store.setting('theme');
      return t === 'light' ? 'Açık' : t === 'auto' ? 'Otomatik (07–19 açık, akşam koyu)' : 'Koyu';
    }
    function init() { apply(); setInterval(apply, 60000); }
    return { init: init, apply: apply, label: label };
  })();

  var all = {};
  function resetAll() {
    ['live', 'movies', 'seriesList'].forEach(function (n) { if (all[n] && all[n].reset) all[n].reset(); });
  }

  function registerAll() {
    buildTopbar(document.getElementById('topbar'));
    all.login = makeLogin();
    all.home = makeHome();
    all.live = makeLive();
    all.catchup = makeCatchup();
    all.movies = makeBrowse('movie');
    all.seriesList = makeBrowse('series');
    all.movie = makeMovie();
    all.series = makeSeries();
    all.player = makePlayer();
    all.search = makeSearch();
    all.mylist = makeMyList();
    all.settings = makeSettings();
    all.profiles = makeProfiles();
    Object.keys(all).forEach(function (k) { Nav.register(k, all[k]); });
    Saver.init();
    Theme.init();
  }

  return { registerAll: registerAll, resetAll: resetAll, saver: Saver, theme: Theme };
})();

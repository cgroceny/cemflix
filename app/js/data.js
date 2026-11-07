/* Cemflix TV - Xtream Codes API ve M3U liste desteği */
var Data = (function () {
  'use strict';

  var acc = null, cache = {}, m3u = null;

  function request(url, timeout) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.timeout = timeout || 30000;
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) res(x.responseText);
        else rej(new Error('Sunucu hatası (HTTP ' + x.status + ')'));
      };
      x.onerror = function () { rej(new Error('Sunucuya bağlanılamadı')); };
      x.ontimeout = function () { rej(new Error('Sunucu yanıt vermedi')); };
      x.send();
    });
  }

  function getJSON(url, timeout) {
    return request(url, timeout).then(function (t) {
      try { return JSON.parse(t); } catch (e) { throw new Error('Sunucudan geçersiz yanıt geldi'); }
    });
  }

  function normServer(s) {
    s = String(s || '').trim();
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    s = s.replace(/\/(player_api\.php|get\.php|panel_api\.php).*$/i, '');
    return s.replace(/\/+$/, '');
  }

  function qp(url, name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)', 'i').exec(url);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  // get.php?username=..&password=.. biçimindeki M3U bağlantıları aslında Xtream hesabıdır
  function m3uToXtream(url) {
    var u = qp(url, 'username'), p = qp(url, 'password');
    if (u && p && /get\.php/i.test(url)) return { type: 'xtream', server: normServer(url), user: u, pass: p };
    return null;
  }

  function api(action, extra) {
    var url = acc.server + '/player_api.php?username=' + encodeURIComponent(acc.user) +
      '&password=' + encodeURIComponent(acc.pass) + (action ? '&action=' + action : '') + (extra || '');
    return getJSON(url);
  }

  function cached(key, fn) {
    if (cache[key]) return cache[key];
    var p = fn();
    cache[key] = p;
    p.then(null, function () { delete cache[key]; });
    return p;
  }

  // YouTube fragman kimliği: "dQw4w9WgXcQ" ya da tam bağlantı gelebilir
  function ytId(s) {
    s = String(s || '').trim();
    if (!s) return '';
    var m = /(?:v=|youtu\.be\/|embed\/)([\w-]{11})/.exec(s);
    if (m) return m[1];
    return /^[\w-]{11}$/.test(s) ? s : '';
  }

  // ---- çocuk kilidi: yetişkin kategorileri ----
  var ADULT = /(\+\s?18|18\s?\+|xxx|adult|yeti[sş]kin|erotik|porn|\bsex)/i;
  function isAdultName(n) { return ADULT.test(String(n || '')); }
  function hideAdult() { return Store.isKids() || Store.setting('adultHide') !== false; }
  // Çocuk profili: yalnızca çocuk/aile kategorileri
  var KIDS = /(çocuk|cocuk|kids?\b|child|çizgi|cizgi|animasyon|animation|anime|cartoon|aile|family|disney|minik|bebek|okul öncesi)/i;

  // ---- dil / ülke filtresi ----
  // Kategori adlarının başındaki ülke/dil kodu: "DE | Sport", "|DE| Filme", "[DE] Kino", "DE: Doku", "DE - News"
  // ya da açık ülke adı ("GERMANY ...", "ALMANYA ..."). Yalnızca bilinen kodlar sayılır (HD, VIP gibi etiketler değil).
  var LANG_NAMES = {
    TR: 'Türkiye', DE: 'Almanya', AT: 'Avusturya', CH: 'İsviçre', NL: 'Hollanda', BE: 'Belçika', FR: 'Fransa', IT: 'İtalya',
    ES: 'İspanya', PT: 'Portekiz', UK: 'İngiltere', GB: 'İngiltere', EN: 'İngilizce', US: 'ABD', CA: 'Kanada', AU: 'Avustralya',
    IE: 'İrlanda', PL: 'Polonya', RO: 'Romanya', BG: 'Bulgaristan', GR: 'Yunanistan', AL: 'Arnavutluk', XK: 'Kosova', MK: 'Makedonya',
    RS: 'Sırbistan', HR: 'Hırvatistan', BA: 'Bosna', SI: 'Slovenya', ME: 'Karadağ', EXYU: 'Eski Yugoslavya', HU: 'Macaristan',
    CZ: 'Çekya', SK: 'Slovakya', RU: 'Rusya', UA: 'Ukrayna', BY: 'Belarus', SE: 'İsveç', NO: 'Norveç', DK: 'Danimarka', FI: 'Finlandiya',
    IS: 'İzlanda', LT: 'Litvanya', LV: 'Letonya', EE: 'Estonya', AR: 'Arapça', ARAB: 'Arapça', IR: 'İran', FA: 'Farsça', KU: 'Kürtçe',
    KURD: 'Kürtçe', AZ: 'Azerbaycan', GE: 'Gürcistan', AM: 'Ermenistan', IL: 'İsrail', IN: 'Hindistan', PK: 'Pakistan', AF: 'Afganistan',
    BD: 'Bangladeş', CN: 'Çin', JP: 'Japonya', KR: 'Kore', TH: 'Tayland', VN: 'Vietnam', PH: 'Filipinler', ID: 'Endonezya', MY: 'Malezya',
    BR: 'Brezilya', MX: 'Meksika', LATAM: 'Latin Amerika', LAT: 'Latin Amerika', CO: 'Kolombiya', CL: 'Şili', PE: 'Peru', VE: 'Venezuela',
    AFR: 'Afrika', ZA: 'Güney Afrika', NG: 'Nijerya', MA: 'Fas', DZ: 'Cezayir', TN: 'Tunus', EG: 'Mısır', CY: 'Kıbrıs', CYP: 'Kıbrıs'
  };
  var LANG_WORDS = [
    [/^(t[uü]rk(iye|ey|ish|[cç]e)?|turkce|yerli)\b/i, 'TR'], [/^(germany|deutsch(land)?|almanya|alman(ca)?|german)\b/i, 'DE'],
    [/^(france|fran[cç]ais|fransa|french)\b/i, 'FR'], [/^(italy|italia|italya|italian)\b/i, 'IT'], [/^(spain|espa[nñ]a|ispanya|spanish)\b/i, 'ES'],
    [/^(netherlands?|holland|hollanda|dutch)\b/i, 'NL'], [/^(united kingdom|england|ingiltere|english|ingilizce)\b/i, 'UK'],
    [/^(usa|united states|amerika)\b/i, 'US'], [/^(poland|polska|polonya)\b/i, 'PL'], [/^(russia|россия|rusya)\b/i, 'RU'],
    [/^(arab(ic)?|arap[cç]a)\b/i, 'AR'], [/^(albania|shqip|arnavut)/i, 'AL'], [/^(portugal|portekiz)\b/i, 'PT'], [/^(greece|yunanistan)\b/i, 'GR'],
    [/^(romania|romanya)\b/i, 'RO'], [/^(bulgaria|bulgaristan)\b/i, 'BG'], [/^(azerbaijan|azerbaycan)\b/i, 'AZ'], [/^(kurd(ish)?|k[uü]rt[cç]e)\b/i, 'KU'],
    [/^(austria|[oö]sterreich|avusturya)\b/i, 'AT'], [/^(switzerland|schweiz|isvi[cç]re)\b/i, 'CH'], [/^(india|hindistan)\b/i, 'IN']
  ];
  var CODE_RE = /^[\s\[\(|★#*-]*([A-Z]{2,5})\s*(?:[\]\)|:]|\s[-–|:]|\s*[★▶►]|\s+(?=[A-Z0-9ÇĞİÖŞÜ]))/;
  function langOf(name) {
    var n = String(name || '').trim();
    var m = CODE_RE.exec(n);
    // Yalnızca boşlukla ayrılmışsa İngilizce kelimeye benzeyen kodları sayma ("IN Theaters", "IT Crowd")
    if (m && /\s$/.test(m[0]) && /^(IN|IS|IT|ME|AM|ID|NO|CO|PE|MA|AR|BE|US|AT|GE|AFR|LAT)$/.test(m[1])) m = null;
    if (m) { var c = m[1].toUpperCase(); if (LANG_NAMES[c]) return c === 'GB' ? 'UK' : c === 'ARAB' ? 'AR' : c === 'KURD' ? 'KU' : c === 'LAT' ? 'LATAM' : c === 'CYP' ? 'CY' : c; }
    var w = n.replace(/^[\s\[\(|★#*-]+/, '');
    for (var i = 0; i < LANG_WORDS.length; i++) if (LANG_WORDS[i][0].test(w)) return LANG_WORDS[i][1];
    return '';
  }
  function langName(code) { return LANG_NAMES[code] || code; }
  function hiddenLangs() { var o = {}; (Store.setting('hideLang') || []).forEach(function (c) { o[c] = 1; }); return o; }
  function hiddenCats() { return Store.setting('hideCat') || {}; }
  // Kategori gizli mi: yetişkin kilidi, dil/ülke filtresi ya da tek tek gizleme
  function catHidden(type, c, hl, hc) {
    if (hideAdult() && isAdultName(c.name)) return true;
    var code = langOf(c.name);
    if (code && (hl || hiddenLangs())[code]) return true;
    return !!(hc || hiddenCats())[type + ':' + c.id];
  }

  function arr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).map(function (k) { return x[k]; }) : []); }
  function first(x) { return Array.isArray(x) ? (x[0] || '') : (x || ''); }
  function num(x) { var n = parseFloat(x); return isNaN(n) ? 0 : n; }

  // ---------- normalleştirme ----------
  function nLive(s) {
    return {
      type: 'live', id: String(s.stream_id), name: s.name || '', poster: s.stream_icon || '', catId: String(s.category_id), num: s.num, epgId: s.epg_channel_id || '',
      archive: num(s.tv_archive) > 0 ? (num(s.tv_archive_duration) || 1) : 0   // geri izlenebilen gün sayısı
    };
  }
  function yearOf(s) {
    var y = String(s.year || s.releaseDate || s.release_date || '').slice(0, 4);
    if (/^\d{4}$/.test(y)) return y;
    var m = /[\(\[](\d{4})[\)\]]/.exec(s.name || '');
    return m ? m[1] : '';
  }
  function nMovie(s) {
    return { type: 'movie', id: String(s.stream_id), name: s.name || '', poster: s.stream_icon || '', catId: String(s.category_id), ext: s.container_extension || 'mp4', rating: num(s.rating), added: num(s.added), year: yearOf(s) };
  }
  function nSeries(s) {
    return {
      type: 'series', id: String(s.series_id), name: s.name || '', poster: s.cover || '', catId: String(s.category_id),
      rating: num(s.rating), plot: s.plot || '', genre: s.genre || '', year: yearOf(s),
      backdrop: first(s.backdrop_path), added: num(s.last_modified)
    };
  }

  // ---------- M3U ----------
  var EXTINF = /^#EXTINF:[^\s,]*((?:\s+[\w-]+="[^"]*")*)\s*,(.*)$/;
  var ATTR = /([\w-]+)="([^"]*)"/g;
  var SXE = /^(.*?)[\s._\-|:]*[Ss](\d{1,2})\s*[._\- ]?\s*[Ee](\d{1,3})/;

  function parseM3U(text) {
    var lines = text.split(/\r?\n/), info = null, n = 0;
    var live = [], movies = [], seriesMap = {}, series = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l) continue;
      if (l.indexOf('#EXTINF') === 0) {
        var attrs = {}, name = '', m = EXTINF.exec(l);
        if (m) {
          var a; ATTR.lastIndex = 0;
          while ((a = ATTR.exec(m[1])) !== null) attrs[a[1].toLowerCase()] = a[2];
          name = m[2].trim();
        } else name = l.substring(l.lastIndexOf(',') + 1).trim();
        info = { name: name || attrs['tvg-name'] || 'Adsız', logo: attrs['tvg-logo'] || '', group: attrs['group-title'] || 'Diğer', tvgId: attrs['tvg-id'] || '' };
        continue;
      }
      if (l.charAt(0) === '#' || !info) continue;
      n++;
      var url = l, low = url.toLowerCase();
      if (/\/series\//.test(low) || (SXE.test(info.name) && /\.(mp4|mkv|avi|mov|m4v)(\?|$)/.test(low))) {
        var sm = SXE.exec(info.name), sname = sm ? sm[1].trim() : info.name;
        var key = info.group + '|' + sname;
        var s = seriesMap[key];
        if (!s) {
          s = seriesMap[key] = { type: 'series', id: 's' + n, name: sname, poster: info.logo, catId: info.group, _eps: [] };
          series.push(s);
        }
        s._eps.push({ id: 'e' + n, season: sm ? parseInt(sm[2], 10) : 1, num: sm ? parseInt(sm[3], 10) : s._eps.length + 1, title: info.name, url: url, img: info.logo });
      } else if (/\/movie\//.test(low) || /\.(mp4|mkv|avi|mov|m4v)(\?|$)/.test(low)) {
        movies.push({ type: 'movie', id: 'm' + n, name: info.name, poster: info.logo, catId: info.group, url: url });
      } else {
        live.push({ type: 'live', id: 'l' + n, name: info.name, poster: info.logo, catId: info.group, url: url, num: live.length + 1 });
      }
      info = null;
    }
    return { live: live, movie: movies, series: series };
  }

  function m3uCats(type) {
    var seen = {}, out = [];
    m3u[type].forEach(function (it) { if (!seen[it.catId]) { seen[it.catId] = 1; out.push({ id: it.catId, name: it.catId }); } });
    return out;
  }

  // ---------- genel arayüz ----------
  function setAccount(a) { acc = a; cache = {}; m3u = null; }

  function login(a) {
    if (a.type === 'm3u') {
      var x = m3uToXtream(a.url);
      if (x) a = x;
    }
    if (a.type === 'xtream') {
      a.server = normServer(a.server);
      var prev = acc;
      acc = a;
      return api('').then(function (r) {
        if (!r || !r.user_info || String(r.user_info.auth) === '0') throw new Error('Kullanıcı adı veya şifre hatalı');
        if (r.user_info.status && r.user_info.status !== 'Active') throw new Error('Hesap durumu: ' + r.user_info.status);
        return { account: a, info: r.user_info, server: r.server_info };
      }, function (e) { acc = prev; throw e; });
    }
    return request(a.url, 120000).then(function (t) {
      var p = parseM3U(t);
      if (!p.live.length && !p.movie.length && !p.series.length) throw new Error('Listede oynatılabilir içerik bulunamadı');
      return { account: a, parsed: p, info: null };
    });
  }

  function useParsed(p) { m3u = p; }

  function loadM3U() {
    return request(acc.url, 120000).then(function (t) {
      m3u = parseM3U(t);
      return m3u;
    });
  }

  var CAT_ACTION = { live: 'get_live_categories', movie: 'get_vod_categories', series: 'get_series_categories' };
  var LIST_ACTION = { live: 'get_live_streams', movie: 'get_vod_streams', series: 'get_series' };
  var NORM = { live: nLive, movie: nMovie, series: nSeries };

  function rawCats(type) {
    if (m3u) return Promise.resolve(m3uCats(type));
    return cached('c:' + type, function () {
      return api(CAT_ACTION[type]).then(function (r) {
        return arr(r).map(function (c) { return { id: String(c.category_id), name: c.category_name || 'Kategori' }; });
      });
    });
  }

  // Çocuk kilidi açıksa yetişkin kategorileri hiç görünmez
  function cats(type) {
    return rawCats(type).then(function (l) {
      var hl = hiddenLangs(), hc = hiddenCats();
      l = l.filter(function (c) { return !catHidden(type, c, hl, hc); });
      // Çocuk profili: yalnızca çocuk kategorileri; yoksa o bölüm boş kalır (güvenli taraf)
      if (Store.isKids()) l = l.filter(function (c) { return KIDS.test(c.name); });
      return l;
    });
  }

  // Gizli kategorilerin kimlikleri (arama ve ana sayfa önerilerinde süzmek için)
  function hiddenIds(type) {
    return rawCats(type).then(function (l) {
      var s = {}, hl = hiddenLangs(), hc = hiddenCats();
      l.forEach(function (c) { if (catHidden(type, c, hl, hc)) s[c.id] = 1; });
      return s;
    }, function () { return {}; });
  }

  function list(type, catId) {
    if (m3u) return Promise.resolve(m3u[type].filter(function (i) { return i.catId === catId; }));
    return cached('l:' + type + ':' + catId, function () {
      return api(LIST_ACTION[type], '&category_id=' + encodeURIComponent(catId)).then(function (r) { return arr(r).map(NORM[type]); });
    });
  }

  function allRaw(type) {
    if (m3u) return Promise.resolve(m3u[type]);
    return cached('a:' + type, function () {
      return api(LIST_ACTION[type]).then(function (r) { return arr(r).map(NORM[type]); });
    });
  }

  // Tüm içerik (arama, ana sayfa önerileri); yetişkin kategoriler süzülür
  function all(type) {
    return allRaw(type).then(function (items) {
      if (Store.isKids()) {
        // Çocuk profilinde yalnızca görünen kategorilerdeki içerik
        return cats(type).then(function (cl) {
          var ok = {}; cl.forEach(function (c) { ok[c.id] = 1; });
          return items.filter(function (i) { return ok[i.catId]; });
        });
      }
      return hiddenIds(type).then(function (bad) {
        var ha = hideAdult();
        return items.filter(function (i) { return !bad[i.catId] && !(ha && isAdultName(i.catId)); });
      });
    });
  }

  function movieInfo(item) {
    var base = { title: item.name, poster: item.poster, backdrop: item.backdrop || '', plot: item.plot || '', rating: item.rating || 0, year: item.year || '', genre: item.genre || '' };
    if (m3u || !acc || acc.type !== 'xtream') return Promise.resolve(base);
    return cached('vi:' + item.id, function () {
      return api('get_vod_info', '&vod_id=' + encodeURIComponent(item.id)).then(function (r) {
        var i = (r && r.info) || {};
        if (Array.isArray(i)) i = {};
        var dur = i.duration_secs ? i.duration_secs / 60 : 0;
        if (!dur && i.duration) { var d = String(i.duration).split(':'); dur = d.length === 3 ? (+d[0]) * 60 + (+d[1]) : num(i.duration); }
        if (!dur && i.episode_run_time) dur = num(i.episode_run_time);
        return {
          title: i.name || item.name,
          originalTitle: i.o_name || '',
          poster: i.movie_image || i.cover_big || item.poster,
          backdrop: first(i.backdrop_path) || '',
          plot: i.plot || i.description || '',
          rating: num(i.rating) || item.rating || 0,
          year: String(i.releasedate || i.release_date || i.year || '').slice(0, 4),
          genre: i.genre || '',
          duration: dur,
          cast: i.cast || i.actors || '',
          director: i.director || '',
          country: i.country || '',
          released: String(i.releasedate || i.release_date || ''),
          trailer: ytId(i.youtube_trailer || i.trailer),
          bitrate: num(i.bitrate),
          video: i.video && !Array.isArray(i.video) ? i.video : null,
          ext: (r.movie_data && r.movie_data.container_extension) || item.ext
        };
      });
    }).then(null, function () { return base; });
  }

  function seriesInfo(item) {
    if (m3u) {
      var seasons = {}, src = item;
      if (!src._eps) m3u.series.forEach(function (s) { if (s.id === item.id || (s.name === item.name && s.catId === item.catId)) src = s; });
      (src._eps || []).forEach(function (e) { (seasons[e.season] = seasons[e.season] || []).push(e); });
      return Promise.resolve({
        title: item.name, poster: item.poster, backdrop: '', plot: '', rating: 0, year: '', genre: '',
        seasons: Object.keys(seasons).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
          return { num: n, episodes: seasons[n].sort(function (a, b) { return a.num - b.num; }) };
        })
      });
    }
    return cached('si:' + item.id, function () {
      return api('get_series_info', '&series_id=' + encodeURIComponent(item.id)).then(function (r) {
        var i = (r && r.info) || {};
        if (Array.isArray(i)) i = {};
        var bySeason = {};
        var eps = r && r.episodes;
        var groups = Array.isArray(eps) ? eps : arr(eps);
        groups.forEach(function (g) {
          arr(g).forEach(function (e) {
            if (!e || !e.id) return;
            var inf = (e.info && !Array.isArray(e.info)) ? e.info : {};
            var sn = parseInt(e.season, 10) || 1;
            (bySeason[sn] = bySeason[sn] || []).push({
              id: String(e.id), season: sn, num: parseInt(e.episode_num, 10) || 0,
              title: e.title || '', ext: e.container_extension || 'mp4',
              plot: inf.plot || '', img: inf.movie_image || inf.cover_big || '',
              duration: num(inf.duration_secs) / 60, rating: num(inf.rating)
            });
          });
        });
        return {
          title: i.name || item.name,
          poster: i.cover || item.poster,
          backdrop: first(i.backdrop_path) || item.backdrop || '',
          plot: i.plot || item.plot || '',
          rating: num(i.rating) || item.rating || 0,
          year: String(i.releaseDate || i.release_date || item.year || '').slice(0, 4),
          genre: i.genre || item.genre || '',
          cast: i.cast || '',
          director: i.director || '',
          country: i.country || '',
          released: String(i.releaseDate || i.release_date || ''),
          trailer: ytId(i.youtube_trailer || i.trailer),
          duration: num(i.episode_run_time),
          seasons: Object.keys(bySeason).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
            return { num: n, episodes: bySeason[n].sort(function (a, b) { return a.num - b.num; }) };
          })
        };
      });
    });
  }

  function epg(item) {
    if (m3u || !acc || acc.type !== 'xtream') return Promise.resolve([]);
    return api('get_short_epg', '&stream_id=' + encodeURIComponent(item.id) + '&limit=3').then(function (r) {
      return arr(r && r.epg_listings).map(function (e) {
        return { title: U.b64(e.title), desc: U.b64(e.description), start: num(e.start_timestamp) * 1000, end: num(e.stop_timestamp) * 1000 };
      }).filter(function (e) { return e.end > Date.now(); });
    }).then(null, function () { return []; });
  }

  // ---- geri izle (catch-up) ----
  // Arşivdeki geçmiş programlar; en yeni başta. Xtream: get_simple_data_table
  function archive(item) {
    if (m3u || !acc || acc.type !== 'xtream' || !item.archive) return Promise.resolve([]);
    return cached('ar:' + item.id, function () {
      return api('get_simple_data_table', '&stream_id=' + encodeURIComponent(item.id)).then(function (r) {
        var now = Date.now(), from = now - item.archive * 86400000;
        return arr(r && r.epg_listings).map(function (e) {
          return {
            title: U.b64(e.title) || 'Program', desc: U.b64(e.description),
            start: num(e.start_timestamp) * 1000, end: num(e.stop_timestamp) * 1000,
            startStr: String(e.start || ''),          // sunucunun yerel saati: "2024-05-10 20:00:00"
            has: e.has_archive === undefined ? true : num(e.has_archive) > 0
          };
        }).filter(function (e) {
          // Bitmiş arşiv programları + şu an yayındaki program (baştan izle)
          return e.start && e.end > e.start && e.start < now && e.start >= from && (e.has || e.end > now);
        }).sort(function (a, b) { return b.start - a.start; });
      });
    });
  }

  // Timeshift başlangıcı sunucu saatiyle "YYYY-MM-DD:HH-MM" biçiminde istenir
  function tsStart(e) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(e.startStr);
    if (m) return m[1] + '-' + m[2] + '-' + m[3] + ':' + m[4] + '-' + m[5];
    var d = new Date(e.start), p2 = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ':' + p2(d.getHours()) + '-' + p2(d.getMinutes());
  }

  // Bazı sağlayıcılar arşivi yalnızca timeshift.php ile verir; oynatıcı ilk biçim açılmazsa bunu dener
  function timeshiftAlt(o) {
    var mins = Math.ceil((o.prog.end - o.prog.start) / 60000) + 5;
    return acc.server + '/streaming/timeshift.php?username=' + encodeURIComponent(acc.user) + '&password=' + encodeURIComponent(acc.pass) +
      '&stream=' + encodeURIComponent(o.id) + '&start=' + tsStart(o.prog) + '&duration=' + mins;
  }

  function url(kind, o) {
    if (o.url) return o.url;
    var b = acc.server, u = encodeURIComponent(acc.user), p = encodeURIComponent(acc.pass);
    if (kind === 'timeshift') {
      // o: { id: kanal, prog: arşiv programı }; süre dakika, sona 5 dk pay
      var mins = Math.ceil((o.prog.end - o.prog.start) / 60000) + 5;
      return b + '/timeshift/' + u + '/' + p + '/' + mins + '/' + tsStart(o.prog) + '/' + o.id + '.ts';
    }
    if (kind === 'live') return b + '/live/' + u + '/' + p + '/' + o.id + '.' + Store.setting('liveExt');
    if (kind === 'movie') return b + '/movie/' + u + '/' + p + '/' + o.id + '.' + (o.ext || 'mp4');
    return b + '/series/' + u + '/' + p + '/' + o.id + '.' + (o.ext || 'mp4');
  }

  return {
    langOf: langOf, langName: langName, rawCats: rawCats, catHidden: catHidden,
    setAccount: setAccount, login: login, loadM3U: loadM3U, useParsed: useParsed, normServer: normServer,
    cats: cats, list: list, all: all, movieInfo: movieInfo, seriesInfo: seriesInfo, epg: epg, url: url, archive: archive, timeshiftAlt: timeshiftAlt,
    isM3U: function () { return !!m3u; }, account: function () { return acc; }, parseM3U: parseM3U,
    hasAdult: function (type) { return rawCats(type).then(function (l) { return l.some(function (c) { return isAdultName(c.name); }); }); }
  };
})();

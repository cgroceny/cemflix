/* Cemflix TV - oynatıcı katmanı: Samsung AVPlay, yoksa HTML5 video (tarayıcıda test için) */
var Player = (function () {
  'use strict';

  var av = null;
  try { if (typeof webapis !== 'undefined' && webapis.avplay) av = webapis.avplay; } catch (e) { av = null; }
  if (av) {
    // AVPlay görüntüsü için gerekli nesne (yalnızca TV'de eklenir)
    var obj = document.createElement('object');
    obj.id = 'av-player';
    obj.setAttribute('type', 'application/avplayer');
    document.body.insertBefore(obj, document.body.firstChild);
  }

  var video = null, L = {}, active = false, durationMs = 0, playing = false, subTimer = null;

  // ---- dayanıklılık: otomatik yeniden bağlanma ve takılma bekçisi ----
  var MAX_RETRY = 6;
  var cur = null;          // { url, live, bitrate }
  var lastPos = 0;         // son bilinen konum (ms)
  var lastTick = 0;        // son konum güncellemesinin zamanı
  var bufSince = 0;        // arabelleğe almanın başladığı an (0 = almıyor)
  var retries = 0, retryTimer = null, healthyTimer = null, watchdog = null, session = 0;

  // Panel 4K mı? (S95B gibi UHD TV'lerde 4K çözme modu açılır)
  var uhd = false;
  try { uhd = !!(webapis.productinfo && webapis.productinfo.isUdPanelSupported && webapis.productinfo.isUdPanelSupported()); } catch (e) { uhd = false; }

  function bufferSecs() {
    // Ayarlar > Arabellek: normal 6/10 sn, geniş 15/20 sn
    return Store.setting('buffer') === 'large' ? { play: 15, resume: 20 } : { play: 6, resume: 10 };
  }

  // Canlı Xtream yayınında TS takılırsa HLS'e (ya da tersine) geç
  function altLiveUrl(u) {
    if (/\/live\/[^?]+\.ts(\?|$)/i.test(u)) return u.replace(/\.ts(\?|$)/i, '.m3u8$1');
    if (/\/live\/[^?]+\.m3u8(\?|$)/i.test(u)) return u.replace(/\.m3u8(\?|$)/i, '.ts$1');
    return null;
  }

  function scheduleRecover(reason) {
    if (!active || retryTimer) return;
    if (retries >= MAX_RETRY) { emit('onError', reason); return; }
    retries++;
    clearTimeout(healthyTimer);
    if (cur.live && retries === 3) {
      var alt = altLiveUrl(cur.url);
      if (alt) cur.url = alt;
    }
    // Yedek adres (ör. arşivde timeshift.php biçimi): iki başarısız denemeden sonra geç
    if (cur.alt && retries === 2) { cur.url = cur.alt; cur.alt = null; }
    emit('onRetry', retries, MAX_RETRY);
    var wait = Math.min(8000, 700 * Math.pow(2, retries - 1));
    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (!active) return;
      var at = cur.live ? 0 : Math.max(0, lastPos - 2000);
      start(at);
    }, wait);
  }

  function markHealthy() {
    // 40 sn sorunsuz oynatma sonrası deneme sayacını sıfırla
    clearTimeout(healthyTimer);
    healthyTimer = setTimeout(function () { retries = 0; }, 40000);
  }

  function startWatchdog() {
    clearInterval(watchdog);
    watchdog = setInterval(function () {
      if (!active || !playing || retryTimer) return;
      var now = Date.now();
      if (bufSince && now - bufSince > 25000) { bufSince = 0; scheduleRecover('Yayın çok uzun süre arabelleğe alındı'); return; }
      if (!bufSince && lastTick && now - lastTick > 15000) { lastTick = now; scheduleRecover('Yayın dondu'); }
    }, 3000);
  }

  function onTick(t) {
    if (t !== lastPos) { lastPos = t; lastTick = Date.now(); }
    emit('onTime', t);
  }

  var LANG = {
    tur: 'Türkçe', tr: 'Türkçe', eng: 'İngilizce', en: 'İngilizce', ger: 'Almanca', deu: 'Almanca', de: 'Almanca',
    fre: 'Fransızca', fra: 'Fransızca', fr: 'Fransızca', spa: 'İspanyolca', es: 'İspanyolca', ita: 'İtalyanca', it: 'İtalyanca',
    rus: 'Rusça', ru: 'Rusça', ara: 'Arapça', ar: 'Arapça', jpn: 'Japonca', ja: 'Japonca', kor: 'Korece', ko: 'Korece',
    por: 'Portekizce', pt: 'Portekizce', dut: 'Felemenkçe', nld: 'Felemenkçe', nl: 'Felemenkçe', pol: 'Lehçe', pl: 'Lehçe',
    gre: 'Yunanca', ell: 'Yunanca', el: 'Yunanca', per: 'Farsça', fas: 'Farsça', hin: 'Hintçe', chi: 'Çince', zho: 'Çince',
    swe: 'İsveççe', nor: 'Norveççe', dan: 'Danca', fin: 'Fince', hun: 'Macarca', cze: 'Çekçe', ces: 'Çekçe', rum: 'Rumence', ron: 'Rumence',
    bul: 'Bulgarca', heb: 'İbranice', aze: 'Azerice', kur: 'Kürtçe', und: 'Bilinmiyor'
  };
  function langName(code, fallback) {
    code = String(code || '').toLowerCase();
    return LANG[code] || (code ? code.toUpperCase() : fallback);
  }

  function emit(n, a, b) { if (L[n]) { try { L[n](a, b); } catch (e) { console.error(e); } } }

  function ensureVideo() {
    if (!video) {
      video = document.createElement('video');
      video.id = 'html-video';
      video.setAttribute('playsinline', '');
      document.getElementById('video-layer').appendChild(video);
      video.addEventListener('timeupdate', function () { if (active) onTick(video.currentTime * 1000); });
      video.addEventListener('waiting', function () { if (active) { bufSince = Date.now(); emit('onBuffer', true); } });
      video.addEventListener('playing', function () { if (active) { bufSince = 0; markHealthy(); emit('onBuffer', false); } });
      video.addEventListener('ended', function () { if (active) emit('onEnd'); });
      video.addEventListener('error', function () { if (active) scheduleRecover('Medya hatası ' + (video.error ? video.error.code : '')); });
      video.addEventListener('loadedmetadata', function () {
        if (!active) return;
        durationMs = isFinite(video.duration) ? video.duration * 1000 : 0;
      });
    }
    return video;
  }

  // opts: { live: canlı yayın mı, bitrate: sabit kalite (yalnızca çok kaliteli HLS) }
  function open(url, startMs, listeners, opts) {
    stop();
    L = listeners || {};
    opts = opts || {};
    cur = { url: url, live: !!opts.live, bitrate: opts.bitrate || 0, alt: opts.alt || null };
    retries = 0;
    subOffset = 0;
    active = true;
    startWatchdog();
    start(startMs || 0);
  }

  // Asıl başlatma; yeniden bağlanırken de kullanılır
  function start(startMs) {
    var my = ++session;
    durationMs = 0; playing = false; lastPos = startMs; lastTick = Date.now(); bufSince = Date.now();
    var url = cur.url, isHls = /\.m3u8(\?|$)/i.test(url);
    if (av) {
      try { av.stop(); } catch (e) { }
      try { av.close(); } catch (e) { }
      try {
        av.open(url);
        av.setDisplayRect(0, 0, 1920, 1080);
        try { av.setDisplayMethod(Store.setting('display')); } catch (e) { }
        // Arabellek: anlık hız düşüşlerinde takılmayı azaltır
        var b = bufferSecs();
        try { av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', b.play); } catch (e) { }
        try { av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', b.resume); } catch (e) { }
        try { av.setTimeoutForBuffering(20); } catch (e) { }
        // Kalite: 4K panelde 4K çözme modu; HLS'te en yüksek kaliteden başla, en düşüğe hiç inme
        if (uhd) { try { av.setStreamingProperty('SET_MODE_4K', 'TRUE'); } catch (e) { } }
        if (isHls) {
          var ai = 'STARTBITRATE=HIGHEST|SKIPBITRATE=LOWEST';
          if (cur.bitrate) ai = 'BITRATES=' + cur.bitrate + '~' + cur.bitrate + '|STARTBITRATE=HIGHEST';
          try { av.setStreamingProperty('ADAPTIVE_INFO', ai); } catch (e) { }
        }
        av.setListener({
          onbufferingstart: function () { if (my === session) { bufSince = Date.now(); emit('onBuffer', true); } },
          onbufferingprogress: function () { },
          onbufferingcomplete: function () { if (my === session) { bufSince = 0; emit('onBuffer', false); } },
          oncurrentplaytime: function (t) { if (my === session) onTick(t); },
          onstreamcompleted: function () {
            if (my !== session) return;
            // Canlı yayın "bitti" diyorsa bu aslında kopmadır
            if (cur.live) scheduleRecover('Yayın kesildi'); else emit('onEnd');
          },
          onerror: function (e) { if (my === session) scheduleRecover(String(e)); },
          onevent: function () { },
          ondrmevent: function () { },
          onsubtitlechange: function (dur, text) {
            emit('onSub', text);
            clearTimeout(subTimer);
            var d = parseInt(dur, 10);
            if (d > 0) subTimer = setTimeout(function () { emit('onSub', ''); }, d);
          }
        });
        emit('onBuffer', true);
        av.prepareAsync(function () {
          if (!active || my !== session) return;
          try { durationMs = av.getDuration() || 0; } catch (e) { durationMs = 0; }
          if (startMs > 0 && durationMs > 0) {
            try { av.seekTo(Math.floor(startMs), function () { }, function () { }); } catch (e) { }
          }
          av.play();
          playing = true;
          if (subOffset) { try { av.setSubtitlePosition(subOffset); } catch (e) { } }
          bufSince = 0; lastTick = Date.now();
          markHealthy();
          emit('onBuffer', false);
          emit('onReady');
        }, function (e) { if (my === session) scheduleRecover(String(e)); });
      } catch (e) {
        scheduleRecover(e && e.message ? e.message : String(e));
      }
      return;
    }
    var v = ensureVideo();
    v.src = url;
    emit('onBuffer', true);
    var once = function () {
      v.removeEventListener('loadedmetadata', once);
      if (my !== session) return;
      if (startMs > 0) v.currentTime = startMs / 1000;
      emit('onReady');
    };
    v.addEventListener('loadedmetadata', once);
    var p = v.play();
    playing = true;
    if (p && p.then) p.then(null, function () { });
  }

  function stop() {
    if (!active) return;
    active = false; playing = false;
    session++;
    clearTimeout(subTimer); clearTimeout(retryTimer); clearTimeout(healthyTimer); clearInterval(watchdog);
    retryTimer = null;
    if (av) {
      try { av.stop(); } catch (e) { }
      try { av.close(); } catch (e) { }
    } else if (video) {
      video.pause();
      video.removeAttribute('src');
      try { video.load(); } catch (e) { }
    }
  }

  function pause() {
    playing = false;
    if (av) { try { av.pause(); } catch (e) { } } else if (video) video.pause();
  }
  function resume() {
    playing = true;
    lastTick = Date.now();
    if (av) { try { av.play(); } catch (e) { } } else if (video) { var p = video.play(); if (p && p.then) p.then(null, function () { }); }
  }
  function toggle() { if (playing) pause(); else resume(); return playing; }

  function seek(ms) {
    ms = Math.max(0, Math.floor(ms));
    lastTick = Date.now(); lastPos = ms;
    if (av) { try { av.seekTo(ms, function () { }, function () { }); } catch (e) { } }
    else if (video) video.currentTime = ms / 1000;
  }

  function duration() {
    if (av && active) { try { durationMs = av.getDuration() || durationMs; } catch (e) { } }
    else if (video && isFinite(video.duration)) durationMs = video.duration * 1000;
    return durationMs;
  }

  function parseExtra(s) {
    if (!s) return {};
    if (typeof s === 'object') return s;
    try { return JSON.parse(s); } catch (e) {
      var o = {}, m = /language["']?\s*[:=]\s*["']?(\w+)/i.exec(s) || /track_lang["']?\s*[:=]\s*["']?(\w+)/i.exec(s);
      if (m) o.language = m[1];
      return o;
    }
  }

  // Ses ve altyazı izleri; aynı dil birden çok kez varsa numaralanır: Türkçe, Türkçe (2)
  function tracks() {
    var out = { audio: [], text: [], curAudio: -1, curText: -1, subsOff: false };
    if (!av || !active) return out;
    var info = [];
    try { info = av.getTotalTrackInfo() || []; } catch (e) { return out; }
    var count = {};
    for (var i = 0; i < info.length; i++) {
      var t = info[i], type = String(t.type).toUpperCase();
      if (type !== 'AUDIO' && type !== 'TEXT') continue;
      var ex = parseExtra(t.extra_info);
      var name = langName(ex.language || ex.track_lang, type === 'AUDIO' ? 'Ses' : 'Altyazı');
      var key = type + name;
      count[key] = (count[key] || 0) + 1;
      var label = count[key] > 1 ? name + ' (' + count[key] + ')' : name;
      if (type === 'AUDIO' && ex.channels) label += ' · ' + (ex.channels > 2 ? (ex.channels === 6 ? '5.1' : ex.channels + 'ch') : 'Stereo');
      (type === 'AUDIO' ? out.audio : out.text).push({ index: t.index, label: label });
    }
    try {
      var curr = av.getCurrentStreamInfo() || [];
      curr.forEach(function (c) {
        var ty = String(c.type).toUpperCase();
        if (ty === 'AUDIO') out.curAudio = c.index;
        if (ty === 'TEXT') out.curText = c.index;
      });
    } catch (e) { }
    out.subsOff = !!Player._subsOff;
    return out;
  }

  function selectTrack(kind, index) {
    if (!av) return;
    try {
      av.setSelectTrack(kind, index);
      if (kind === 'TEXT') { av.setSilentSubtitle(false); Player._subsOff = false; }
    } catch (e) { U.toast('İz değiştirilemedi'); }
  }

  function subsOff() {
    Player._subsOff = true;
    if (av) { try { av.setSilentSubtitle(true); } catch (e) { } }
    emit('onSub', '');
  }

  // ---- altyazı senkronu (ms; artı = altyazı geç gelir) ----
  var subOffset = 0;
  function subShift(deltaMs) {
    subOffset = deltaMs === null ? 0 : subOffset + deltaMs;
    if (av && active) { try { av.setSubtitlePosition(subOffset); } catch (e) { } }
    return subOffset;
  }

  // Tercih edilen dilde ses / altyazı izini seç ('tr' → 'Türkçe')
  function applyLangPrefs(audioLang, subLang) {
    if (!av || !active) return;
    var t = tracks();
    var want = function (code) { return langName(code, ''); };
    if (audioLang && audioLang !== 'orig') {
      var a = t.audio.filter(function (x) { return x.label.indexOf(want(audioLang)) === 0; })[0];
      if (a && a.index !== t.curAudio) selectTrack('AUDIO', a.index);
    }
    if (subLang === 'off') subsOff();
    else if (subLang) {
      var s = t.text.filter(function (x) { return x.label.indexOf(want(subLang)) === 0; })[0];
      if (s) selectTrack('TEXT', s.index);
    }
  }

  // ---- görüntü kalitesi ----
  function num(x) { var n = parseInt(x, 10); return isNaN(n) ? 0 : n; }

  function videoTracks() {
    var out = [];
    if (!av || !active) return out;
    var info = [];
    try { info = av.getTotalTrackInfo() || []; } catch (e) { return out; }
    for (var i = 0; i < info.length; i++) {
      if (String(info[i].type).toUpperCase() !== 'VIDEO') continue;
      var ex = parseExtra(info[i].extra_info);
      out.push({ index: info[i].index, w: num(ex.Width || ex.width), h: num(ex.Height || ex.height), bitrate: num(ex.Bit_rate || ex.bitrate || ex.Bitrate) });
    }
    return out;
  }

  function resLabel(w, h) {
    if (!h) return '';
    var name = h >= 2000 ? '4K' : h >= 1400 ? '1440p' : h >= 1000 ? '1080p' : h >= 700 ? '720p' : h >= 540 ? '576p' : h + 'p';
    return name + '  (' + w + '×' + h + ')';
  }

  // Seçilebilir kaliteler: yalnızca birden çok kalite sunan HLS yayınlarında dolu gelir
  function qualities() {
    var t = videoTracks().filter(function (v) { return v.bitrate > 0; });
    var seen = {}, list = [];
    t.sort(function (a, b) { return b.bitrate - a.bitrate; }).forEach(function (v) {
      if (seen[v.bitrate]) return;
      seen[v.bitrate] = 1;
      list.push({ bitrate: v.bitrate, label: (resLabel(v.w, v.h) || 'Kalite') + '  ·  ' + (v.bitrate / 1e6).toFixed(1) + ' Mbps' });
    });
    return list.length > 1 ? list : [];
  }

  // Şu an oynayan görüntünün çözünürlüğü
  function currentVideo() {
    if (av && active) {
      try {
        var c = av.getCurrentStreamInfo() || [];
        for (var i = 0; i < c.length; i++) {
          if (String(c[i].type).toUpperCase() !== 'VIDEO') continue;
          var ex = parseExtra(c[i].extra_info);
          return resLabel(num(ex.Width || ex.width), num(ex.Height || ex.height));
        }
      } catch (e) { }
      return '';
    }
    if (video && video.videoHeight) return resLabel(video.videoWidth, video.videoHeight);
    return '';
  }

  // Kaliteyi değiştir (0 = otomatik). Yayın kaldığı yerden yeniden açılır.
  function setQuality(bitrate) {
    if (!active || !cur) return;
    cur.bitrate = bitrate || 0;
    retries = 0;
    start(cur.live ? 0 : lastPos);
  }

  function setDisplay(mode) {
    Store.setSetting('display', mode);
    if (av && active) { try { av.setDisplayMethod(mode); } catch (e) { } }
  }

  document.addEventListener('visibilitychange', function () {
    if (!av || !active) return;
    try { if (document.hidden) av.suspend(); else av.restore(); } catch (e) { }
  });

  return {
    open: open, stop: stop, pause: pause, resume: resume, toggle: toggle, seek: seek, duration: duration,
    tracks: tracks, selectTrack: selectTrack, subsOff: subsOff, setDisplay: setDisplay,
    qualities: qualities, setQuality: setQuality, currentVideo: currentVideo,
    subShift: subShift, subOffset: function () { return subOffset; }, applyLangPrefs: applyLangPrefs,
    quality: function () { return cur ? cur.bitrate : 0; }, isUhd: function () { return uhd; },
    isPlaying: function () { return playing; }, isNative: function () { return !!av; }, _subsOff: false
  };
})();

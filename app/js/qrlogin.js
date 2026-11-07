/* Cemflix TV - QR ile giriş
 * TV rastgele bir kanal adı ve 32 baytlık anahtar üretir, ikisini QR'daki adresin # kısmına koyar.
 * Telefon sayfası bilgileri bu anahtarla şifreler (NaCl secretbox) ve ntfy.sh kanalına yollar.
 * Anahtar QR'dan dışarı çıkmaz; aracı sunucu yalnızca şifreli veriyi görür.
 */
var QrLogin = (function () {
  'use strict';

  var PAGE = 'https://cgroceny.github.io/cemflix-qr/';
  var RELAY = 'https://ntfy.sh/';
  var TTL = 10 * 60 * 1000; // QR 10 dakika geçerli

  var es = null, xhr = null, pollT = null, ttlT = null, session = 0;

  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function unb64url(str) {
    str = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var s = atob(str), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function utf8Decode(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }

  function pageUrl() {
    try { var o = localStorage.getItem('cemflix.qrPage'); if (o) return o; } catch (e) { }
    return PAGE;
  }

  function decrypt(msg, key) {
    try {
      var parts = String(msg).split('.');
      if (parts.length !== 2) return null;
      var plain = nacl.secretbox.open(unb64url(parts[1]), unb64url(parts[0]), key);
      if (!plain) return null;
      var c = JSON.parse(utf8Decode(plain));
      if (c && c.type === 'xtream' && c.server && c.user && c.pass) return { type: 'xtream', server: String(c.server), user: String(c.user), pass: String(c.pass) };
      if (c && c.type === 'm3u' && /^https?:\/\//i.test(c.url || '')) return { type: 'm3u', url: String(c.url) };
    } catch (e) { }
    return null;
  }

  function stop() {
    session++;
    if (es) { try { es.close(); } catch (e) { } es = null; }
    if (xhr) { try { xhr.abort(); } catch (e) { } xhr = null; }
    if (pollT) { clearTimeout(pollT); pollT = null; }
    if (ttlT) { clearTimeout(ttlT); ttlT = null; }
  }

  // onCreds(creds): bilgiler geldi.  onState('ready' | 'waiting' | 'expired')
  function start(onCreds, onState) {
    stop();
    var my = ++session;
    var topic = 'cemflix-' + b64url(nacl.randomBytes(18));
    var key = nacl.randomBytes(32);
    var since = Math.floor(Date.now() / 1000);

    function handle(raw) {
      if (my !== session) return;
      var d;
      try { d = JSON.parse(raw); } catch (e) { return; }
      if (!d || d.event !== 'message' || !d.message) return;
      var creds = decrypt(d.message, key);
      if (!creds) return;
      stop();
      onCreds(creds);
    }

    if (typeof EventSource !== 'undefined') {
      es = new EventSource(RELAY + topic + '/sse?since=' + since);
      es.onopen = function () { if (my === session) onState('ready'); };
      es.onerror = function () { if (my === session) onState('waiting'); };
      es.onmessage = function (ev) { handle(ev.data); };
    } else {
      // EventSource yoksa kısa aralıklı yoklama
      (function poll() {
        if (my !== session) return;
        xhr = new XMLHttpRequest();
        xhr.open('GET', RELAY + topic + '/json?poll=1&since=' + since, true);
        xhr.timeout = 15000;
        xhr.onload = function () {
          if (my !== session) return;
          onState('ready');
          String(xhr.responseText || '').split('\n').forEach(function (l) { if (l) handle(l); });
          pollT = setTimeout(poll, 6000);
        };
        xhr.onerror = xhr.ontimeout = function () { if (my === session) { onState('waiting'); pollT = setTimeout(poll, 6000); } };
        xhr.send();
      })();
    }

    ttlT = setTimeout(function () { if (my === session) { stop(); onState('expired'); } }, TTL);
    return pageUrl() + '#t=' + topic + '&k=' + b64url(key);
  }

  // QR görüntüsü (GIF data URL)
  function image(text) {
    var q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createDataURL(8, 0);
  }

  return { start: start, stop: stop, image: image };
})();

/* Cemflix TV - başlangıç */
(function () {
  'use strict';

  function registerKeys() {
    if (typeof tizen === 'undefined' || !tizen.tvinputdevice) return;
    var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
      'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'Info',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    keys.forEach(function (k) { try { tizen.tvinputdevice.registerKey(k); } catch (e) { } });
  }

  // Ayarlar > Açılışta: "Son izlenen kanalı oynat"
  function openStartup() {
    // Birden çok profil varsa önce "Kim izliyor?"
    if (Store.profiles().length > 1) { Nav.root('profiles'); return; }
    var r = Store.recentLive();
    if (Store.setting('startup') === 'lastLive' && r.length) Nav.go('player', { kind: 'live', list: r, index: 0 });
  }

  function start() {
    // TV'de ağır görsel efektler kapatılır (css: body.tv)
    if (typeof tizen !== 'undefined') document.body.classList.add('tv');
    Brand.showSplash();
    registerKeys();
    Nav.init(document.getElementById('screens'), document.getElementById('topbar'), document.getElementById('modals'));
    Screens.registerAll();

    var acc = Store.account();
    if (!acc) { Nav.root('login'); Brand.hideSplash(); return; }
    Data.setAccount(acc);
    if (acc.type === 'm3u') {
      U.loading(true, 'Liste yükleniyor…');
      Data.loadM3U().then(function () {
        U.loading(false);
        Nav.root('home');
        Brand.hideSplash();
        openStartup();
      }, function (e) {
        U.loading(false);
        Brand.hideSplash();
        U.toast('Liste yüklenemedi: ' + e.message, 5000);
        Nav.root('login');
      });
    } else {
      Nav.root('home');
      Brand.hideSplash();
      openStartup();
      // hesap bilgisini (bitiş tarihi vb.) arka planda tazele
      Data.login({ type: 'xtream', server: acc.server, user: acc.user, pass: acc.pass }).then(function (r) {
        Store.setAccInfo(r.info);
      }, function (e) {
        if (/hatalı|durumu/.test(e.message)) U.toast(e.message + ' — Ayarlar\'dan hesabı güncelleyin', 6000);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

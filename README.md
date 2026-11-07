# Cemflix — Samsung Tizen TV için IPTV oynatıcısı

Samsung Smart TV'ler için yazılmış bir IPTV uygulaması. Xtream Codes hesabıyla ya da M3U bağlantısıyla canlı yayın, film ve dizi izlenir. Uygulama içerik barındırmaz; hesap bilgileri yalnızca TV'de saklanır.

- **Hedef:** Tizen 3.0 (2017) ve sonrası. 2022 model bir Samsung OLED TV (Tizen 6.5) üzerinde test edildi.
- **Kod:** saf ES5, derleme adımı yok. Eski TV tarayıcılarında da çalışır.
- **Paket:** `CemflixTV1`, uygulama kimliği `CemflixTV1.Cemflix`.

## Özellikler

**Giriş ve profiller**
- Üç giriş yolu:
  - QR kodu: telefonda açılan sayfaya bilgileri yaz, TV'ye şifreli olarak gelsin.
  - Xtream hesabı.
  - M3U bağlantısı. `get.php?username=…` biçimindeki bağlantı otomatik olarak Xtream hesabına çevrilir.
- Aile profilleri: her profilin kendi Listem'i, izleme geçmişi ve son kanalları var.
- Çocuk profili: yalnızca çocuk kategorileri görünür, çıkmak için PIN gerekir.
- **Gizli profil:** izleme geçmişi, kaldığın yer ve son kanallar kaydedilmez.

**Ana sayfa**
- Vitrin ve "İzlemeye devam et" (yatay kartlarda kalan süre).
- Kanallarım (favoriler ve son izlenenler).
- Akıllı satırlar: son eklenenler, en yüksek puanlılar, yeni bölüm gelen diziler.
- Satır hizalı kaydırma ve satır hafızası.

**Canlı TV**
- Kategoriler ve kanal listesi, şimdiki ve sonraki program.
- **Geri izle (catch-up):** sağlayıcı arşivi varsa geçmiş programlar ya da şu anki programı baştan izleme.
- Oynatırken **CH + / CH −** ile kanal değiştirme, ◀ ile kanal listesi, numara tuşlarıyla kanal numarası.

**Filmler ve diziler**
- Sıralama (yeni / puan / A–Z) ve parça parça yüklenen ızgara.
- Film ve dizi künyesi (oyuncular, yönetmen, ülke, çıkış tarihi), fragman (YouTube), benzer içerikler.
- Sezon ve bölüm listesi, izlendi işaretleri, sıradaki bölüme otomatik geçiş.

**Oynatıcı (Samsung AVPlay)**
- Kopma ve donmalarda otomatik yeniden bağlanma (6 deneme, TS ↔ HLS geçişi) ve takılma bekçisi.
- Kalite seçimi ve 4K panel modu.
- Ses ve altyazı izi seçimi, altyazı senkronu, dil tercihleri.
- Uyku zamanlayıcısı ve görüntü oranı seçimi.

**İçerik filtresi**
- Dil ve ülke grupları otomatik bulunur ("DE | Sport", "[DE] …", "UK: …" gibi). Grup grup gizlenebilir; "Yalnızca Türkiye" ile tek seferde.
- Kategoriler tek tek gizlenebilir. Listede OK'a basılı tutmak da kategoriyi gizler.
- Yetişkin kategorileri PIN'li çocuk kilidiyle gizlenir.

**Görünüm**
- Koyu, açık ve otomatik tema (07:00–19:00 arası açık).
- OLED ekran koruyucu.
- TV'de ağır görsel efektler otomatik kapanır (`body.tv`).

## Kumanda

| Tuş | Menülerde | Canlı yayında | Film / dizide |
|---|---|---|---|
| Yön tuşları | Gezinme (liste sonunda odak yerinde kalır) | ▲ ▶ menü · ▼ bilgi · ◀ kanal listesi | ◀ ▶ 10 sn sar · ▲ menü · ▼ bilgi |
| OK | Seç · **basılı tut:** listeden çıkar / gizle | Bilgi kartı | Duraklat / oynat |
| CH + / CH − | Listede sayfa atla | Kanal değiştir | Sıradaki bölüm |
| 0–9 | — | Kanal numarası | %0–90 konuma atla |
| Geri | Geri / çıkış onayı | Çıkış | Çıkış |

## TV'ye kurulum (Windows)

1. [KURULUM.txt](KURULUM.txt) dosyasındaki hazırlığı yap: Tizen Studio CLI'yi kur, TV'de geliştirici modunu aç.
2. `KUR-Cemflix.bat`'a çift tıkla ve TV'nin IP adresini gir.
3. Betik sırasıyla bağlanır, imza sertifikasını hazırlar, paketler, kurar ve uygulamayı açar.

Komut satırından da yapılabilir:

```bash
set JAVA_TOOL_OPTIONS=-Duser.language=en -Duser.country=US
tizen package -t wgt -s cemflix -- app
sdb connect <TV_IP>
tizen install -n Cemflix.wgt -s <TV_IP>:26101 -- app
tizen run -p CemflixTV1.Cemflix -s <TV_IP>:26101
```

> Türkçe Windows'ta Java'nın "Türkçe I" hatası sertifika üretimini bozar. Bu yüzden `JAVA_TOOL_OPTIONS` gerekiyor.

## Bilgisayarda geliştirme

Gerçek hesap gerektirmeyen iki yardımcı araç var:

```bash
python dev-server.py      # uygulama: http://localhost:8080  (önbelleksiz)
python mock-xtream.py     # sahte Xtream sunucusu: http://localhost:8090  (giriş: demo / demo)
```

- Tarayıcıda `http://localhost:8080` adresini aç ve sunucu olarak `http://localhost:8090`, kullanıcı ve şifre olarak `demo` gir.
- Klavyede yön tuşları, Enter ve Esc kullanılır.
- Arayüz 1920×1080 tasarlandı ve pencereye ölçeklenir.
- Tarayıcıda AVPlay yerine HTML5 video kullanılır.

## Dosyalar

```
app/                   Tizen web uygulaması (TV'ye bu klasör paketlenir)
  config.xml           Paket tanımı ve izinler
  index.html           Giriş noktası
  css/style.css        1920×1080 TV arayüzü (koyu tema + TV performans kuralları)
  css/theme-light.css  Açık tema
  js/util.js           Yardımcılar, kalıcı veri, profiller
  js/nav.js            Kumanda tuşları, uzamsal odak, ekran yığını
  js/data.js           Xtream API, M3U ayrıştırıcı, dil ve kategori filtresi
  js/player.js         AVPlay (TV) / HTML5 video (tarayıcı), yeniden bağlanma
  js/screens.js        Tüm ekranlar
  js/qrlogin.js        QR ile giriş (ntfy.sh üzerinden şifreli aktarım)
  js/brand.js          Logo ve açılış animasyonu
KUR-Cemflix.bat        Tek tıkla TV'ye kurulum
KURULUM.txt            Adım adım hazırlık ve sorun giderme
dev-server.py          Önbelleksiz yerel sunucu
mock-xtream.py         Sahte Xtream sunucusu (kurgusal içerik)
```

QR girişinin telefon sayfası ayrı bir depoda: [cgroceny/cemflix-qr](https://github.com/cgroceny/cemflix-qr).

## Gizlilik

- Hesap bilgileri yalnızca TV'nin yerel depolamasında tutulur.
- QR ile girişte bilgiler telefonda şifrelenir (NaCl secretbox). Anahtar yalnızca QR kodunda bulunur; aktarım sunucusu (ntfy.sh) içeriği okuyamaz.
- Uygulama hiçbir içerik barındırmaz ya da dağıtmaz. Yalnızca kullanıcının kendi IPTV hizmetini oynatır.

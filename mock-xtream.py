"""Cemflix icin sahte Xtream Codes sunucusu (yalnizca gelistirme/test).

Tum icerik kurgusaldir. Giris:  sunucu http://127.0.0.1:8090  kullanici: demo  sifre: demo
Afisler sunucunun urettigi SVG'lerdir; yayin adresleri oynatilamaz (oynatici hata verir).
"""
import base64
import hashlib
import http.server
import json
import random
import time
import urllib.parse

PORT = 8090
HOST = "http://127.0.0.1:%d" % PORT
NOW = int(time.time())
rnd = random.Random(7)

ADJ = ["Sessiz", "Kayıp", "Son", "Gizli", "Kırık", "Uzak", "Karanlık", "Altın", "Mavi", "Yalnız", "Derin", "Eski"]
NOUN = ["Liman", "Vadi", "Şehir", "Ada", "Köprü", "Yol", "Rüzgâr", "Ayna", "Saat", "Fener", "Orman", "Mektup"]
GENRES = ["Dram", "Aksiyon", "Komedi", "Gerilim", "Bilim Kurgu", "Macera", "Romantik", "Belgesel", "Animasyon"]
FIRST = ["Deniz", "Ece", "Mert", "Zeynep", "Can", "Elif", "Kaan", "Defne", "Arda", "Selin", "Emre", "Nil"]
LAST = ["Aydın", "Yalçın", "Kaya", "Demir", "Şahin", "Koç", "Erdem", "Tekin", "Polat", "Uçar"]
PLOTS = [
    "Küçük bir sahil kasabasında yıllardır saklanan bir sır, eski bir mektubun ortaya çıkmasıyla herkesi yeniden bir araya getirir.",
    "Hayatını yeniden kurmaya çalışan genç bir mühendis, beklenmedik bir yolculukta kendini büyük bir maceranın ortasında bulur.",
    "İki eski dost, kaybolan bir haritanın peşinde ülkeyi baştan başa geçerken geçmişleriyle de yüzleşmek zorunda kalır.",
    "Şehrin en kalabalık gecesinde, birbirini hiç tanımayan beş kişinin yolları tek bir olay yüzünden kesişir.",
    "Uzak bir araştırma istasyonunda görev yapan ekip, kayıtlarda açıklanamayan bir sinyal fark eder.",
]


def title(i):
    return "%s %s" % (ADJ[i % len(ADJ)], NOUN[(i * 5 + 3) % len(NOUN)])


def people(n, seed):
    r = random.Random(seed)
    return ", ".join("%s %s" % (r.choice(FIRST), r.choice(LAST)) for _ in range(n))


MOVIE_CATS = [("10", "Yeni Eklenenler"), ("11", "Yerli Filmler"), ("12", "Yabancı Filmler"), ("13", "Çocuk & Aile"), ("14", "Yetişkin +18"), ("15", "DE | Filme HD"), ("16", "|UK| Movies")]
SERIES_CATS = [("20", "Yerli Diziler"), ("21", "Yabancı Diziler"), ("22", "Belgesel Serileri"), ("23", "DE: Serien")]
LIVE_CATS = [("30", "Ulusal"), ("31", "Haber"), ("32", "Spor"), ("33", "Çocuk"), ("34", "Belgesel"), ("35", "DE | Sport"), ("36", "[DE] Nachrichten"), ("37", "UK | News"), ("38", "TR | ULUSAL HD")]

MOVIES, SERIES, LIVE = [], [], []
n = 0
for cid, _ in MOVIE_CATS:
    for k in range(18):
        n += 1
        g = GENRES[n % len(GENRES)]
        MOVIES.append({
            "num": n, "name": title(n) + (" (%d)" % (2015 + n % 10)), "stream_type": "movie", "stream_id": 1000 + n,
            "stream_icon": "%s/img/m%d.svg" % (HOST, n), "rating": "%.1f" % (5 + (n * 37 % 45) / 10.0),
            "added": str(NOW - (n % 40) * 86400), "category_id": cid, "container_extension": "mp4",
            "_genre": g, "_year": 2015 + n % 10, "_dur": 85 + n * 7 % 70,
        })
s = 0
for cid, _ in SERIES_CATS:
    for k in range(10):
        s += 1
        SERIES.append({
            "num": s, "name": title(s + 50), "series_id": 2000 + s, "cover": "%s/img/s%d.svg" % (HOST, s),
            "plot": PLOTS[s % len(PLOTS)], "cast": people(4, s), "director": people(1, s + 99),
            "genre": GENRES[(s + 2) % len(GENRES)], "releaseDate": "%d-03-01" % (2016 + s % 9),
            "rating": "%.1f" % (6 + (s * 13 % 35) / 10.0), "backdrop_path": ["%s/img/sb%d.svg" % (HOST, s)],
            "category_id": cid, "last_modified": str(NOW - s * 86400),
        })
CH = {"30": ["Anadolu TV", "Marmara 1", "Ege Kanal", "Karadeniz TV", "Başkent HD"],
      "31": ["Haber 24", "Gündem TV", "Ekonomi Net", "Dünya Haber"],
      "32": ["Spor 1", "Spor 2", "Arena Spor", "Basket TV"],
      "33": ["Minik Kanal", "Çizgi TV", "Oyun Bahçesi"],
      "34": ["Doğa Belgesel", "Tarih TV", "Bilim Kanalı"],
      "35": ["Sport DE 1", "Fussball DE"], "36": ["Nachrichten DE"], "37": ["UK News 1", "UK News 2"], "38": ["TR Ulusal 1"]}
c = 0
for cid, names in CH.items():
    for nm in names:
        c += 1
        LIVE.append({"num": c, "name": nm, "stream_type": "live", "stream_id": 3000 + c,
                     "stream_icon": "%s/img/l%d.svg" % (HOST, c), "epg_channel_id": "ch%d" % c,
                     "category_id": cid,
                     # Ulusal ve Haber kanallarinda 3 gunluk arsiv (geri izle)
                     "tv_archive": 1 if cid in ("30", "31") else 0, "tv_archive_duration": 3 if cid in ("30", "31") else 0})

SHOWS = ["Sabah Kuşağı", "Ana Haber", "Belgesel Saati", "Akşam Filmi", "Spor Özeti", "Çizgi Film Kuşağı",
         "Gece Programı", "Yemek Atölyesi", "Gezi Rehberi", "Müzik Listesi", "Tartışma Masası", "Hava Durumu"]


def b64(t):
    return base64.b64encode(t.encode("utf-8")).decode()


def short_epg(sid, limit):
    r = random.Random(sid)
    start = NOW - r.randint(5, 50) * 60
    out = []
    for i in range(limit):
        dur = r.choice([30, 45, 60, 90])
        nm = r.choice(SHOWS)
        out.append({"id": str(i), "epg_id": str(sid), "title": b64(nm),
                    "description": b64(nm + " — " + r.choice(PLOTS)), "lang": "tr",
                    "start_timestamp": str(start), "stop_timestamp": str(start + dur * 60)})
        start += dur * 60
    return {"epg_listings": out}


def archive_table(sid):
    """Son 3 gunun programlari (has_archive=1) + bugunun kalan kismi."""
    r = random.Random(sid * 7)
    t = (NOW // 3600) * 3600 - 3 * 86400
    out = []
    while t < NOW + 6 * 3600:
        dur = r.choice([30, 45, 60, 90, 120])
        nm = r.choice(SHOWS)
        out.append({"id": str(t), "title": b64(nm), "description": b64(nm + " — " + r.choice(PLOTS)),
                    "start": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t)),
                    "end": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t + dur * 60)),
                    "start_timestamp": str(t), "stop_timestamp": str(t + dur * 60),
                    "now_playing": 1 if t <= NOW < t + dur * 60 else 0, "has_archive": 1 if t + dur * 60 < NOW else 0})
        t += dur * 60
    return {"epg_listings": out}


def svg(key):
    h = hashlib.md5(key.encode()).hexdigest()
    c1, c2 = "#" + h[:6], "#" + h[6:12]
    kind = key[0]
    label = ""
    try:
        idx = int("".join(ch for ch in key if ch.isdigit()))
        if kind == "m":
            label = title(idx)
        elif kind == "s":
            label = title(idx + 50)
        elif kind == "l":
            label = LIVE[idx - 1]["name"]
    except Exception:
        pass
    if kind in "ls":
        w, ht = (400, 225) if kind == "l" or key.startswith("sb") else (300, 450)
    else:
        w, ht = 300, 450
    if key.startswith("sb"):
        w, ht = 1280, 720
    words = label.split()
    text = "".join('<tspan x="50%%" dy="%s">%s</tspan>' % ("0" if i == 0 else "1.15em", t) for i, t in enumerate(words))
    fs = int(w / 9)
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%s"/>'
            '<stop offset="1" stop-color="%s"/></linearGradient></defs><rect width="100%%" height="100%%" fill="url(#g)"/>'
            '<rect width="100%%" height="100%%" fill="rgba(0,0,0,.25)"/>'
            '<text x="50%%" y="%d" text-anchor="middle" font-family="Segoe UI,Arial" font-weight="800" '
            'font-size="%d" fill="#fff">%s</text></svg>') % (w, ht, w, ht, c1, c2, int(ht * 0.42), fs, text)


def pub(d):
    return {k: v for k, v in d.items() if not k.startswith("_")}


def api(q):
    if q.get("username") != "demo" or q.get("password") != "demo":
        return {"user_info": {"auth": 0}}
    a = q.get("action", "")
    cat = q.get("category_id")
    if a == "":
        return {"user_info": {"username": "demo", "auth": 1, "status": "Active", "exp_date": str(NOW + 47 * 86400),
                              "is_trial": "0", "active_cons": "0", "max_connections": "2", "created_at": str(NOW - 300 * 86400)},
                "server_info": {"url": "127.0.0.1", "port": str(PORT), "timezone": "Europe/Istanbul", "time_now": time.strftime("%Y-%m-%d %H:%M:%S")}}
    if a == "get_vod_categories":
        return [{"category_id": i, "category_name": n, "parent_id": 0} for i, n in MOVIE_CATS]
    if a == "get_series_categories":
        return [{"category_id": i, "category_name": n, "parent_id": 0} for i, n in SERIES_CATS]
    if a == "get_live_categories":
        return [{"category_id": i, "category_name": n, "parent_id": 0} for i, n in LIVE_CATS]
    if a == "get_vod_streams":
        return [pub(m) for m in MOVIES if not cat or m["category_id"] == cat]
    if a == "get_series":
        return [s for s in SERIES if not cat or s["category_id"] == cat]
    if a == "get_live_streams":
        return [l for l in LIVE if not cat or l["category_id"] == cat]
    if a == "get_vod_info":
        m = next((x for x in MOVIES if str(x["stream_id"]) == q.get("vod_id")), None)
        if not m:
            return {"info": [], "movie_data": {}}
        i = m["num"]
        return {"info": {"name": m["name"], "o_name": title(i + 7), "movie_image": m["stream_icon"],
                         "backdrop_path": ["%s/img/mb%d.svg" % (HOST, i)], "plot": PLOTS[i % len(PLOTS)],
                         "cast": people(9, i), "director": people(1, i + 50), "genre": m["_genre"],
                         "releasedate": "%d-05-10" % m["_year"], "duration_secs": m["_dur"] * 60,
                         "rating": m["rating"], "country": "Türkiye" if m["category_id"] == "11" else "ABD",
                         "youtube_trailer": "aqz-KE-bpKQ" if i % 2 else "",
                         "video": {"width": 1920, "height": 1080, "codec_name": "h264"}, "bitrate": 4800},
                "movie_data": {"stream_id": m["stream_id"], "container_extension": "mp4", "name": m["name"]}}
    if a == "get_series_info":
        sr = next((x for x in SERIES if str(x["series_id"]) == q.get("series_id")), None)
        if not sr:
            return {"info": [], "episodes": []}
        i = sr["num"]
        eps = {}
        for sn in range(1, 2 + i % 3):
            eps[str(sn)] = [{"id": str(50000 + i * 100 + sn * 20 + e), "episode_num": e, "season": sn,
                             "title": "%s - S%02dE%02d - %s" % (sr["name"], sn, e, title(e + sn * 3)),
                             "container_extension": "mp4",
                             "info": {"plot": PLOTS[(e + sn) % len(PLOTS)], "duration_secs": (40 + e % 15) * 60,
                                      "movie_image": "%s/img/sb%d.svg" % (HOST, i), "rating": sr["rating"]}}
                            for e in range(1, 9)]
        info = {k: v for k, v in sr.items() if k not in ("num", "series_id", "category_id", "last_modified")}
        info["episode_run_time"] = "45"
        info["youtube_trailer"] = "aqz-KE-bpKQ"
        info["country"] = "Türkiye"
        return {"info": info, "episodes": eps, "seasons": []}
    if a == "get_simple_data_table":
        return archive_table(int(q.get("stream_id", "0")))
    if a == "get_short_epg":
        return short_epg(int(q.get("stream_id", "0")), int(q.get("limit", "4")))
    return []


def make_wav(seconds=180, rate=8000):
    """Oynatici testi icin: sessiz WAV (sureli medya; tarayicidaki <video> oynatabilir)."""
    import struct
    n = seconds * rate
    data = bytes([128]) * n
    hdr = b"RIFF" + struct.pack("<I", 36 + n) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate, 1, 8) + b"data" + struct.pack("<I", n)
    return hdr + data


WAV = make_wav()


class H(http.server.BaseHTTPRequestHandler):
    def _media(self):
        body, total = WAV, len(WAV)
        rng = self.headers.get("Range")
        start, end = 0, total - 1
        if rng and rng.startswith("bytes="):
            a, _, b = rng[6:].partition("-")
            start = int(a or 0)
            end = int(b) if b else total - 1
        chunk = body[start:end + 1]
        self.send_response(206 if rng else 200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(len(chunk)))
        if rng:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, total))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(chunk)

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        if u.path.endswith("/player_api.php"):
            time.sleep(0.15)
            return self._send(200, json.dumps(api(q), ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")
        if u.path.startswith("/timeshift/"):
            # Haber kanallari (3006-3009) yalnizca timeshift.php bicimini destekler (yedek adres testi)
            sid = int(u.path.rsplit("/", 1)[-1].split(".")[0] or 0)
            if 3006 <= sid <= 3009:
                return self._send(404, b"not found", "text/plain")
            return self._media()
        if u.path == "/streaming/timeshift.php" or u.path.startswith("/movie/") or u.path.startswith("/series/"):
            return self._media()
        if u.path.startswith("/img/"):
            key = u.path[5:].rsplit(".", 1)[0]
            return self._send(200, svg(key).encode("utf-8"), "image/svg+xml; charset=utf-8")
        self._send(404, b"not found", "text/plain")

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print("Sahte Xtream: %s  (demo / demo)" % HOST)
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()

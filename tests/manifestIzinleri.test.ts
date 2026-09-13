import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

/**
 * MAĞAZA PAKETİ KULLANILMAYAN İZİN İSTEMESİN.
 *
 * ⚠️ ÖLÇÜLEN DURUM (2026-09-13): versionCode 33 paketi kamera, mikrofon,
 * fotoğraf/video/ses okuma, harici depolama, üstte gösterme ve medya çalma ön
 * plan servisi izinlerini istiyordu — ONU. Uygulama kodunda hiçbiri
 * kullanılmıyordu: `expo-camera`, `expo-media-library`, `expo-file-system`
 * kurulu ama hiçbir yerden içe aktarılmıyor; `expo-audio` yalnızca gol sesini
 * çalıyor. `app.json` yalnızca POST_NOTIFICATIONS diyordu ama `android/`
 * depoya işlendiği için EAS o alanı UYGULAMIYOR.
 *
 * Bedeli: Play fotoğraf/video izni ve ön plan servisi türü için ayrı beyan
 * istiyor; veri güvenliği formu da bu erişimleri açıklamalı. Kullanılmayan
 * izin için doğru bir cevap yok.
 *
 * Test iki katmanlı: (1) kaynak manifest izinleri SÖKÜYOR mu, (2) paketi
 * okuyan denetim betiği gerçekten görüyor mu. İkincisi şart — betiğin ilk
 * sürümü protobuf uzunluk baytını adın parçası sanıp 10 yasak iznin 2'sini
 * KAÇIRDI; o kör nokta aşağıda sentetik paketle nöbetleniyor.
 */

const require = createRequire(import.meta.url);
const { YASAK, zipGirdisi, izinleriCikar, aabDenetle } = require("../scripts/aab-izinleri.cjs");

const KOK = path.join(import.meta.dirname, "..");
const MANIFEST_YOLU = path.join(KOK, "android", "app", "src", "main", "AndroidManifest.xml");

/** XML yorumları boşaltılmış manifest — yorumdaki izin adları sayılmasın. */
const manifest = fs.readFileSync(MANIFEST_YOLU, "utf8").replace(/<!--[\s\S]*?-->/g, " ");

/** Manifestteki uses-permission satırları: ad → söküm mü. */
function izinSatirlari(): Map<string, boolean[]> {
  const out = new Map<string, boolean[]>();
  for (const m of manifest.matchAll(/<uses-permission\b[^>]*>/g)) {
    const ad = /android:name="([^"]+)"/.exec(m[0])?.[1];
    if (!ad) continue;
    const sokum = /tools:node="remove"/.test(m[0]);
    out.set(ad, [...(out.get(ad) || []), sokum]);
  }
  return out;
}

describe("kaynak manifest", () => {
  test("kurulum: manifest okundu ve izin satırları ayrıştırıldı", () => {
    assert.ok(izinSatirlari().size >= 4, "manifestte izin satiri bulunamadi — olcum anlamsiz");
    assert.ok(YASAK.length >= 10, "yasak listesi yuklenemedi");
  });

  test("tools ad alanı tanımlı (yoksa tools:node derlemede hata verir ya da yok sayılır)", () => {
    assert.match(manifest, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
  });

  test("her yasak izin SÖKÜLÜYOR ve düz olarak İSTENMİYOR", () => {
    const satirlar = izinSatirlari();
    const eksik = YASAK.filter((ad: string) => !(satirlar.get(ad) || []).includes(true));
    const duzIstenen = YASAK.filter((ad: string) => (satirlar.get(ad) || []).includes(false));
    assert.deepEqual(eksik, [],
      `sokulmeyen izin(ler): ${eksik.join(", ")} — kutuphane manifesti birlesmede geri ekler`);
    assert.deepEqual(duzIstenen, [],
      `hem sokulen hem istenen izin(ler): ${duzIstenen.join(", ")}`);
  });

  test("uygulamanın GERÇEKTEN kullandığı izinler duruyor", () => {
    /* Ayna hâli: söküm listesi büyürken bildirim ya da ağ izni de giderse
     * uygulama sessizce bildirimsiz/ağsız derlenir. */
    const satirlar = izinSatirlari();
    for (const ad of ["android.permission.INTERNET", "android.permission.POST_NOTIFICATIONS"]) {
      assert.deepEqual(satirlar.get(ad), [false], `${ad} istenmiyor ya da sokuluyor`);
    }
  });

  test("expo-audio ön plan servisleri sökülüyor (izni yokken başlatılırsa çöker)", () => {
    for (const s of ["AudioControlsService", "AudioRecordingService"]) {
      assert.match(manifest,
        new RegExp(`<service android:name="expo\\.modules\\.audio\\.service\\.${s}" tools:node="remove"/>`),
        `${s} sokulmuyor`);
    }
  });
});

/* ── Paket denetimi: sentetik .aab ────────────────────────────────────────── */

/** Protobuf'taki gibi uzunluk önekli dizeler. */
function protobufDizeleri(adlar: string[]): Buffer {
  return Buffer.concat(adlar.map((ad) => Buffer.concat([Buffer.from([0x0a, ad.length]), Buffer.from(ad, "latin1")])));
}

/** Tek girdili ZIP (yöntem 0 = saklı, 8 = deflate). */
function zipKur(ad: string, veri: Buffer, yontem: 0 | 8): Buffer {
  const govde = yontem === 8 ? zlib.deflateRawSync(veri) : veri;
  const adB = Buffer.from(ad, "utf8");
  const yerel = Buffer.alloc(30);
  yerel.writeUInt32LE(0x04034b50, 0); yerel.writeUInt16LE(20, 4); yerel.writeUInt16LE(yontem, 8);
  yerel.writeUInt32LE(govde.length, 18); yerel.writeUInt32LE(veri.length, 22); yerel.writeUInt16LE(adB.length, 26);
  const merkez = Buffer.alloc(46);
  merkez.writeUInt32LE(0x02014b50, 0); merkez.writeUInt16LE(20, 4); merkez.writeUInt16LE(20, 6);
  merkez.writeUInt16LE(yontem, 10); merkez.writeUInt32LE(govde.length, 20); merkez.writeUInt32LE(veri.length, 24);
  merkez.writeUInt16LE(adB.length, 28); merkez.writeUInt32LE(0, 42);
  const merkezBas = yerel.length + adB.length + govde.length;
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(1, 8); son.writeUInt16LE(1, 10);
  son.writeUInt32LE(merkez.length + adB.length, 12); son.writeUInt32LE(merkezBas, 16);
  return Buffer.concat([yerel, adB, govde, merkez, adB, son]);
}

const MANIFEST_GIRDISI = "base/manifest/AndroidManifest.xml";

describe("aab-izinleri betiği", () => {
  test("NEGATİF KONTROL: uzunluk baytı rakama denk gelen yasak izin YAKALANIYOR", () => {
    /* 50 karakterlik ad → önündeki bayt 50 = "2". İlk sürüm bunu
     * "2android.permission.READ_MEDIA_VISUAL_USER_SELECTED" okuyup kaçırıyordu. */
    const ad = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED";
    assert.equal(ad.length, 50, "tohum varsayimi bozuk: onek bayti '2' olmali");
    const izinler = izinleriCikar(protobufDizeleri(["android.permission.INTERNET", ad]));
    assert.deepEqual(izinler, ["android.permission.INTERNET", ad]);
  });

  for (const yontem of [0, 8] as const) {
    test(`yöntem ${yontem}: yasak izinli paket DÜŞÜYOR, temiz paket GEÇİYOR`, () => {
      const kirli = zipKur(MANIFEST_GIRDISI, protobufDizeleri([
        "android.permission.INTERNET", "android.permission.CAMERA",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      ]), yontem);
      const r = aabDenetle(kirli);
      assert.equal(r.olculdu, true);
      assert.deepEqual(r.yasakta, ["android.permission.CAMERA", "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"]);

      const temiz = zipKur(MANIFEST_GIRDISI, protobufDizeleri([
        "android.permission.INTERNET", "android.permission.POST_NOTIFICATIONS",
      ]), yontem);
      const t = aabDenetle(temiz);
      assert.equal(t.olculdu, true);
      assert.deepEqual(t.yasakta, []);
      assert.equal(t.izinler.length, 2, "temiz paketin izinleri okunamadi");
    });
  }

  test("0 izin ya da manifestsiz paket TEMİZ SAYILMIYOR (ölçüm yok)", () => {
    const bos = aabDenetle(zipKur(MANIFEST_GIRDISI, Buffer.from("izin yok"), 8));
    assert.equal(bos.olculdu, false, "hic izin okunamayan paket temiz sayildi");
    const manifestsiz = aabDenetle(zipKur("base/dex/classes.dex", protobufDizeleri(["android.permission.CAMERA"]), 0));
    assert.equal(manifestsiz.olculdu, false, "manifesti olmayan paket temiz sayildi");
  });

  test("ZIP olmayan girdi hata veriyor, sessizce boş dönmüyor", () => {
    assert.throws(() => zipGirdisi(Buffer.from("zip degil".repeat(10)), MANIFEST_GIRDISI), /ZIP degil/);
  });
});

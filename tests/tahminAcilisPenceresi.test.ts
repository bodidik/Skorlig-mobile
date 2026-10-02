/**
 * TAHMİN AÇILIŞ PENCERESİ — ARAYÜZ TARAFI.
 *
 * KULLANICI KARARI (2026-09-20): 96 saatten uzak maç tahmin formu AÇMASIN,
 * *"tahmin giremiyorsan sadece görünsün"*.
 *
 * ⚠️ BU KURAL BİR KEZ SÖKÜLDÜ VE SÖKÜLMESİ DOĞRUYDU: o zaman yalnızca
 * arayüzdeydi, sunucu gönderimi kabul ediyordu ve kullanıcı 5 gün sonraki
 * maça tahmin veremiyordu ("detaylı tahmin açılmıyor"). Şimdi sunucu
 * uyguluyor (`PRED_NOT_OPEN_YET`), yani kapı DOĞRU bilgi veriyor.
 *
 * BU DOSYANIN ASIL NÖBETİ ŞU: pencere SUNUCUDAN geliyor mu. Ekranda sabit bir
 * 96 tutulursa sunucu değeri değiştiğinde ekran yine yalan söyler — bu ürün
 * aynı kusuru KİLİT değerinde yaşadı (liste 5 dk diyordu, sunucu 10
 * uyguluyordu). İkinci nöbet: alan GELMEZSE kapı çizilmemeli, yoksa eski bir
 * sunucuya karşı sökülmüş çıkmaz geri gelir.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
/* Yorumlar elenmeli: bu depoda yorumlar kusurları birebir alıntılıyor, yani
 * elemeyen ölçüt kendi belgesini kusur sanar. */
const kod = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const LIVE = oku("app/(tabs)/live.tsx");
const LIVE_KOD = kod(LIVE);
const PREDICT_KOD = kod(oku("app/(tabs)/predict.tsx"));

const SAAT = 3600 * 1000;

/* ═══ 1. Yüklemin kendisi — ÖLÇÜTÜ YENİDEN YAZMAK YERİNE SÜR ══════════════
 *
 * `tahminAcildiMi` saf bir fonksiyon; kaynaktan çıkarıp çalıştırmak, kendi
 * kopyasını yazmaktan güvenli (bu depoda kopya ölçüt dört kez farklı cevap
 * verdi). Dosya React içe aktarıyor, o yüzden modül olarak yüklenemiyor. */
function yuklemiCikar(): (ko: number | null, saat: number, simdi: number) => boolean {
  const bas = LIVE.indexOf("function tahminAcildiMi");
  assert.ok(bas > 0, "tahminAcildiMi bulunamadi — kapı sökülmüş olabilir");
  const son = LIVE.indexOf("\n}", bas);
  assert.ok(son > bas, "fonksiyon govdesi okunamadi");
  const govde = LIVE.slice(bas, son + 2)
    .replace("function tahminAcildiMi(koMs: number | null, acilisSaat: number, simdiMs: number): boolean",
             "function tahminAcildiMi(koMs, acilisSaat, simdiMs)");
  // eslint-disable-next-line no-new-func
  return new Function(`${govde}; return tahminAcildiMi;`)() as any;
}

describe("tahminAcildiMi yüklemi", () => {
  const f = yuklemiCikar();
  const simdi = Date.UTC(2026, 8, 20, 12, 0, 0);

  test("pencere içi AÇIK, pencere dışı KAPALI", () => {
    assert.equal(f(simdi + 6 * SAAT, 96, simdi), true, "6 saat sonraki maç kapalı çıktı");
    assert.equal(f(simdi + 95 * SAAT, 96, simdi), true, "sınırın içi kapalı çıktı");
    assert.equal(f(simdi + 97 * SAAT, 96, simdi), false, "sınırın dışı açık çıktı");
    assert.equal(f(simdi + 240 * SAAT, 96, simdi), false, "10 gün sonraki maç açık çıktı");
  });

  test("tam sınır (96 sa) AÇIK sayılır — kapı bir saat erken kapanmasın", () => {
    assert.equal(f(simdi + 96 * SAAT, 96, simdi), true);
  });

  test("saati okunamayan maç AÇIK SAYILMAZ", () => {
    /* Kapalı başarısızlık: saat yoksa karar verilemez. Tersi, yer tutucu
     * saatli maçta formu açardı. */
    assert.equal(f(null, 96, simdi), false);
    assert.equal(f(NaN, 96, simdi), false);
  });

  test("geçmiş maç bu yüklemi GEÇER — elemesi başka kapının işi", () => {
    /* Yüklem yalnız 'erken mi' sorusunu yanıtlıyor; kickoff geçmişse
     * `kickoffGecmis` ve durum kapıları eliyor. İkisini tek yükleme
     * yığmak, hangi kapının elediğini ölçülemez yapardı. */
    assert.equal(f(simdi - 3 * SAAT, 96, simdi), true);
  });
});

/* ═══ 2. Pencere SUNUCUDAN geliyor ═══════════════════════════════════════ */

describe("pencere tek kaynakta — sunucu", () => {
  test("liste yanıtındaki openAheadH okunuyor", () => {
    assert.match(LIVE_KOD, /setOpenAheadH\(typeof j\?\.openAheadH === "number"/,
      "openAheadH liste yanıtından okunmuyor");
  });

  test("Item'a geçen pencere DURUMDAN geliyor, sabitten DEĞİL", () => {
    assert.match(LIVE_KOD, /acilisSaat=\{openAheadH \?\? 0\}/,
      "kapı sabit bir sayıdan besleniyor — sunucu değişince ekran yalan söyler");
    /* ⚠️ `?? 0` KRİTİK: alan gelmezse (eski sunucu) kapı çizilmemeli.
     * `?? 96` yazılsaydı kuralı uygulamayan bir sunucuya karşı düğme
     * gizlenir ve sökülmüş çıkmaz geri gelirdi. */
    assert.ok(!/acilisSaat=\{openAheadH \?\? 96\}/.test(LIVE_KOD),
      "alan yokken yerel 96 uygulanıyor — eski sunucuda çıkmaz üretir");
  });

  test("tahmin ekranı da pencereyi sunucudan alıyor", () => {
    assert.match(PREDICT_KOD, /Number\(st\?\.openAheadH\)/,
      "predict.tsx penceresini sunucudan okumuyor");
    assert.match(PREDICT_KOD, /PRED_NOT_OPEN_YET/,
      "tahmin ekranı 'henüz açılmadı' dalını hiç tanımıyor");
  });

  test("kapı KOŞULSUZ açılmıyor: geçersiz pencerede kural uygulanmaz", () => {
    /* `acilisSaat` 0/NaN ise Item kapıyı çizmemeli. */
    assert.match(LIVE_KOD, /acilisGecerli\s*=\s*Number\.isFinite\(acilisSaat\)\s*&&\s*acilisSaat\s*>\s*0/,
      "geçersiz pencere kontrolü yok");
    assert.match(LIVE_KOD, /tahminAcildi\s*=\s*!acilisGecerli \|\| tahminAcildiMi\(/,
      "pencere geçersizken kapı yine kapanıyor");
  });
});

/* ═══ 3. Kapı SESSİZ DEĞİL ═══════════════════════════════════════════════ */

describe("ret sebebi ekranda", () => {
  test("liste satırı kaç saat sonra açılacağını yazıyor", () => {
    assert.match(LIVE_KOD, /acilisaKalanSaat/, "kalan süre hesaplanmıyor");
    /* 2026-10-02: 48 saatin üstü gün olarak (lib/sure saatGun). */
    assert.match(LIVE_KOD, /t\("opensIn", \{ s: saatGun\(acilisaKalanSaat/, "kalan süre ekrana basılmıyor");
  });

  test("tahmin ekranı ayrı bir cümle söylüyor — 'kilitli' DEĞİL", () => {
    /* İkisini aynı metne bağlamak kullanıcıya maçın başladığını sandırırdı. */
    assert.match(PREDICT_KOD, /predNotOpenTitle/, "ayrı başlık yok");
    assert.match(PREDICT_KOD, /acilisMetni\(/, "açılış cümlesi kurulmuyor");
  });

  test("i18n karşılıkları iki dilde de var", () => {
    const i18n = oku("lib/i18n.ts");
    for (const anahtar of ["predNotOpenTitle", "notOpenYetIn", "notOpenYetWindow"]) {
      const kac = i18n.split(new RegExp(`\\b${anahtar}:`)).length - 1;
      assert.equal(kac, 2, `${anahtar} ${kac} dilde tanımlı — tr ve en olmalı`);
    }
  });
});

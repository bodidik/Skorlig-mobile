/**
 * SUNUCU HATA KODU → KULLANICI CÜMLESİ.
 *
 * Modülün var olma sebebi: ekranlar sunucudan gelen kodu olduğu gibi
 * basıyordu ("LIVE2_SCHEDULE_FAILED", "LC_NOT_ENOUGH"). Kullanıcı bunu
 * okuyamaz; okuyamadığı bir hatada yapabileceği bir şey de yoktur, çıkar.
 *
 * ⚠️ TEST SÖZLÜĞÜN İÇERİĞİNİ SINAMIYOR, KURALLARINI SINIYOR. Tek tek
 * cümleleri iddiaya bağlamak iki yönden yanlış olurdu: (a) sözlüğe her yeni
 * kod eklendiğinde test kırılır — nitekim bu dosya yazılırken paralel bir
 * oturum beş yeni kod ekliyordu; (b) kaynaktan kopyalanan bir cümle
 * totolojidir, cümle değişince beklenti de değişir ve hiçbir şey ölçülmez.
 *
 * ⚠️ `__DEV__` REACT NATIVE GLOBALİ — Node'da tanımlı DEĞİL ve modül onu
 * ÇAĞRI ANINDA okuyor. İçe aktarma sırasında patlamıyor, ilk çağrıda
 * ReferenceError veriyor. Test bunu kendisi kuruyor; aşağıdaki ilk sondaj
 * kurulumun gerçekten yapıldığını doğruluyor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// React Native globali — modülün çağrı anında okuduğu değer.
(globalThis as any).__DEV__ = false;

import { hataMesaji } from "../lib/hataMesaji.ts";

const YEDEK = "Bir şeyler ters gitti. Birazdan tekrar dene.";

describe("kurulum", () => {
  test("modül çağrılabiliyor (__DEV__ kurulmuş)", () => {
    /* Bu sondaj olmadan her iddia aynı ReferenceError'a düşer ve hepsi
     * "hata" görünür — asıl kuralların ölçülmediği anlaşılmaz. */
    assert.doesNotThrow(() => hataMesaji("LC_NOT_ENOUGH"));
  });

  test("bilinen bir kod HAM DÖNMÜYOR", () => {
    /* Sözlükten tek bir cümle kopyalamadan, kuralın işlediğini gösteriyoruz:
     * çıktı kodun kendisi olmamalı ve yedek cümle de olmamalı. */
    const c = hataMesaji("LC_NOT_ENOUGH");
    assert.notEqual(c, "LC_NOT_ENOUGH", "ham kod kullaniciya basildi");
    assert.notEqual(c, YEDEK, "bilinen kod icin yedek cumle donduruldu");
    assert.ok(c.length > 10, "cumle fazla kisa, muhtemelen kod dondu");
  });
});

describe("kalıp kuralları — sözlükte olmayan kodlar", () => {
  test("_REQUIRED / _MISSING → eksik bilgi cümlesi", () => {
    /* Aynı kalıba düşen iki farklı kod AYNI cümleyi almalı; kalıbın işi bu. */
    const a = hataMesaji("OLCUM_TAKIM_REQUIRED");
    const b = hataMesaji("OLCUM_ULKE_MISSING");
    assert.equal(a, b, "ayni kalip farkli cumleler uretti");
    assert.notEqual(a, YEDEK, "kalip devreye girmedi, yedege dusuldu");
  });

  test("_NOT_FOUND → kayıt bulunamadı cümlesi", () => {
    const c = hataMesaji("OLCUM_KUPON_NOT_FOUND");
    assert.notEqual(c, YEDEK, "kalip devreye girmedi");
    assert.equal(c, hataMesaji("OLCUM_BASKA_NOT_FOUND"));
  });

  test("_FAILED / _ERR → işlem tamamlanamadı cümlesi", () => {
    /**
     * ⚠️ KOD SEÇİMİ SÖZLÜKTE OLMAMALI — ilk sürümde `LIVE2_SCHEDULE_FAILED`
     * kullandım ve test düştü. Kusur kaynakta değil kurulumdaydı: o kod
     * sözlükte VAR ve kendi özel cümlesini döndürüyor ("Maç listesi
     * alınamadı…"). Kalıp kuralı yalnızca sözlükte BULUNMAYAN kodlar için
     * çalışıyor — doğrusu da bu, özel cümle her zaman genel kalıbı yener.
     * Bu yüzden kalıp testleri sentetik `OLCUM_` önekli kodlarla yapılıyor.
     */
    const a = hataMesaji("OLCUM_BIRSEY_FAILED");
    const b = hataMesaji("OLCUM_BASKASEY_ERR");
    assert.equal(a, b, "ayni kalip farkli cumleler uretti");
    assert.notEqual(a, YEDEK, "kalip devreye girmedi, yedege dusuldu");
  });

  test("sözlükteki ÖZEL cümle, kalıbı yener", () => {
    /* Yukarıdaki tuzağın kendisi bir kural: `_FAILED` ile biten bir kodun
     * sözlükte kendi cümlesi varsa o kullanılmalı. Genel kalıba düşülürse
     * kullanıcı, elindeki duruma özgü bilgiyi kaybeder. */
    const ozel = hataMesaji("LIVE2_SCHEDULE_FAILED");
    const genel = hataMesaji("OLCUM_BIRSEY_FAILED");
    assert.notEqual(ozel, genel,
      "sozlukteki ozel cumle yerine genel kalip donduruldu");
  });

  test("kalıplar birbirinden AYRIŞIYOR", () => {
    /* Negatif kontrol: hepsi tek bir cümleye indirgenirse yukarıdaki
     * "eşit" iddiaları da geçerdi ve kalıpların ayrı olduğu ölçülmezdi. */
    const eksik = hataMesaji("OLCUM_X_REQUIRED");
    const yok   = hataMesaji("OLCUM_X_NOT_FOUND");
    const dustu = hataMesaji("OLCUM_X_FAILED");
    assert.equal(new Set([eksik, yok, dustu]).size, 3,
      `uc kalip ayni cumleye indi: ${JSON.stringify([eksik, yok, dustu])}`);
  });
});

describe("bilinmeyen kod ve boş girdi", () => {
  test("tanınmayan kod YEDEK cümleye düşüyor, ham kod sızmıyor", () => {
    const c = hataMesaji("BAMBASKA_BIR_SEY_XYZ");
    assert.equal(c, YEDEK, "bilinmeyen kod icin yedek cumle donmedi");
    assert.ok(!c.includes("XYZ"),
      "uretimde ham kod kullaniciya sizdi (__DEV__ kapaliyken gorunmemeli)");
  });

  test("boş / null / undefined → yedek cümle", () => {
    for (const g of ["", "   ", null, undefined, 0 as any, {} as any]) {
      const c = hataMesaji(g);
      assert.ok(typeof c === "string" && c.length > 0,
        `${String(g)} icin bos cumle dondu`);
    }
    assert.equal(hataMesaji(""), YEDEK);
    assert.equal(hataMesaji(null), YEDEK);
  });

  test("çağıran KENDİ yedeğini verebiliyor", () => {
    assert.equal(hataMesaji("YOK_BOYLE_BIR_KOD", "Kendi cümlem."), "Kendi cümlem.");
    /* Ama bilinen kod çağıranın yedeğini EZMEMELİ — sözlük daha iyi bilir. */
    assert.notEqual(hataMesaji("LC_NOT_ENOUGH", "Kendi cümlem."), "Kendi cümlem.");
  });
});

describe("geliştirme kipi", () => {
  test("__DEV__ açıkken bilinmeyen kod cümleye EKLENİYOR", () => {
    /* Hata ayıklamak için gerekli; kullanıcıya gitmemesi yukarıda sınandı.
     * Değer çağrı anında okunduğu için burada geçici olarak açılabiliyor. */
    (globalThis as any).__DEV__ = true;
    try {
      const c = hataMesaji("GIZEMLI_KOD_42");
      assert.ok(c.includes("GIZEMLI_KOD_42"),
        "gelistirmede ham kod gorunmuyor — hata ayiklamak zorlasir");
    } finally {
      (globalThis as any).__DEV__ = false;
    }
  });

  test("__DEV__ açıkken BİLİNEN kod için ek YOK", () => {
    (globalThis as any).__DEV__ = true;
    try {
      assert.ok(!hataMesaji("LC_NOT_ENOUGH").includes("LC_NOT_ENOUGH"),
        "bilinen kod icin de ham kod ekleniyor — gurultu");
    } finally {
      (globalThis as any).__DEV__ = false;
    }
  });
});

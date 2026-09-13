import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  EN_AZ_HARF, eslesiyorMu, eslesmeSkoru, suz, oneriler,
} from "../lib/aramaSuzgeci.ts";
import { trNormal, trKarsilastir } from "../lib/metinNormal.ts";

/**
 * ARAMA SÜZGECİ — kullanıcı kararı: 3 harften sonra öneri.
 *
 * ⚠️ TÜRKÇE BURADA TEORİK DEĞİL. Süper Lig takımlarının çoğu Türkçe harf
 * taşıyor (Beşiktaş, Göztepe, Sarıyer, Şanlıurfaspor) ve kullanıcı klavyeden
 * ASCII yazıyor. Katlama tek tarafa uygulanırsa kişi KENDİ takımını
 * bulamıyor — `countrySort.ts` aynı kusuru ülke listesinde ölçmüştü.
 */

const TAKIMLAR = [
  "Galatasaray", "Fenerbahçe", "Beşiktaş", "Trabzonspor", "Göztepe",
  "Sarıyer", "Şanlıurfaspor", "Başakşehir", "Kocaelispor", "Portugal",
];

describe("türkçe katlama", () => {
  test("büyük/küçük İ ve I ikisi de aynı yere iniyor", () => {
    /* ⚠️ toLocaleLowerCase("tr") büyük I'yi ı yapar, İ'yi i; ASCII katlaması
     * sonra ikisini de i'ye indiriyor. Tek taraflı uygulansaydı "İSTANBUL"
     * ile "istanbul" ayrışırdı. */
    assert.equal(trNormal("İSTANBUL"), "istanbul");
    assert.equal(trNormal("ISTANBUL"), "istanbul");
    assert.equal(trNormal("Istanbul"), "istanbul");
  });

  test("aksanlı harfler ASCII karşılığına iniyor", () => {
    assert.equal(trNormal("Beşiktaş"), "besiktas");
    assert.equal(trNormal("Fenerbahçe"), "fenerbahce");
    assert.equal(trNormal("Göztepe"), "goztepe");
    assert.equal(trNormal("Sarıyer"), "sariyer");
  });

  test("boş ve tanımsız çökmüyor", () => {
    assert.equal(trNormal(null), "");
    assert.equal(trNormal(undefined), "");
    assert.equal(trNormal("   "), "");
  });

  test("sıralama ile ARAMA aynı şey değil — ikisi ayrı araç", () => {
    /* ⚠️ BEKLENTİM YANLIŞTI, ÖLÇÜM DÜZELTTİ. "Şanlıurfa" ile "sanliurfa"nın
     * `sensitivity:"base"` altında eşit çıkacağını varsaymıştım; çıkmıyor (1
     * döndü). Türkçe harmanlamada `ş` aksanlı bir `s` DEĞİL, alfabenin ayrı
     * harfi — `localeCompare` onu bilerek ayırıyor ve bu SIRALAMA için doğru.
     * ARAMA için yanlış olurdu: kullanıcı klavyeden "sanli" yazıyor. İki
     * yüzeyin iki ayrı araca ihtiyacı olmasının sebebi tam olarak bu. */
    assert.ok(trKarsilastir("Ankara", "İzmir") < 0, "tr alfabetik sira");
    assert.notEqual(trKarsilastir("Şanlıurfa", "sanliurfa"), 0,
      "siralama ayri harf sayiyor — arama icin trNormal kullanilmali");
    assert.equal(trNormal("Şanlıurfa"), trNormal("sanliurfa"),
      "arama tarafinda ise ayni olmali");
  });
});

describe("eşleşme", () => {
  test("ASCII yazan Türkçe takımı buluyor", () => {
    /* ⚠️ ASIL KUSUR BU. Kullanıcı "besiktas" yazıyor, veri "Beşiktaş". */
    assert.ok(eslesiyorMu("Beşiktaş", "besiktas"));
    assert.ok(eslesiyorMu("Fenerbahçe", "fener"));
    assert.ok(eslesiyorMu("Şanlıurfaspor", "sanli"));
    assert.ok(eslesiyorMu("Göztepe", "gozt"));
  });

  test("tersi de tutuyor — Türkçe yazan ASCII veriyi buluyor", () => {
    assert.ok(eslesiyorMu("Basaksehir", "başak"));
  });

  test("alakasız terim eşleşmiyor", () => {
    assert.equal(eslesiyorMu("Galatasaray", "fener"), false);
  });

  test("skor: alan başı > kelime başı > ortada", () => {
    assert.equal(eslesmeSkoru("Sarıyer", "sar"), 3, "alan basi");
    assert.equal(eslesmeSkoru("Fatih Karagümrük Sarıyer", "sar"), 2, "kelime basi");
    assert.equal(eslesmeSkoru("Basaksehir", "sehir"), 1, "ortada");
    assert.equal(eslesmeSkoru("Galatasaray", "xyz"), 0, "hic");
  });
});

describe("süzgeç", () => {
  const alan = (s: string) => [s];

  test("üç harften kısa sorgu SÜZMÜYOR — 'kisa' ayrı durum", () => {
    /* ⚠️ "kisa" ile "bulunamadi" ayni sey degil. Ikisi de bos liste
     * dondurseydi ekran iki harfte "sonuc yok" derdi ve kullanici
     * aradiginin olmadigini sanip vazgecerdi. */
    for (const q of ["g", "ga"]) {
      const r = suz(TAKIMLAR, q, alan);
      assert.equal(r.durum, "kisa", `"${q}" icin kisa beklenir`);
      assert.deepEqual(r.items, []);
    }
    assert.equal(suz(TAKIMLAR, "gal", alan).durum, "sonuc", "3 harfte suzmeli");
    assert.equal(EN_AZ_HARF, 3, "kullanici karari 3 harf");
  });

  test("boş sorgu listenin TAMAMINI veriyor", () => {
    const r = suz(TAKIMLAR, "  ", alan);
    assert.equal(r.durum, "bos");
    assert.equal(r.items.length, TAKIMLAR.length);
  });

  test("baştan eşleşen önce geliyor", () => {
    /* "gal" yazan Galatasaray'i ariyor, Portugal'i degil. */
    const r = suz(TAKIMLAR, "gal", alan);
    assert.equal(r.items[0], "Galatasaray");
    assert.ok(r.items.includes("Portugal"), "ortada gecen de gorunmeli");
    assert.ok(r.items.indexOf("Galatasaray") < r.items.indexOf("Portugal"));
  });

  test("eşit skorda GİRDİ SIRASI korunuyor", () => {
    /* Mac listesi saate gore, siralama puana gore sirali; arama skor esitken
     * o sirayi bozmamali. */
    /* ⚠️ TOHUMUM YANLIŞTI: once terim "kulüp" (→ kulup) yazilmisti, veri ise
     * "Kulübü" (→ kulubu) — p ile b tutmuyor ve sonuc BOS geldi. Bir an
     * suzgeci suclayacaktim; kusur tohumdaydi. Tohumun ölçülen dizeyle
     * gerçekten örtüştüğünü önce doğrula. */
    const liste = ["Zürih Kulübü", "Ankara Kulübü", "Bursa Kulübü"];
    const r = suz(liste, "kulüb", alan);
    assert.equal(r.sayi, 3, "ucu de eslesmeli");
    assert.deepEqual(r.items, liste, "esit skorda sira degismemeli");
  });

  test("birden çok alan aranıyor, en iyi skor sayılıyor", () => {
    const maclar = [
      { ev: "Galatasaray", dep: "Kocaelispor" },
      { ev: "Beşiktaş", dep: "Göztepe" },
    ];
    const r = suz(maclar, "goz", (m) => [m.ev, m.dep]);
    assert.equal(r.sayi, 1);
    assert.equal(r.items[0].dep, "Göztepe");
  });

  test("sonuç yoksa 'bulunamadi' — 'kisa' ile karışmıyor", () => {
    const r = suz(TAKIMLAR, "zzzq", alan);
    assert.equal(r.durum, "bulunamadi");
    assert.equal(r.sayi, 0);
  });

  test("null/undefined alan çökertmiyor", () => {
    const liste = [{ ad: null }, { ad: undefined }, { ad: "Galatasaray" }];
    const r = suz(liste, "gal", (x) => [x.ad as any]);
    assert.equal(r.sayi, 1);
  });
});

describe("öneriler", () => {
  const maclar = [
    { ev: "Galatasaray", dep: "Kocaelispor" },
    { ev: "Galatasaray", dep: "Trabzonspor" },   // ayni takim, ikinci mac
    { ev: "Göztepe", dep: "Galatasaray" },       // ucuncu kez
  ];

  test("aynı takım bir kez öneriliyor", () => {
    /* ⚠️ Tekrarsizlik GORUNEN METNE gore: ayni takim uc macta geciyor,
     * uc kez listelemek secenek degil gurultu. */
    const o = oneriler(maclar, "gal", (m) => [m.ev, m.dep]);
    assert.deepEqual(o, ["Galatasaray"]);
  });

  test("üç harften kısa sorguda öneri YOK", () => {
    assert.deepEqual(oneriler(maclar, "ga", (m) => [m.ev, m.dep]), []);
  });

  test("üst sınıra uyuyor ve baştan eşleşen önce", () => {
    const liste = ["Ankaragücü", "Gaziantep", "Galatasaray", "Portugal", "Senegal"];
    const o = oneriler(liste, "gal", (s) => [s], 2);
    assert.equal(o.length, 2);
    assert.equal(o[0], "Galatasaray", "bastan eslesen once");
  });
});

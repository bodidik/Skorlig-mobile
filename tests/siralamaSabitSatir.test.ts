/**
 * SIRALAMADA KENDİ SATIRIN SABİT.
 *
 * KULLANICI İSTEĞİ (2026-09-20): *"arayıp bulma olmaz, benim sıralamam
 * gözümün önünde olmalı."*
 *
 * ÖLÇÜLDÜ: ekran `limit=300` istiyor, ilk 100 satırı çiziyor; havuzda 1700+
 * satır var. 300'ün ötesindeki oyuncunun satırı yanıtta bile yoktu, yani
 * sıra ekranda HESAPLANAMIYORDU. Sıra artık sunucunun `ben` bloğundan
 * geliyor (api/routes/leaderboard.cjs benBlogu).
 *
 * BU DOSYANIN NÖBETLERİ:
 *  1) şerit LİSTENİN İÇİNDE değil, ScrollView'ın KARDEŞİ ve mutlak konumlu —
 *     listeye eklenen bir satır aşağı kaydırınca kaybolur, istek bunun tersi;
 *  2) sıra `ben` bloğundan okunuyor, listede ARANMIYOR;
 *  3) şerit son satırı örtmüyor (alt dolgu var);
 *  4) sıra yokken sebebi yazılı (sessiz boşluk değil);
 *  5) şerit DÜĞME taklidi yapmıyor — deponun kayıtlı "hiçbir şeyi
 *     değiştirmeyen kontrol" kusuru.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
/* Yorumlar eleniyor: bu depoda yorumlar kusurları birebir alıntılıyor. */
const kodla = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const HAM = oku("app/(tabs)/stats.tsx");
const KOD = kodla(HAM);

/**
 * ⚠️ ÇAPA BENZERSİZ DEĞİLDİ — ölçüt bir kez yanılttı. Koşul metni
 * (`mode === "global" && view === "genel" && benSira`) İKİ yerde geçiyor:
 * önce ScrollView'ın alt dolgusunda, sonra şeridin kendisinde. Düz `indexOf`
 * birinciyi bulup şerit penceresini YANLIŞ yerden açıyor ve iki iddia sahte
 * düşüyordu (depoda kayıtlı "pencere darlığı" / "çapa benzersiz olmalı"
 * tuzaklarının ikisi birden).
 *
 * Doğru çapa: ScrollView KAPANIŞINDAN SONRAKİ ilk geçiş.
 */
function seritBlogu(): string {
  const kapanis = KOD.indexOf("</ScrollView>");
  assert.ok(kapanis > 0, "ScrollView kapanışı bulunamadı");
  const bas = KOD.indexOf('mode === "global" && view === "genel" && benSira', kapanis);
  assert.ok(bas > 0, "sabit şerit ScrollView'dan SONRA bulunamadı");
  const son = KOD.indexOf("<Modal", bas);
  assert.ok(son > bas, "şerit bloğunun sonu okunamadı");
  const blok = KOD.slice(bas, son);
  /* Boş bir dilim her iddiayı geçirirdi. */
  assert.ok(blok.length > 400, `şerit bloğu şüpheli kısa: ${blok.length}`);
  return blok;
}

describe("sıra kaynağı", () => {
  test("`ben` bloğu okunuyor", () => {
    assert.match(KOD, /setBenSira\(j\?\.ben \?\? null\)/,
      "sunucunun ben bloğu okunmuyor — sıra 300'ün ötesinde bulunamaz");
  });

  test("sıra LİSTEDE ARANMIYOR", () => {
    /* `meRow` (listede arama) puan özeti için duruyor ama ŞERİT ondan
     * beslenmemeli: 300'ün ötesinde `undefined` olur. */
    const serit = seritBlogu();
    assert.ok(!/meRow/.test(serit), "şerit listeden aranan satırı kullanıyor");
    assert.match(serit, /benSira\.rank/, "şerit sırayı ben bloğundan okumuyor");
  });

  test("hata ve boş yollarda şerit TEMİZLENİYOR — bayat sıra kalmasın", () => {
    const kac = KOD.split("setBenSira(null)").length - 1;
    assert.ok(kac >= 2, `boş/hata yolunda temizleme eksik (${kac} yer)`);
  });
});

describe("şerit gerçekten sabit", () => {
  test("ScrollView'ın KARDEŞİ ve mutlak konumlu", () => {
    const kapanis = KOD.indexOf("</ScrollView>");
    assert.ok(kapanis > 0, "ScrollView kapanışı bulunamadı");
    const sonra = KOD.slice(kapanis, kapanis + 1600);
    assert.match(sonra, /benSira/, "şerit ScrollView'ın İÇİNDE — kaydırınca kaybolur");
    assert.match(sonra, /position: "absolute"/, "şerit akışta yer kaplıyor, sabit değil");
    assert.match(sonra, /bottom: 0/, "şerit ekranın altına sabitlenmemiş");
  });

  test("son satırı örtmüyor: alt dolgu şeride BAĞLI", () => {
    assert.match(KOD, /contentContainerStyle=\{[\s\S]{0,200}benSira \? \{ paddingBottom/,
      "alt dolgu yok ya da şeridin görünürlüğüne bağlı değil");
  });

  test("yalnız GENEL sıralama görünümünde", () => {
    /* "Ben" ve "Takımıma göre" sekmeleri kişiye özel; şerit orada kendini
     * tekrar ederdi. */
    assert.match(KOD, /mode === "global" && view === "genel" && benSira/,
      "şerit her görünümde çiziliyor");
  });
});

describe("kapı sessiz değil", () => {
  test("sıra yokken sebebi yazılı", () => {
    assert.match(KOD, /myRankBarNone/, "sıra yokken boş şerit çiziliyor");
  });

  test("şerit DÜĞME taklidi yapmıyor", () => {
    const serit = seritBlogu();
    assert.ok(!/TouchableOpacity|onPress/.test(serit),
      "şerit tıklanabilir görünüyor ama bir şey yapmıyor — kayıtlı kusur sınıfı");
  });

  test("erişilebilir ad veriliyor", () => {
    assert.match(KOD, /myRankBarA11y/, "ekran okuyucu şeridi okuyamaz");
  });

  test("i18n karşılıkları iki dilde", () => {
    const i18n = oku("lib/i18n.ts");
    for (const anahtar of ["myRankBarTtl", "myRankBarNone", "myRankBarA11y"]) {
      const kac = i18n.split(new RegExp(`\\b${anahtar}:`)).length - 1;
      assert.equal(kac, 2, `${anahtar} ${kac} dilde tanımlı — tr ve en olmalı`);
    }
  });
});

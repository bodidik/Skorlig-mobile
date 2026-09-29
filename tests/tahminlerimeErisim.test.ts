/**
 * TAHMİNLERİME HER AN ERİŞİM + SATIRDAN YARIŞA GİDİŞ.
 *
 * KULLANICI İSTEĞİ (2026-09-29, test kullanıcılarının geri bildirimi):
 *   • *"Oynanmış tahminlere daha çabuk ulaşabilmeli kişi; menüler içinde
 *     aramak yerine her an kuponlarına dönebilmeli."*
 *   • *"Bu tahminlerim ekranından tahmine ve yarışa kolay gidebilmeli…
 *     özellikle yarışa gidiş kolay olmalı."*
 *
 * ÖLÇÜLDÜ (önce):
 *   • Benimkiler'e iki yol vardı, ikisi de en az iki dokunuş: Maçlar sekmesi →
 *     mod şeridi, ya da Profil → "📋 Benimkiler". Başka bir sekmedeyken önce
 *     oradan çıkmak gerekiyordu.
 *   • Yarışa giden tek yol Maçlar listesindeki maç kartıydı; Benimkiler
 *     satırında yarış düğmesi HİÇ YOKTU.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
/* Yorumlar eleniyor: bu depoda yorumlar kusurları birebir alıntılıyor. */
const kodla = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CUBUK = kodla(oku("components/TabBar.tsx"));
const LIVE = kodla(oku("app/(tabs)/live.tsx"));

describe("alt çubukta Tahminlerim kısayolu", () => {
  test("çubuk 'mine' kipine gidiyor", () => {
    assert.match(CUBUK, /pathname: "\/\(tabs\)\/live"/, "kısayol live sekmesine gitmiyor");
    assert.match(CUBUK, /tab: "mine"/, "kısayol Benimkiler kipini açmıyor");
  });

  test("ts damgası var — sekme AÇIKKEN de kip değişsin", () => {
    /* Damga olmadan aynı adrese gitmek hiçbir şey yapmıyordu; aynı tuzak
     * profildeki Benimkiler satırında da yazılı. */
    assert.match(CUBUK, /ts: String\(Date\.now\(\)\)/, "ts damgası yok — aynı adrese gidiş etkisiz kalır");
  });

  test("düğme AYRI BİR ROTA DEĞİL — liste iki yerde tutulmuyor", () => {
    assert.ok(
      !fs.existsSync(path.join(KOK, "app/(tabs)/tahminlerim.tsx")),
      "ayrı sekme dosyası açılmış — aynı liste iki yerde (iki gerçeklik)"
    );
    /* İkon tablosunda karşılığı olmalı, yoksa `live` ikonuna düşer. */
    assert.match(CUBUK, /tahminlerim:\s*\{\s*aktif:/, "kısayolun kendi ikonu yok");
  });

  test("kısayol 'buradasın' gibi görünmüyor", () => {
    /* Rotası olmadığı için altın hap yanlış bilgi olurdu. */
    assert.match(CUBUK, /<Sekme odakta=\{false\}/, "kısayol odakta çizilebiliyor");
  });

  test("erişilebilir adı çeviriden geliyor", () => {
    assert.match(CUBUK, /etiket=\{t\("myBets"\)\}/, "etiket sabit yazılmış — dil değişince kaymaz");
  });
});

describe("Benimkiler satırından yarış ve tahmin", () => {
  const satir = (() => {
    const bas = LIVE.indexOf("const benimTahminSatiri");
    assert.ok(bas > 0, "satır fonksiyonu bulunamadı");
    const son = LIVE.indexOf("\n  };", bas);
    const blok = LIVE.slice(bas, son);
    assert.ok(blok.length > 1500, `satır bloğu şüpheli kısa: ${blok.length}`);
    return blok;
  })();

  test("yarış düğmesi var ve KOŞULSUZ (oynanan satırda da)", () => {
    assert.match(satir, /goRace\(\{/, "satırdan yarışa gidiş yok");
    /* Düğme `duzenlenebilir` bloğunun DIŞINDA olmalı: oynanmış maçta da
     * yarışa gidilebiliyor — istenen tam buydu. */
    const kosulBas = satir.indexOf("{duzenlenebilir && (");
    const kosulSon = satir.indexOf("</>", kosulBas);
    const yarisIx = satir.indexOf("goRace({");
    assert.ok(kosulBas > 0 && yarisIx > kosulSon,
      "yarış düğmesi 'duzenlenebilir' koşulunun İÇİNDE — oynanan satırda görünmez");
  });

  test("üç düğmenin üçü de erişilebilir adlı", () => {
    /* Eskiden ✏️ ve 🗑 yalnızca glif basıyordu: ekran okuyucu adsız düğme
     * duyuruyordu (kayıtlı "adı yalnızca glif" sınıfı). */
    for (const ad of ['accessibilityLabel={t("predictBtn")}', 'accessibilityLabel={t("cancelPredA11y")}', 'accessibilityLabel={t("raceBtn")}']) {
      assert.ok(satir.includes(ad), `eksik erişilebilir ad: ${ad}`);
    }
  });

  test("i18n karşılığı iki dilde", () => {
    const i18n = oku("lib/i18n.ts");
    for (const k of ["cancelPredA11y", "raceBtn", "myBets"]) {
      const kac = i18n.split(new RegExp(`\\b${k}:`)).length - 1;
      assert.ok(kac >= 2, `${k} yalnız ${kac} dilde`);
    }
  });
});

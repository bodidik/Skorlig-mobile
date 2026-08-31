/**
 * OYUN MODLARI — KONTRAST VE DÜZEN KARARLILIĞI nöbetçisi.
 *
 * ⚠️ KULLANICI BİLDİRİMİ (2026-08-31): "Ne oynamak istersin görseli çekici
 * değil. Sanki yarım kalmış havası var. Renkler ve yazılar sönük ve
 * oturmamış."
 *
 * ÖLÇÜLDÜ — şikâyetin iki yarısı da somut çıktı:
 *
 *  1. SÖNÜK YAZI. Kart zemini `Colors.card` DEĞİL: üstüne mod renginden
 *     %19'luk bir gradyan biniyor. `Colors.muted` (#64748b) o bileşke
 *     zeminlerde 2.53–2.86 kontrast veriyordu; WCAG AA eşiği 4.5. Kartın ne
 *     olduğunu anlatan tek satır okunmuyordu.
 *
 *  2. OTURMAMIŞ ŞERİT. Bedel satırı koşulluydu ve `macBedeli`/`kuponBedeli`
 *     live.tsx'te `null` başlıyor. Yani İLK BOYAMADA — kullanıcının
 *     "yarım kalmış" dediği an — altı karttan ikisi ötekilerden bir satır
 *     kısaydı.
 *
 * ⚠️ RENGİ ZEMİNE KOYARAK CANLANDIRMA — ölçüldü, TERS TEPİYOR. Gradyan üst
 * alfası %19'dan %27'ye çıkarılınca açıklama 3.77'ye, bedel 4.12'ye düşüyor:
 * ikisi de eşiğin altına iniyor. Bu dosya o yönü de kilitliyor.
 *
 * ⚠️ RENKLER KAYNAKTAN OKUNUYOR, KOPYALANMIYOR. `OyunModlari.tsx` bir RN
 * bileşeni ve Node altında yüklenemiyor; sabitleri buraya elle yazsaydım
 * bileşen değişince test sessizce eski değerleri ölçmeye devam ederdi.
 * Kontrast fonksiyonu ise GERÇEK `constants/colors.ts`'ten geliyor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { contrast, Colors } from "../constants/colors.ts";

const KOK = path.join(import.meta.dirname, "..");
const KAYNAK = fs.readFileSync(path.join(KOK, "components/OyunModlari.tsx"), "utf8");
const EKRAN = fs.readFileSync(path.join(KOK, "app/(tabs)/live.tsx"), "utf8");

/** WCAG AA — 18px altı normal metin. */
const ESIK = 4.5;

/** Üst rengi alfayla alta bindirir (gradyanın ürettiği bileşke zemin). */
function bindir(ust: string, alfa: number, alt: string): string {
  const u = ust.replace("#", "");
  const a = alt.replace("#", "");
  let o = "#";
  for (let i = 0; i < 3; i++) {
    const cu = parseInt(u.substr(i * 2, 2), 16);
    const ca = parseInt(a.substr(i * 2, 2), 16);
    o += Math.round(cu * alfa + ca * (1 - alfa)).toString(16).padStart(2, "0");
  }
  return o;
}

/** Kaynaktaki mod kartı renkleri. */
function modRenkleri(): string[] {
  const m = KAYNAK.match(/renk:\s*"(#[0-9a-fA-F]{6})"/g) || [];
  return m.map((x) => (x.match(/#[0-9a-fA-F]{6}/) as RegExpMatchArray)[0]);
}

/** Açıklama/alt yazı için seçilen ölçülmüş ton. */
function aciklamaRengi(): string {
  const m = KAYNAK.match(/const\s+ACIKLAMA_RENGI\s*=\s*"(#[0-9a-fA-F]{6})"/);
  assert.ok(m, "ACIKLAMA_RENGI sabiti kaynakta bulunamadi — test korlesti");
  return (m as RegExpMatchArray)[1];
}

/** GradyanZemin'in üst alfası (mod renginin ardındaki iki haneli alfa). */
function gradyanUstAlfa(): number {
  const m = KAYNAK.match(/GradyanZemin renkler=\{\[[^\]]*?renk\}([0-9a-fA-F]{2})/);
  assert.ok(m, "gradyan ust alfasi kaynakta bulunamadi — test korlesti");
  return parseInt((m as RegExpMatchArray)[1], 16) / 255;
}

/** Kart zeminleri: kart rengine mod renginin gradyanı binmiş hâli. */
function kartZeminleri(): Array<{ renk: string; zemin: string }> {
  const alfa = gradyanUstAlfa();
  return modRenkleri().map((renk) => ({ renk, zemin: bindir(renk, alfa, Colors.card) }));
}

describe("olcum korumasi — kaynak gercekten okundu", () => {
  test("alti mod rengi bulundu", () => {
    const r = modRenkleri();
    assert.equal(r.length, 6, "mod rengi sayisi " + r.length + " — kaynak sekli degismis olabilir");
  });

  test("kart zemini duz Colors.card DEGIL", () => {
    /* Bu testin varlik sebebi: kontrasti Colors.card ustunde olcmek
     * yaniltiyordu. Gradyan zemini gercekten kaydiriyor mu, onu dogrula —
     * kaydirmiyorsa butun olcum anlamsiz. */
    for (const { zemin } of kartZeminleri()) {
      assert.notEqual(zemin.toLowerCase(), Colors.card.toLowerCase());
    }
  });
});

describe("SONUK YAZI — kart metinleri esigi geciyor", () => {
  test("aciklama satiri alti kart zemininin altisinda da esigi geciyor", () => {
    const c = aciklamaRengi();
    for (const { renk, zemin } of kartZeminleri()) {
      const k = contrast(c, zemin);
      assert.ok(
        k >= ESIK,
        "mod " + renk + " zemin " + zemin + " aciklama kontrasti " + k.toFixed(2) +
          " — esik " + ESIK
      );
    }
  });

  test("aciklama tonu Colors.muted DEGIL — olculen kusur oydu", () => {
    assert.notEqual(
      aciklamaRengi().toLowerCase(),
      Colors.muted.toLowerCase(),
      "aciklama rengi Colors.muted'a geri donmus — o ton kart zemininde 2.53-2.86 veriyor"
    );
  });

  test("bolum alt yazisi sayfa zemininde esigi geciyor", () => {
    /* Colors.muted sayfa zemininde 4.11 veriyordu — kart zeminlerinden iyi
     * ama yine esigin altinda. */
    const k = contrast(aciklamaRengi(), Colors.background);
    assert.ok(k >= ESIK, "alt yazi kontrasti " + k.toFixed(2));
  });

  test("mod adi ve bedel de esigi geciyor", () => {
    for (const { renk, zemin } of kartZeminleri()) {
      assert.ok(contrast(Colors.text, zemin) >= ESIK, "mod adi " + renk);
      assert.ok(
        contrast(renk, zemin) >= ESIK,
        "bedel yazisi " + renk + " zemin " + zemin + " " + contrast(renk, zemin).toFixed(2)
      );
    }
  });
});

describe("NEGATIF KONTROL — gradyani koyulastirmak yaziyi bastirir", () => {
  test("ust alfa yuzde 27 olsaydi aciklama ESIGIN ALTINA duserdi", () => {
    /* "Renkler sonuk" sikayetinin akla ilk gelen cozumu (gradyani guclendir)
     * olcumle curutuldu. Bu test o yonu kalici olarak kapatiyor: biri alfayi
     * buyutmek isterse once bu testi gorecek. */
    const c = aciklamaRengi();
    const dusen = kartZeminleri().filter(
      ({ renk }) => contrast(c, bindir(renk, 0x45 / 255, Colors.card)) < ESIK
    );
    assert.ok(
      dusen.length > 0,
      "alfa yuzde 27'de hicbir kart esigin altina dusmuyor — bu testin dayanagi " +
        "kalmamis, renk kimligi zemine tasinabilir"
    );
  });

  test("bugunku alfa esigi bozmuyor", () => {
    assert.ok(gradyanUstAlfa() < 0x45 / 255, "gradyan ust alfasi buyumus — kontrasti yeniden olc");
  });
});

describe("OTURMAMIS SERIT — kart yuksekligi VERIYE bagli olmamali", () => {
  test("bedel satiri sabit yukseklikli bir kapta", () => {
    assert.match(
      KAYNAK,
      /height:\s*20,\s*justifyContent:\s*"flex-end"/,
      "bedel satirinin sabit yukseklikli kabi yok — bedel gelmeden kartlar tirtikli kalir"
    );
  });

  test("bedel kosullu render'i sabit kabin ICINDE", () => {
    const kapIdx = KAYNAK.indexOf("height: 20, justifyContent:");
    const bedelIdx = KAYNAK.indexOf("{m.bedel ? (");
    assert.ok(kapIdx > 0, "sabit kap bulunamadi");
    assert.ok(bedelIdx > kapIdx, "kosullu bedel sabit kabin disinda kalmis");
  });

  test("aciklama alani da sabit — iki satirlik yer ayrilmis", () => {
    assert.match(KAYNAK, /minHeight:\s*28/, "aciklama minHeight'i kalkmis");
  });
});

describe("RENK KIMLIGI METIN TASIMAYAN KANALDA", () => {
  test("sol kenar renk seridi var", () => {
    assert.match(
      KAYNAK,
      /position:\s*"absolute",\s*left:\s*0,\s*top:\s*0,\s*bottom:\s*0,\s*width:\s*3/,
      "sol kenar seridi yok — renk kimligi yalnizca soluk gradyanda kalir"
    );
  });

  test("serit ve kenarlik metin-disi esigi (3.0) geciyor", () => {
    /* WCAG 1.4.11: metin olmayan gostergeler icin esik 3.0. */
    for (const { renk, zemin } of kartZeminleri()) {
      assert.ok(
        contrast(renk, zemin) >= 3,
        "mod " + renk + " serit/kenarlik kontrasti " + contrast(renk, zemin).toFixed(2)
      );
    }
  });
});

describe("SIRA — serit ekranin ilk icerik blogu", () => {
  test("OyunModlari, SkorMerkezi ve KuponKarti'nin ONUNDE", () => {
    const mod = EKRAN.indexOf("<OyunModlari");
    const skor = EKRAN.indexOf("<SkorMerkezi");
    const kupon = EKRAN.indexOf("<KuponKarti");
    assert.ok(mod > 0 && skor > 0 && kupon > 0, "bilesenlerden biri ekranda yok");
    assert.ok(mod < skor, "OyunModlari SkorMerkezi'nin altinda kalmis");
    assert.ok(mod < kupon, "OyunModlari KuponKarti'nin altinda kalmis");
  });

  test("NEGATIF: skor merkezi ve kupon KALDIRILMADI, yalnizca bir sira indi", () => {
    assert.ok(EKRAN.indexOf("<SkorMerkezi") > 0, "SkorMerkezi silinmis");
    assert.ok(EKRAN.indexOf("<KuponKarti") > 0, "KuponKarti silinmis");
    assert.ok(EKRAN.indexOf("<DailyMatchCard") > 0, "DailyMatchCard silinmis");
  });

  test("marka bandi hala en ustte — kimlik blogu tasinmadi", () => {
    assert.ok(
      EKRAN.indexOf("MARKA BANDI") < EKRAN.indexOf("<OyunModlari"),
      "marka bandi mod seridinin altina dusmus"
    );
  });
});

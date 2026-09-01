import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * TAHMİN EKRANI PUAN ÖNİZLEMESİ — çarpan ve rehber nöbetçisi.
 *
 * ⚠️ İKİ AYRI KUSUR ÖLÇÜLDÜ (2026-09-01), ikisi de "ekran motoru yanlış
 * anlatıyor" sınıfından.
 *
 * 1) İLK GOL / İLK YARI ÇARPANI
 *    settle2 bu iki kalemi OLASILIK çarpanıyla ödüllendiriyor
 *    (api/routes/settle2.cjs:1159-1162 → ilkGolOdulCarpani / ilkYariOdulCarpani),
 *    yani puan SEÇİME göre değişiyor. Ekran ise seçimden BAĞIMSIZ olan
 *    `matchDifficulty` ile çarpıyordu:
 *
 *      Galatasaray - Corum FK, ilk golü DEPLASMAN atar
 *        ekran  0.4 × matchDifficulty(0.600) = 0.240
 *        settle 0.4 × ilkGolOdulCarpani      = 0.833      → %247 sapma
 *
 *    Kullanıcının şikâyeti tam buydu: "ilk golü BJK atar az puan, Çorumspor
 *    daha çok puan" — motor bunu yapıyordu, EKRAN göstermiyordu.
 *
 * 2) PUAN REHBERİ SABİT YAZILMIŞTI
 *    2026-08-10 ölçek düşüşünden sonra eski değerlerde kaldı:
 *      ilk gol  +1   → gerçek 0.4     kırmızı +1.5 → gerçek 0.6
 *      ilk yarı +2   → gerçek 0.8     penaltı +1.5 → gerçek 0.6
 *    Ekran motorun ~2.5 katını vaat ediyordu; cezalar da olduğundan küçük
 *    görünüyordu (-0.2 yazıyordu, gerçek 0.45).
 *
 * ⚠️ NEGATİF KONTROL ŞART: `matchDifficulty` kaldırılmamalı. Kırmızı, penaltı,
 * KG ve toplam gol kalemleri GERÇEKTEN onu kullanıyor (settle2:1305,1326,
 * 1333,1358,1384) ve fazla düzeltme onları bozar.
 *
 * Kaynak okuyan test kalıbı bu depoda zaten var (oyunModlariKontrast.test.ts).
 *
 * Çalıştırma:  npm test
 */

const KOK = path.join(import.meta.dirname, "..");
const KAYNAK = fs.readFileSync(path.join(KOK, "app/(tabs)/predict.tsx"), "utf8");

/** Yorumları boşluğa çevirir — bu dosyadaki gibi açıklama metinleri ölçütü
 *  yanıltmasın (bu depoda yorumlar kusurları birebir alıntılıyor). */
function yorumsuz(k: string): string {
  return k
    .replace(/\/\*[^]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, o) => o + m.slice(o.length).replace(/./g, " "));
}
const KOD = yorumsuz(KAYNAK);

describe("ilk gol / ilk yarı önizlemesi seçime göre değişir", () => {
  test("ilk gol çarpanı firstGoalMult'tan geliyor", () => {
    assert.match(
      KOD,
      /BASE\.firstGoal\s*\*\s*\(weights\.firstGoalMult\?\.\[firstGoal\]/,
      "ilk gol hâlâ seçimden bağımsız çarpanla hesaplanıyor — reyting farkı ekrana yansımaz"
    );
  });

  test("ilk yarı çarpanı firstHalfMult'tan geliyor", () => {
    assert.match(
      KOD,
      /BASE\.firstHalf\s*\*\s*\(weights\.firstHalfMult\?\.\[firstHalf\]/,
      "ilk yarı hâlâ seçimden bağımsız çarpanla hesaplanıyor"
    );
  });

  test("uç eski sürümdeyse eski davranışa düşülüyor", () => {
    /* `?? diff` olmadan eski sunucuya bağlı bir derleme NaN puan gösterir. */
    const kez = (KOD.match(/\?\?\s*diff\)/g) || []).length;
    assert.equal(kez, 2, "firstGoalMult/firstHalfMult için `?? diff` yedeği eksik");
  });
});

describe("puan rehberi sunucudan türüyor", () => {
  test("eski sabit ölçek kalmadı", () => {
    for (const eski of ['pts: "+1"', 'pts: "+2"', 'pts: "+1.5"']) {
      assert.ok(
        !KOD.includes(eski),
        "puan rehberinde eski sabit değer duruyor: " + eski + " — ekran motorun 2.5 katını vaat eder"
      );
    }
  });

  test("rehber BASE ve penaltyPoints okuyor", () => {
    assert.match(KOD, /BASE && weights\?\.penaltyPoints/,
      "rehber sunucu değerlerine bağlı değil");
    assert.match(KOD, /weights\.penaltyPoints\?\.\[key\]/,
      "ceza değerleri uçtan alınmıyor");
  });
});

describe("NEGATİF KONTROL — matchDifficulty kaldırılmadı", () => {
  test("kırmızı, penaltı, KG ve toplam gol hâlâ maç zorluğuyla çarpılıyor", () => {
    for (const kalem of ["redAny", "penaltyAny", "btts", "over25"]) {
      const re = new RegExp("BASE\\." + kalem + "\\s*\\*\\s*diff");
      assert.match(KOD, re,
        kalem + " artık matchDifficulty kullanmıyor — settle2 ile ayrıştı (fazla düzeltme)");
    }
  });

  test("diff değişkeni hâlâ matchDifficulty'den okunuyor", () => {
    assert.match(KOD, /const diff = weights\.matchDifficulty/,
      "matchDifficulty kaynağı değişmiş");
  });
});

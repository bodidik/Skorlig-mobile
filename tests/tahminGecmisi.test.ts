import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { bestStreak, currentStreak, sonTahminler, winRate } from "../lib/tahminGecmisi.ts";

/**
 * PROFİL "SON TAHMİNLER" EN YENİ MAÇLARI GÖSTERİR.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-16, üretim): `/api/rt/pred/history` öğeleri
 * `computedAt` ARTAN döndürüyor ve ekran `history.slice(0, 15)` basıyordu —
 * yani EN ESKİ 15 maç. 1764 kullanıcının 1731'inde 15'ten fazla kayıt var.
 *
 * ⚠️ İKİ TARAF AYNI SIRAYA BAĞLI: sunucu limit aşılınca en yeni N'i seçip
 * artan döndürüyor (api/tests/tahmin-gecmisi-yalniz-kendi-satiri.mongo
 * .test.cjs sınıyor). Burada o sıradan "en yeni üstte" liste ve "güncel seri"
 * (sondan sayım) türetiliyor. Sıra bir tarafta ters dönerse diğer taraftaki
 * iddia düşmez — bu yüzden sözleşme iki dosyada da açıkça yazılı.
 */

const oge = (id: string, outcome: number) => ({ fixtureId: id, detail: { outcome } });
/** Artan (en eski önce) dizi: M01 … M20. */
const artan = Array.from({ length: 20 }, (_, i) => oge(`M${String(i + 1).padStart(2, "0")}`, 1));

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");

describe("sonTahminler", () => {
  test("artan diziden EN YENİ 15, en yeni üstte", () => {
    const r = sonTahminler(artan, 15).map(x => x.fixtureId);
    assert.equal(r.length, 15);
    assert.equal(r[0], "M20", "ilk satir en yeni mac degil");
    assert.equal(r[14], "M06", "liste en yeni 15'i kapsamiyor");
    assert.ok(!r.includes("M01"), "en eski mac 'Son Tahminler'de — slice(0, 15) kusuru");
  });

  test("15'ten az kayıt → hepsi, en yeni üstte", () => {
    assert.deepEqual(sonTahminler(artan.slice(0, 3), 15).map(x => x.fixtureId), ["M03", "M02", "M01"]);
  });

  test("girdiyi bozmaz (history state'i ters dönmesin)", () => {
    const kopya = artan.map(x => x.fixtureId);
    sonTahminler(artan, 15);
    assert.deepEqual(artan.map(x => x.fixtureId), kopya, "sonTahminler girdiyi yerinde degistirdi");
  });

  test("adet 0 → boş (slice(-0) bütün diziyi verirdi)", () => {
    assert.deepEqual(sonTahminler(artan, 0), []);
  });
});

describe("seriler artan sıraya göre", () => {
  test("güncel seri EN YENİ maçtan geriye sayılıyor", () => {
    assert.equal(currentStreak([oge("a", -1), oge("b", 1), oge("c", 1)]), 2);
    assert.equal(currentStreak([oge("a", 1), oge("b", 1), oge("c", -1)]), 0,
      "son (en yeni) mac yanlisken seri sifir degil — sira ters okunuyor");
  });

  test("en iyi seri ve isabet oranı", () => {
    const xs = [oge("a", 1), oge("b", 1), oge("c", 1), oge("d", -1), oge("e", 1), oge("f", 0)];
    assert.equal(bestStreak(xs), 3);
    assert.equal(winRate(xs), 67);
    assert.equal(winRate([]), null);
  });
});

describe("ekran tek kaynağı kullanıyor", () => {
  test("profil ekranı `sonTahminler` basıyor, yerel kopya yok", () => {
    const src = oku("app/profile/[userId].tsx");
    assert.match(src, /sonTahminler\(history,\s*15\)\.map/, "Son Tahminler listesi sonTahminler'den gelmiyor");
    assert.doesNotMatch(src, /history\.slice\(0,\s*15\)/, "en eski 15'i basan eski dilim geri geldi");
    assert.doesNotMatch(src, /function (currentStreak|bestStreak|winRate)\b/,
      "ekranda yerel seri kopyasi var — sinanan fonksiyon kullanilmiyor");
  });
});

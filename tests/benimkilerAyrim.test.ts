/**
 * BENİMKİLER — OYNANACAK / OYNANAN AYRIMI.
 *
 * KULLANICI İSTEĞİ (2026-09-20): "listeler karışık: tahminlerim / oynadığım /
 * oynanacak ayrımı net değil."
 *
 * ÖLÇÜLDÜ: `/api/pred/my` `current` alanı kickoff'tan 26 saat SONRASINA kadar
 * her şeyi tek listede veriyor (yarınki maç ile dünkü bitmiş maç yan yana) ve
 * satırdaki ✏️/🗑 düğmeleri KOŞULSUZ çiziliyordu — bitmiş maçın 🗑'si
 * sunucudan 409 alıyordu. 26 saatlik pencere değiştirilmedi (dünkü maçın
 * puanı görünür kalsın diye var); ayrım istemcide yapılıyor.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
const kodla = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const KOD = kodla(oku("app/(tabs)/live.tsx"));

describe("iki bölüm", () => {
  test("oynanacak düzenlenebilir, oynanan değil", () => {
    assert.match(KOD, /guncelBolunmus\.oynanacak\.map\(\(mp\) => benimTahminSatiri\(mp, true\)\)/);
    assert.match(KOD, /guncelBolunmus\.oynanan\.map\(\(mp\) => benimTahminSatiri\(mp, false\)\)/);
  });

  test("eski tek liste KALMADI (çift çizim olmasın)", () => {
    assert.ok(!/suzulmusGuncel\.map\(/.test(KOD), "karışık liste hâlâ çiziliyor");
  });

  test("düğmeler yalnız düzenlenebilir satırda", () => {
    const bas = KOD.indexOf("const benimTahminSatiri");
    assert.ok(bas > 0, "satır fonksiyonu yok");
    const blok = KOD.slice(bas, KOD.indexOf("\n  };", bas));
    assert.ok(blok.length > 1000, `blok şüpheli kısa: ${blok.length}`);
    const kosul = blok.indexOf("{duzenlenebilir && (");
    assert.ok(kosul > 0, "düğmeler koşula bağlı değil");
    assert.ok(blok.indexOf("cancelPred", kosul) > kosul, "🗑 koşulun DIŞINDA");
    assert.equal(blok.split("cancelPred").length - 1, 1, "🗑 birden fazla yerde");
  });

  test("ayrım ölçütü: durum NS + kilit anı sunucudan", () => {
    const bas = KOD.indexOf("const guncelBolunmus");
    const blok = KOD.slice(bas, bas + 900);
    assert.match(blok, /lockBeforeMin/, "kilit süresi sunucudan okunmuyor");
    assert.match(blok, /nowFromServer\(\)/, "cihaz saati kullanılıyor");
    assert.match(blok, /=== "NS"/, "başlamış maç düzenlenebilir sayılabilir");
  });

  test("i18n iki dilde", () => {
    const i18n = oku("lib/i18n.ts");
    for (const k of ["myPredsUpcoming", "myPredsPlayed"]) {
      assert.equal(i18n.split(new RegExp(`\\b${k}:`)).length - 1, 2, k);
    }
  });
});

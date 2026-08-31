/**
 * MAÇ SAATİ ETİKETİ — "Bugün 20:00" | "Yarın 20:00" | "3 Eyl 20:00"
 *
 * Kusur: maç saati BEŞ ekranda ayrı kuruluyordu ve üçü yalnızca saati
 * basıyordu; yarınki 20:00 maçı bugünkü 20:00'den ayırt edilemiyordu.
 *
 * Buradaki iddiaların hepsi ÖLÇÜLEN çıktıdan yazıldı, tahminden değil.
 * En kritik olanı gece sınırı: 23:50'de bakan kullanıcı için 00:10 maçı
 * "20 dk sonra" değil YARIN'dır — bu, kuralın 24 saat farkıyla değil TAKVİM
 * GÜNÜYLE çalıştığının kanıtı ve tek başına ters bir uygulamayı yakalar.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { macSaatiEtiketi, macGunEtiketi, ayniGunMu, takvimGunFarki } from "../lib/macSaati.ts";

/** Yerel dilimde tarih kur — helper de yerel takvimle karar veriyor. */
const g = (y: number, m: number, d: number, h: number, mi: number) =>
  new Date(y, m, d, h, mi).toISOString();

const SIMDI = new Date(2026, 7, 31, 14, 0); // 31 Ağustos 2026, 14:00

describe("macSaatiEtiketi", () => {
  test("bugünkü maç 'Bugün' ile başlar", () => {
    assert.equal(macSaatiEtiketi(g(2026, 7, 31, 20, 0), { simdi: SIMDI }), "Bugün 20:00");
  });

  test("gece yarısından sonraki saat de AYNI gün sayılır", () => {
    // 00:30 maçı, saat 14:00'te bakılırken hâlâ bugündür (geçmişte kalmış olsa da).
    assert.equal(macSaatiEtiketi(g(2026, 7, 31, 0, 30), { simdi: SIMDI }), "Bugün 00:30");
  });

  test("ertesi takvim günü 'Yarın'", () => {
    assert.equal(macSaatiEtiketi(g(2026, 8, 1, 20, 0), { simdi: SIMDI }), "Yarın 20:00");
  });

  test("GECE SINIRI: 23:50'de bakılırken 00:10 maçı YARIN (24 saat kuralı değil)", () => {
    const gece = new Date(2026, 7, 31, 23, 50);
    assert.equal(macSaatiEtiketi(g(2026, 8, 1, 0, 10), { simdi: gece }), "Yarın 00:10");
  });

  test("daha uzak gün tarih olarak yazılır, yıl EKLENMEZ (aynı yıl)", () => {
    assert.equal(macSaatiEtiketi(g(2026, 8, 3, 20, 0), { simdi: SIMDI }), "3 Eyl 20:00");
  });

  test("farklı yıldaki maçta yıl EKLENİR", () => {
    assert.equal(macSaatiEtiketi(g(2027, 0, 5, 20, 0), { simdi: SIMDI }), "5 Oca 2027 20:00");
  });

  test("geçmiş gün 'Bugün' demez, tarih basar", () => {
    assert.equal(macSaatiEtiketi(g(2026, 7, 30, 22, 0), { simdi: SIMDI }), "30 Ağu 22:00");
  });

  test("saatsiz kayıtta UYDURMA saat basılmaz", () => {
    assert.equal(macSaatiEtiketi("2026-09-03", { simdi: SIMDI }), "3 Eyl");
  });

  test("çözülemeyen girdide BOŞ döner — yanlış tarih basmaz", () => {
    assert.equal(macSaatiEtiketi(""), "");
    assert.equal(macSaatiEtiketi(null), "");
    assert.equal(macSaatiEtiketi(undefined), "");
    assert.equal(macSaatiEtiketi("   "), "");
    assert.equal(macSaatiEtiketi("abc", { simdi: SIMDI }), "");
  });

  test("gün adları ve ay dili çağırandan gelir (i18n bağlaması)", () => {
    const s = { simdi: SIMDI, bugun: "Today", yarin: "Tomorrow", yerel: "en-US" };
    assert.equal(macSaatiEtiketi(g(2026, 7, 31, 20, 0), s), "Today 20:00");
    assert.equal(macSaatiEtiketi(g(2026, 8, 1, 20, 0), s), "Tomorrow 20:00");
    assert.equal(macSaatiEtiketi(g(2026, 8, 3, 20, 0), s), "Sep 3 20:00");
  });

  test("bağlama unutulursa Türkçe etiket döner, BOŞ değil", () => {
    assert.equal(macSaatiEtiketi(g(2026, 7, 31, 20, 0), { simdi: SIMDI }), "Bugün 20:00");
  });
});

describe("ayniGunMu", () => {
  test("aynı gün farklı saat", () => {
    assert.equal(ayniGunMu(new Date(2026, 7, 31, 1, 0), new Date(2026, 7, 31, 23, 0)), true);
  });

  test("bir dakika arayla FARKLI gün", () => {
    assert.equal(ayniGunMu(new Date(2026, 7, 31, 23, 59), new Date(2026, 8, 1, 0, 0)), false);
  });

  test("aynı gün-ay ama farklı YIL, aynı gün DEĞİL", () => {
    assert.equal(ayniGunMu(new Date(2026, 7, 31, 12, 0), new Date(2027, 7, 31, 12, 0)), false);
  });
});

describe("macGunEtiketi", () => {
  test("saat taşımaz, yalnızca gün", () => {
    assert.equal(macGunEtiketi(new Date(2026, 7, 31, 20, 0), SIMDI), "Bugün");
    assert.equal(macGunEtiketi(new Date(2026, 8, 1, 20, 0), SIMDI), "Yarın");
  });
});

describe("takvimGunFarki", () => {
  test("bugün 0, yarın 1 — saat farkına bölmez", () => {
    // 24 saat kuralı olsaydı 14:00 -> ertesi gün 20:00 (30 saat) "2" derdi.
    assert.equal(takvimGunFarki(new Date(2026, 7, 31, 20, 0), SIMDI), 0);
    assert.equal(takvimGunFarki(new Date(2026, 8, 1, 20, 0), SIMDI), 1);
  });

  test("gece sınırı: 23:50 -> 00:10 farkı 1 gündür", () => {
    assert.equal(takvimGunFarki(new Date(2026, 8, 1, 0, 10), new Date(2026, 7, 31, 23, 50)), 1);
  });

  test("geçmiş gün negatif", () => {
    assert.equal(takvimGunFarki(new Date(2026, 7, 30, 22, 0), SIMDI), -1);
  });

  test("ay ve yıl sınırını aşar", () => {
    assert.equal(takvimGunFarki(new Date(2027, 0, 1, 0, 0), new Date(2026, 11, 31, 23, 0)), 1);
  });
});

/**
 * GÜNCELLEME TEKLİFİ — nöbetçi.
 *
 * 1–16 Eki 2026 arası teklif HİÇBİR cihazda çıkmadı: yerel sürüm kodu
 * `Constants.nativeBuildVersion`dan okunuyordu, alan Expo 54'te yok → 0 →
 * `surumKarari` her zaman "yok". Saf karar doğruydu; kör olan GİRDİYDİ.
 * Bu yüzden iki tür sınama var: karar kuralları + kaynak taraması.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { kodCoz, surumCoz, surumKarari } from "../lib/surum.ts";

const KOK = path.resolve(import.meta.dirname, "..");

/** Yorumları boşlukla doldurur (satır korunur); `://` URL'leri yorum sayılmaz. */
function yorumsuz(kaynak: string): string {
  return kaynak
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, (m, on) => on + " ".repeat(m.length - on.length));
}

test("karar: eski sürüme teklif, en az kodun altına zorunlu, güncele hiçbir şey", () => {
  const b = { sonKod: 48, enAzKod: 0, notlar: null };
  assert.equal(surumKarari(47, b), "teklif");
  assert.equal(surumKarari(48, b), "yok");
  assert.equal(surumKarari(49, b), "yok");
  assert.equal(surumKarari(40, { ...b, enAzKod: 45 }), "zorunlu");
});

test("karar: yerel kod okunamazsa (0) teklif YOK — bu davranış doğru, girdi kör olmamalı", () => {
  assert.equal(surumKarari(0, { sonKod: 48, enAzKod: 0, notlar: null }), "yok");
});

test("kodCoz: expo-application string verir; null/boş/çöp 0", () => {
  assert.equal(kodCoz("48"), 48);
  assert.equal(kodCoz(47), 47);
  assert.equal(kodCoz(null), 0);
  assert.equal(kodCoz(undefined), 0);
  assert.equal(kodCoz(""), 0);
  assert.equal(kodCoz("abc"), 0);
});

test("surumCoz: sunucu bloğu", () => {
  assert.deepEqual(surumCoz({ surum: { sonKod: 48, enAzKod: 0, notlar: null } }), { sonKod: 48, enAzKod: 0, notlar: null });
  assert.equal(surumCoz({ surum: { sonKod: 0 } }), null);
  assert.equal(surumCoz(null), null);
});

test("yerel kod expo-application'dan okunuyor, Constants.nativeBuildVersion HİÇBİR yerde okunmuyor", () => {
  const g = yorumsuz(fs.readFileSync(path.join(KOK, "lib/guncelleme.ts"), "utf8"));
  assert.match(g, /Application\.nativeBuildVersion/, "guncelleme.ts yerel kodu expo-application'dan okumuyor");

  const bulunan: string[] = [];
  const tara = (dizin: string) => {
    for (const ad of fs.readdirSync(dizin, { withFileTypes: true })) {
      const tam = path.join(dizin, ad.name);
      if (ad.isDirectory()) { if (ad.name !== "node_modules") tara(tam); continue; }
      if (!/\.(ts|tsx)$/.test(ad.name)) continue;
      if (/Constants\s*\.\s*nativeBuildVersion/.test(yorumsuz(fs.readFileSync(tam, "utf8")))) bulunan.push(tam);
    }
  };
  let sayilan = 0;
  for (const d of ["app", "components", "lib", "hooks"]) {
    const tam = path.join(KOK, d);
    if (fs.existsSync(tam)) { tara(tam); sayilan++; }
  }
  assert.ok(sayilan >= 3, `taranan dizin sayısı ${sayilan} — tarama kör`);
  assert.deepEqual(bulunan, [], "Constants.nativeBuildVersion Expo 54'te YOK (hep undefined)");
});

test("surum.ts saf kalmalı (Node testleri yükleyebilsin): expo/react-native içe aktarımı yok", () => {
  const s = yorumsuz(fs.readFileSync(path.join(KOK, "lib/surum.ts"), "utf8"));
  assert.doesNotMatch(s, /from\s+["'](expo|react-native)/);
});

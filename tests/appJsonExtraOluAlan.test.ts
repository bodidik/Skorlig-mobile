import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * app.json `extra` BLOĞUNDA ÖLÜ ALAN KALMASIN.
 *
 * ⚠️ ÖLÇÜLEN DURUM (2026-09-13): blokta sekiz anahtar vardı, uygulamada
 * yalnızca üçü okunuyordu. Ölüler arasında `scoring.startBalance: 500` da
 * vardı — deponun kendi testinin "16 KAT yanlış" diye kayda geçirdiği eski
 * değer (gerçeği bugün 10 LC). Ayrıca `features.showLeaderboard: false`
 * sunucunun söylediğinin (`true`) tersiydi ve `apiFootball` ölü bir
 * sağlayıcıyı ilan ediyordu.
 *
 * Kimseye yansımıyordu çünkü hiçbir ekran okumuyordu — ama tipli, dolu ve
 * yetkili görünen bir yapılandırma bloğu, biri onu ekrana bağladığı gün
 * yanlış rakamı gösterir. Bu deponun kayıtlı "ölü alan" ve "ilan mı gerçek
 * mi" sınıfları. Blok dörde indirildi; bu test yeniden şişmesini nöbetliyor.
 *
 * ⚠️ `router` ve `eas` HARİÇ: ikisini de Expo'nun kendisi yazıyor
 * (expo-router ve EAS projectId), uygulama kodunda aranmaları anlamsız.
 */

const KOK = path.join(import.meta.dirname, "..");
const app = JSON.parse(fs.readFileSync(path.join(KOK, "app.json"), "utf8"));

/** app/ lib/ components/ altındaki tüm kaynak — tek dize. */
function kaynak(): string {
  const parcalar: string[] = [];
  const gez = (d: string) => {
    for (const ad of fs.readdirSync(d, { withFileTypes: true })) {
      const tam = path.join(d, ad.name);
      if (ad.isDirectory()) { gez(tam); continue; }
      if (/\.(ts|tsx)$/.test(ad.name)) parcalar.push(fs.readFileSync(tam, "utf8"));
    }
  };
  for (const d of ["app", "lib", "components"]) {
    const tam = path.join(KOK, d);
    if (fs.existsSync(tam)) gez(tam);
  }
  return parcalar.join("\n");
}

const EXPO_YAZAR = new Set(["router", "eas"]);

describe("app.json extra", () => {
  test("her anahtar uygulamada GERÇEKTEN okunuyor", () => {
    const src = kaynak();
    const anahtarlar = Object.keys(app.expo.extra || {}).filter((k) => !EXPO_YAZAR.has(k));
    assert.ok(anahtarlar.length > 0, "extra bos gorunuyor — olcum anlamsiz");

    const olu = anahtarlar.filter((k) => !src.includes(k));
    assert.deepEqual(olu, [],
      `app.json extra icinde OLU anahtar: ${olu.join(", ")} — okunmayan yapilandirma ` +
      "yetkili gorunur ve biri ekrana baglarsa yanlis deger gosterir");
  });

  test("NEGATİF KONTROL: tarama gerçekten okuma buluyor", () => {
    /* ⚠️ Bu olmadan yukarıdaki "temiz" sonucu, taramanın hiçbir dosyayı
     * okumamasından da gelebilirdi — bugün tam bu tuzağa düştüm: ilk
     * ölçütüm `EXTRA?.adminUserIds` kullanımını göremeyip anahtarı "ölü"
     * saydı ve az kalsın okunan bir ayarı siliyordum. */
    const src = kaynak();
    assert.ok(src.length > 10000, `tarama bos dondu (${src.length} karakter)`);
    assert.ok(src.includes("apiBase"), "bilinen okuma bulunamadi — tarama kor");
    assert.ok(src.includes("adminUserIds"),
      "EXTRA?.adminUserIds kullanimi bulunamadi — desen bu bicimi kaciriyor");
  });

  test("eski 500 LC açılış bakiyesi geri gelmedi", () => {
    /* Sunucudaki tek kaynak `acilisBakiyesi()`; lansmanda 10 LC, dönem
     * sonrası 30. app.json'a sabit bir bakiye yazmak o kaynağı ikiye böler. */
    const extra = JSON.stringify(app.expo.extra || {});
    assert.doesNotMatch(extra, /startBalance/,
      "app.json extra icine startBalance geri eklenmis — sunucu tek kaynak olmali");
  });
});

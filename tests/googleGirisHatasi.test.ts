/**
 * GOOGLE GİRİŞ HATASI ÖLÇÜLEBİLİR OLMALI.
 *
 * ⚠️ NEDEN: mağaza sürümünde Google girişi hiç sürülemedi çünkü düştüğünde
 * HİÇBİR İZ BIRAKMIYORDU. `login.tsx` `catch {}`, `GuestBanner` "tekrar dene",
 * `predict.tsx` `.catch(() => {})`. Play derlemesinde en olası düşme sebebi
 * DEVELOPER_ERROR (kod 10 — imza SHA-1'i Google'da kayıtlı değil) ile
 * "kullanıcı vazgeçti" ekranda AYNI görünüyordu.
 *
 * ⚠️ TEST CÜMLELERİ DEĞİL KURALLARI SINIYOR (bkz. hataMesaji.test.ts):
 *  1. Vazgeçme sessizdir, başka hiçbir şey sessiz değildir.
 *  2. Kod HER sessiz-olmayan mesajda görünür — testçinin ekran görüntüsü
 *     mağaza derlemesindeki tek ölçü aletimiz.
 *  3. Kod 10 "tekrar dene" DEMEZ: kullanıcının yapabileceği bir şey yok,
 *     bunu söylemek yalan olur ve hatayı yine bize ulaştırmaz.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { googleGirisHatasi } from "../lib/googleGirisHatasi.ts";

const hata = (code?: unknown) => (code === undefined ? new Error("bos") : Object.assign(new Error("x"), { code }));

describe("vazgeçme sessiz", () => {
  test("Android iptal kodu (12501) sessiz", () => {
    assert.equal(googleGirisHatasi(hata("12501")).sessiz, true);
  });

  test("iOS iptal kodu (-5) sessiz", () => {
    assert.equal(googleGirisHatasi(hata("-5")).sessiz, true);
  });

  test("çalışma anındaki kütüphane sabiti de iptal sayılır", () => {
    /* `statusCodes.SIGN_IN_CANCELLED` sürümden sürüme değişebiliyor;
     * sabiti gömmek yerine çağrı anında geçiriyoruz. */
    const r = googleGirisHatasi(hata("BENZERSIZ_IPTAL"), "BENZERSIZ_IPTAL");
    assert.equal(r.sessiz, true, "calisma anindaki iptal kodu iptal sayilmadi");
  });

  test("KODSUZ hata İPTAL SAYILMAZ", () => {
    /* ⚠️ ESKİ KUSURUN NÖBETÇİSİ: kod `e.code === statusCodes.SIGN_IN_CANCELLED`
     * diye bakıyordu. Kütüphane yüklenemediğinde `statusCodes` boş nesne olur,
     * sağ taraf `undefined` olur ve KODSUZ HER HATA iptal sayılıp yutulurdu. */
    const r = googleGirisHatasi(hata(), undefined);
    assert.equal(r.sessiz, false, "kodsuz hata sessizce yutuldu — eski kusur geri geldi");
    assert.ok(r.mesaj.length > 10, "kodsuz hataya cumle uretilmedi");
  });
});

describe("kod kullanıcıya ulaşır", () => {
  const KODLAR = ["10", "7", "8", "2", "4", "12500", "12502", "EXPO_GO", "auth/invalid-credential", "BILINMEYEN_KOD_9999"];

  for (const k of KODLAR) {
    test(`"${k}" → sessiz değil ve kod mesajda görünüyor`, () => {
      const r = googleGirisHatasi(hata(k));
      assert.equal(r.sessiz, false, `${k} sessiz sayildi`);
      assert.equal(r.kod, k, "ham kod korunmadi");
      assert.ok(r.mesaj.includes(k), `mesajda kod yok: ${r.mesaj}`);
    });
  }

  test("kodsuz hatada bile bir işaret var", () => {
    const r = googleGirisHatasi(hata());
    assert.ok(r.mesaj.includes(r.kod), "kodsuz durumda isaret mesaja girmedi");
  });
});

describe("kod 10 — mağaza tuzağı", () => {
  test("yapılandırma hatası 'tekrar dene' DEMEZ", () => {
    /* Kural: kullanıcının düzeltebileceği bir şey yokken tekrar denemesini
     * istemek hem yalan hem de hatayı bize hiç ulaştırmıyor. */
    const m = googleGirisHatasi(hata("10")).mesaj.toLocaleLowerCase("tr");
    assert.ok(!/tekrar dene/.test(m), `kod 10 mesaji tekrar denemeyi oneriyor: ${m}`);
    assert.ok(/bildir/.test(m), "kod 10 mesaji kodu bildirmeyi istemiyor");
  });

  test("geçici hatalar tekrar denemeyi ÖNERİR (ayrım gerçekten yapılıyor)", () => {
    /* Negatif taraf: yukarıdaki iddia "hiçbir mesajda yok" demek olmasın. */
    const m = googleGirisHatasi(hata("7")).mesaj.toLocaleLowerCase("tr");
    assert.ok(/tekrar dene/.test(m), "gecici ag hatasi tekrar denemeyi onermiyor");
  });
});

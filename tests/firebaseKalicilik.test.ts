/**
 * OTURUM KALICILIĞI PLATFORMA GÖRE SEÇİLİYOR.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-11, önizlemede görüldü): kalıcılık yalnızca
 * `getReactNativePersistence` üzerinden aranıyordu. O fonksiyon
 * `@firebase/auth`un SADECE RN girişinde var:
 *
 *     react-native  dist/rn/index.js     9 geçiş
 *     browser       dist/esm/index.js    0
 *     main          dist/node/index.js   0
 *
 * Yani TELEFONDA sorun yok — Metro varsayılan olarak `react-native` girişini
 * seçiyor. Ama WEB'de bulunamıyor, kod kalıcılıksız `initializeAuth(app)`a
 * düşüyor ve oturum YALNIZCA BELLEKTE kalıyor.
 *
 * ÖLÇÜLDÜ (tarayıcıda, düzeltmeden önce): her tam sayfa yüklemesinde YENİ
 * anonim kimlik alınıyordu — uid sırayla 3FXaS2…, XxNPYUN…, hXYcH0… Puan ve
 * cüzdan kimliğe bağlı olduğu için web'de hiçbir şey birikmez. Düzeltmeden
 * sonra iki ardışık tam yüklemede uid AYNI kaldı.
 *
 * ⚠️ HATA MESAJI DA YANILTIYORDU: web'de çıkıp "firebase / @firebase/auth
 * sürümlerini kontrol edin" diyordu, oysa web'in doğru cevabı
 * `browserLocalPersistence`. Yanlış yere bakan bir uyarı, hiç uyarmamaktan
 * daha çok vakit kaybettirir.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTH = path.join(KOK, "node_modules", "@firebase", "auth");

const oku = (p: string) => fs.readFileSync(p, "utf8");
/** Yorumları eleyip kaynağı döndürür — yorumlar kusuru birebir alıntılıyor. */
const kaynak = (p: string) =>
  oku(p)
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");

describe("kurulum sınandı", () => {
  test("@firebase/auth kurulu ve giriş alanları okunabiliyor", () => {
    assert.ok(fs.existsSync(AUTH), "@firebase/auth kurulu degil — olcum yapilamaz");
    const p = JSON.parse(oku(path.join(AUTH, "package.json")));
    assert.ok(p["react-native"], "paketin react-native girisi yok — RN cozumlemesi degismis");
    assert.ok(p.browser || p.module, "web girisi bulunamadi");
  });
});

describe("NEDEN PLATFORMA GÖRE — üst akış gerçeği", () => {
  test("getReactNativePersistence YALNIZ RN girişinde", () => {
    /**
     * Bu iddia bir üst akış gerçeğini çiviliyor. Bir gün sürüm yükseltmesiyle
     * fonksiyon web girişinde de gelirse bu test DÜŞER — ve düşmesi doğru:
     * o zaman platform ayrımı gereksizleşmiş demektir, gözden geçirilmeli.
     */
    const p = JSON.parse(oku(path.join(AUTH, "package.json")));
    const say = (rel: string) =>
      (oku(path.join(AUTH, rel)).match(/getReactNativePersistence/g) || []).length;

    assert.ok(say(p["react-native"]) > 0,
      "RN girisinde getReactNativePersistence YOK — telefonda oturum kalici olmaz");
    assert.equal(say(p.browser || p.module), 0,
      "web girisinde de bulunuyor — platform ayrimi artik gereksiz olabilir, gozden gecir");
  });

  test("browserLocalPersistence YALNIZ web girişinde", () => {
    const p = JSON.parse(oku(path.join(AUTH, "package.json")));
    const say = (rel: string) =>
      (oku(path.join(AUTH, rel)).match(/browserLocalPersistence/g) || []).length;

    assert.ok(say(p.browser || p.module) > 0, "web girisinde browserLocalPersistence yok");
    assert.equal(say(p["react-native"]), 0,
      "RN girisinde de var — statik ice aktarim guvenli hale gelmis olabilir");
  });
});

describe("SEÇİM PLATFORMA GÖRE", () => {
  const src = kaynak(path.join(KOK, "lib", "firebase.ts"));

  test("web ve telefon AYRI yollardan besleniyor", () => {
    assert.ok(/Platform\.OS === "web"/.test(src),
      "kalicilik platformdan bagimsiz seciliyor — web'de oturum bellekte kalir");
    /**
     * ⚠️ VARLIK ARAMAK YETMİYOR — NEGATİF KONTROLDE ÖLÇÜLDÜ. İlk hâli
     * yalnız dizenin geçtiğine bakıyordu; `webPersistenceBul()` ÇAĞRISINI
     * söküp yerine `null` yazan mutasyon testi DÜŞÜRMEDİ, çünkü dize
     * fonksiyonun kendi TANIMI içinde hâlâ geçiyor. Kusur tam o: web
     * kalıcılığı hiç alınmıyor ve oturum bellekte kalıyor.
     *
     * Tanım + en az bir çağrı = en az iki geçiş.
     */
    const cagriSayisi = (ad: string) => (src.match(new RegExp(ad, "g")) || []).length;
    assert.ok(cagriSayisi("webPersistenceBul") >= 2,
      "web kaliciligi hic CAGRILMIYOR — tanimli ama kullanilmiyor, oturum bellekte kalir");
    assert.ok(cagriSayisi("rnPersistenceBul") >= 2,
      "RN kaliciligi hic CAGRILMIYOR");
    assert.ok(/browserLocalPersistence/.test(src), "web kaliciligi hic denenmiyor");
    assert.ok(/getReactNativePersistence/.test(src), "RN kaliciligi hic denenmiyor");
  });

  test("web sembolü TEMBEL çözülüyor — telefonda undefined olurdu", () => {
    /* RN girişinde `browserLocalPersistence` YOK (yukarıda ölçülüyor); statik
     * içe aktarım telefonda tanımsız bir değer getirirdi. */
    assert.ok(!/^import\s*\{[^}]*browserLocalPersistence/m.test(src),
      "browserLocalPersistence statik ice aktarilmis — RN girisinde o sembol yok");
    assert.ok(/require\(["']firebase\/auth["']\)/.test(src),
      "web sembolu tembel cozulmuyor");
  });

  test("İKİ dalda da SESSİZ KALINMIYOR", () => {
    /**
     * Sessiz düşüş, bu hatanın aylarca fark edilmemesinin tek sebebiydi
     * (dosyanın kendi notu). Uyarı platforma göre olmalı: web'de "sürümleri
     * kontrol edin" demek yanlış yere baktırıyordu.
     */
    const i = src.indexOf("console.error");
    assert.ok(i > 0, "kalicilik bulunamadiginda hic uyari yok");
    const pencere = src.slice(i, i + 700);
    assert.ok(/browserLocalPersistence bulunamadi/.test(pencere),
      "web dalinda uyari yok ya da RN mesajini tekrarliyor");
    assert.ok(/getReactNativePersistence bulunamadi/.test(pencere),
      "RN dalinda uyari yok");
  });
});

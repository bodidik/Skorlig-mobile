/**
 * HER LİSTEDE ARAMA · TAHMİN SÜZGECİ · "EN ÇOK TAHMİN" SIRASI.
 *
 * KULLANICI İSTEĞİ (2026-09-29/30):
 *   • *"Her listede bir arama bulma ekranı olsun; mesela Real Madrid maçı
 *     arayan kişi 'rea' yazınca içeren seçenekler filtrelenmeye başlasın.
 *     Bu hem canlıda hem de tahmin için ararken olsun."*
 *   • *"Admin skor vs'ye de arama kutucuğu."*
 *   • *"En çok tahmin alan maçlar canlıda önce gösterilsin… ya da kişi
 *     'tahmin yaptığım maçlar' filtrelemesine sahip olsun."* → İKİSİ de var.
 *
 * ÖLÇÜLDÜ (önce): `AramaKutusu` sayısı — canlı sekmesi 2, sıralama 1, krallar
 * 1, **canlı skorlar 0, admin paneli 0**. İki ekranda arama HİÇ yoktu.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
const kodla = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const LIVE = kodla(oku("app/(tabs)/live.tsx"));
const SKOR = kodla(oku("app/livescores.tsx"));
const ADMIN = kodla(oku("app/admin-live.tsx"));

describe("arama kutusu olan ekranlar", () => {
  /* Liste TAŞIYAN her ekran burada sayılıyor; yeni liste ekranı eklenince
   * bu diziye satır eklenmeli (aksi halde ölçüt sessizce daralır). */
  const EKRANLAR: [string, string][] = [
    ["app/(tabs)/live.tsx", LIVE],
    ["app/livescores.tsx", SKOR],
    ["app/admin-live.tsx", ADMIN],
  ];

  for (const [ad, src] of EKRANLAR) {
    test(`${ad} arama kutusu çiziyor`, () => {
      assert.match(src, /<AramaKutusu/, "arama kutusu yok");
      /* ⚠️ ORTAK SÜZGEÇ ŞART: kendi karşılaştırmasını yazan ekran Türkçe
       * normalleştirmenin (İ/ı, ş/s) ikinci kopyası olur ve ayrışır. */
      assert.match(src, /from "\.\.\/(\.\.\/)?lib\/aramaSuzgeci"/, "ortak süzgeç kullanılmıyor");
    });
  }

  test("canlı skorlarda süzme MAÇ düzeyinde (lig düzeyinde değil)", () => {
    /* Lig düzeyinde süzmek "Real" arayınca La Liga'nın TAMAMINI getirirdi. */
    assert.match(SKOR, /displayLeagues\.flatMap\(/, "maçlar düzleştirilmiyor");
    assert.match(SKOR, /matches: l\.matches\.filter\(/, "lig içindeki maçlar süzülmüyor");
    assert.match(SKOR, /\.filter\(\(l\) => l\.matches\.length > 0\)/, "maçı kalmayan lig başlığı düşmüyor");
  });

  test("iki harften az yazınca liste BOŞALMIYOR", () => {
    /* Üç ekranın üçünde de aynı karar: "kisa" durumunda tam liste.
     *
     * ⚠️ ÖLÇÜT BİÇİME DEĞİL KARARA BAKIYOR — ilk hâli yalnız olumlu yazımı
     * (`durum === "sonuc" || durum === "bulunamadi"`) tanıyordu ve
     * `livescores.tsx` aynı kararı TERS mantıkla yazdığı için
     * (`durum !== "sonuc" && durum !== "bulunamadi"` → tam liste) sahte
     * düştü. Ölçülen şey: iki durumun ikisinin de adının geçmesi. */
    for (const [ad, src] of EKRANLAR) {
      assert.ok(/durum\s*[!=]==\s*"sonuc"/.test(src) && /durum\s*[!=]==\s*"bulunamadi"/.test(src),
        `${ad}: kısa terim dalı hiç ayrılmamış — liste boşalabilir`);
    }
  });
});

describe("tahmin süzgeci ve sırası", () => {
  test("'tahmin ettiklerim' süzgeci var ve ELEME yapıyor", () => {
    assert.match(LIVE, /yalnizTahminliler/, "süzgeç durumu yok");
    assert.match(LIVE, /predFlags\[String\(fx\.fixtureId \|\| ""\)\.trim\(\)\] === true/,
      "süzgeç tahmin bayrağına bakmıyor");
  });

  test("bayraklar YÜKLENMEDEN süzmüyor — liste bir an boşalmasın", () => {
    assert.match(LIVE, /if \(!yalnizTahminliler \|\| predLoading\) return aramaliListe;/,
      "yükleme sırasında süzüyor — 'tahminlerim kayboldu' sanısı");
  });

  test("süzgeç ARAMANIN üstüne biniyor, yerine geçmiyor", () => {
    assert.match(LIVE, /const suzulmusListe = useMemo\(\(\) => \{[\s\S]{0,200}aramaliListe/,
      "süzgeç arama sonucundan türemiyor");
  });

  test("'en çok tahmin' sırası İNSAN sayısını okuyor", () => {
    /* Bot kadrosu odaları dolduruyor; toplamla sıralamak "en çok bot atanan
     * maç" sıralaması olurdu. */
    assert.match(LIVE, /\/api\/pred\/counts\?fixtureIds=/, "sayı ucu çağrılmıyor");
    assert.match(LIVE, /Number\(s\?\.insan \?\? 0\)/, "insan sayısı yerine toplam okunuyor");
  });

  test("sayı gelmezse sıra TARİHE düşüyor (rastgele görünmesin)", () => {
    const bas = LIVE.indexOf('if (siralama === "tahmin")');
    assert.ok(bas > 0, "tahmin sıralaması yok");
    const blok = LIVE.slice(bas, bas + 400);
    assert.match(blok, /if \(sa !== sb\) return sb - sa;/, "çok tahmin alan öne gelmiyor");
    assert.match(blok, /return ko\(a\) - ko\(b\);/, "eşitlik saate düşmüyor");
  });

  test("sayı isteği YALNIZ o sıra seçiliyken atılıyor", () => {
    assert.match(LIVE, /if \(siralama !== "tahmin"\) return;/,
      "kullanılmayan sıra için her yüklemede fazladan istek");
  });

  test("i18n üç anahtar da iki dilde", () => {
    const i18n = oku("lib/i18n.ts");
    for (const k of ["sortByPreds", "onlyMyPreds", "searchTeams"]) {
      const kac = i18n.split(new RegExp(`\\b${k}:`)).length - 1;
      assert.ok(kac >= 2, `${k} yalnız ${kac} dilde`);
    }
  });
});

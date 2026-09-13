import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { gosterilsinMi, sayacCoz, GOSTERIM_SINIRI } from "../lib/nasilOynanirKurali.ts";
import { t, setLang } from "../lib/i18n.ts";

/**
 * NASIL OYNANIR — şerit kuralı, sayfa ve metinler.
 *
 * ⚠️ ÖLÇÜLEN BOŞLUK (2026-09-13): uygulamada kuralları anlatan tek yüzey
 * `app/index.tsx`teki dört giriş slaytıydı ve o ekran `isFirstRun()` ile
 * kapılı — ömürde BİR kez. Hızlı geçen kullanıcı kuralları bir daha
 * bulamıyordu; aranıp bulunabilecek bir sayfa yoktu.
 *
 * Kullanıcı kararı: şerit ilk **20 açılışta** çıksın, sonra sussun; arayan
 * `/nasil-oynanir` sayfasından okusun.
 *
 * ⚠️ SAYFADAKİ SAYILAR METİNDE OLMAMALI. Maç bedeli 30 Eylül'de 1 → 3
 * olacak, açılış bakiyesi 10 → 30, seri bonusları ve kupon bedeli de oranlı.
 * Rakamı cümleye gömmek sayfayı o gün yalancı yapar; sunucudan geliyorlar
 * (`/api/config` → `kurallar`). Bu dosya metinlerde rakam olmadığını da
 * sınıyor.
 */

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");

describe("şerit kuralı", () => {
  test("ilk 20 açılışta görünür, 21'de susar", () => {
    assert.equal(GOSTERIM_SINIRI, 20, "kullanici karari 20 acilis");
    assert.equal(gosterilsinMi(1, false), true, "ilk acilis");
    assert.equal(gosterilsinMi(20, false), true, "sinir DAHIL");
    assert.equal(gosterilsinMi(21, false), false, "sinirdan sonra susmali");
    assert.equal(gosterilsinMi(500, false), false);
  });

  test("kullanıcı kapattıysa sayaçtan BAĞIMSIZ susar", () => {
    assert.equal(gosterilsinMi(1, true), false, "kapatan kisi ilk acilista bile gormemeli");
    assert.equal(gosterilsinMi(null, true), false);
  });

  test("kayıt YOKKEN gösterilir — null ile 0 aynı değil", () => {
    /* ⚠️ `null` = henuz sayilmadi. `0` gibi davranilsaydi sorun olmazdi ama
     * `null`u "gosterme" tarafina atmak ilk acilisi yutardi — deponun
     * "degerlendiremedim ile olumsuz karisiyor" sinifi. */
    assert.equal(gosterilsinMi(null, false), true);
    assert.equal(gosterilsinMi(undefined, false), true);
  });

  test("bozuk kayıt kullanıcıyı şeritsiz bırakmıyor", () => {
    assert.equal(sayacCoz("abc"), null, "bozuk deger null olmali");
    assert.equal(sayacCoz(null), null);
    assert.equal(sayacCoz("7"), 7);
    assert.equal(sayacCoz("-3"), null, "negatif kayit bozuktur");
    assert.equal(gosterilsinMi(sayacCoz("abc"), false), true, "bozuk kayitta susmamali");
  });
});

describe("şerit bileşeni", () => {
  const src = oku("components/NasilOynanirSeridi.tsx");

  test("açılış sayacı SÜREÇ BAŞINA bir kez artıyor", () => {
    /* ⚠️ Her render'da artsaydi kullanici sekmeler arasinda gezerken sayac
     * dakikalar icinde 20'yi gecer ve serit kalici olarak susardi. */
    assert.match(src, /let _sayildi = false/, "surec bayragi yok");
    assert.match(src, /if \(!_sayildi\)/, "sayim bayrakla korunmuyor");
  });

  test("yükleme bitmeden ekrana karar verilmiyor", () => {
    /* `hazir` bir DURUM olmali: ref ayni commit'te true olur ve ekran hala
     * bos durumu gorur (bu depoda ve kardes projede kayitli kusur). */
    assert.match(src, /const \[hazir, setHazir\] = useState\(false\)/,
      "hazir bayragi durum degil");
    assert.match(src, /if \(!hazir \|\| !goster\) return null/,
      "yukleme bitmeden cizim engellenmiyor");
  });

  test("kapatma kalıcı yazılıyor", () => {
    assert.match(src, /KAPALI_ANAHTARI, "1"/, "tekrar gosterme kalici degil");
  });
});

describe("sayfa", () => {
  const src = oku("app/nasil-oynanir.tsx");

  test("sayılar SUNUCUDAN okunuyor", () => {
    assert.match(src, /apiFetch\("\/api\/config"\)/, "kurallar ucu cagrilmiyor");
    assert.match(src, /j\?\.kurallar/, "kurallar blogu okunmuyor");
  });

  test("ekrandaki her kelime t() üzerinden geçiyor", () => {
    /* ⚠️ ÖLÇÜLEN KUSUR, TEORİK DEĞİL: ilk yazımda satır `{x.esik} ardışık ·
     * {x.etiket}` idi — "ardışık" sabit Türkçeydi ve `x.etiket` sunucudan da
     * Türkçe geliyordu, yani İngilizce arayüzde iki kelime birden Türkçe
     * kalıyordu. Aynı satırda "puan" da sabitti. Yeni bir bölüm eklenirken
     * tekrar etmesi çok kolay; nöbetçi o yüzden burada. */
    const govde = src
      .replace(/\/\*[\s\S]*?\*\//g, " ")          // blok yorumlar
      .replace(/^\s*\/\/.*$/gm, " ");             // satır yorumları

    /* ⚠️ ÖLÇÜT `<Text>` GÖVDESİYLE SINIRLI. İlk denemem ">…<" arasını taradı
     * ve `=>` okunu JSX sandı — tek bulgusu `");\n\n  return ("` oldu. Yanlış
     * pozitif üreten nöbetçi hiç nöbetçi olmamasından beterdir (deponun
     * kayıtlı dersi), ölçüt o yüzden daraltıldı: yalnızca ekrana metin basan
     * eleman. `LC` bir marka kısaltması, çevrilmiyor — tek muafiyet. */
    /* ⚠️ SÜSLÜ PARANTEZ İÇ İÇE GEÇİYOR: `{t("k", { n: 1 })}`. Düz bir
     * `\{[^{}]*\}` deseni dışarıdakini kapatamıyor ve ara değerin KENDİSİNİ
     * bulgu diye basıyordu (ikinci yanlış pozitifim). Derinlik sayarak
     * ayıklıyoruz — dışarıda kalan yalnızca gerçek JSX metni. */
    const parantezsiz = (metin: string) => {
      let derinlik = 0, out = "";
      for (const ch of metin) {
        if (ch === "{") derinlik++;
        else if (ch === "}") derinlik = Math.max(0, derinlik - 1);
        else if (derinlik === 0) out += ch;
      }
      return out;
    };

    const bulgular: string[] = [];
    for (const m of govde.matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>/g)) {
      const kalan = parantezsiz(m[1]).replace(/\bLC\b/g, " ").trim();
      if (/[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(kalan)) bulgular.push(kalan);
    }
    assert.deepEqual(bulgular, [],
      "sayfada t() disinda duz metin var — ikinci dilde Turkce kalir");
  });

  test("sayı okunamazsa SESSİZ kalmıyor", () => {
    /* Eksik rakami bos birakmak, kullanicinin kendi rakamini uydurmasina
     * yol acar. Sayfa sebebi yaziyor. */
    assert.match(src, /accessibilityRole="alert"/, "hata satiri duyurulmuyor");
    assert.match(src, /howNumbersFail/, "sebep metni yok");
  });
});

describe("sayfaya giden kapılar", () => {
  /* ⚠️ ASIL KUSUR SAYFA DEĞİL ULAŞILAMAMASIYDI. `app/index.tsx`teki dört
   * slayt `isFirstRun()` ile ömürde bir kez çıkıyor, şerit de 20 açılışta
   * susuyor. Kalıcı kapı profil sekmesindeki satır; o gidince sayfa yazılmış
   * ama ulaşılmaz olur ve bu test hiçbir şey söylemezdi. */
  test("kalıcı kapı profil sekmesinde duruyor", () => {
    const me = oku("app/(tabs)/me.tsx");
    assert.match(me, /nav\.push\("\/nasil-oynanir"/, "profilde nasil oynanir satiri yok");
  });

  test("geçici kapı canlı sekmesinde monte", () => {
    const live = oku("app/(tabs)/live.tsx");
    assert.match(live, /import NasilOynanirSeridi/, "serit ice aktarilmamis");
    assert.match(live, /<NasilOynanirSeridi \/>/, "serit cizilmiyor");
  });

  test("şerit ile kalıcı kapı AYNI adrese gidiyor", () => {
    /* İki kapının adresi ayrışırsa biri 404 olur ve kimse fark etmez. */
    const serit = oku("components/NasilOynanirSeridi.tsx");
    assert.match(serit, /router\.push\("\/nasil-oynanir"\)/);
    assert.ok(fs.existsSync(path.join(KOK, "app/nasil-oynanir.tsx")), "rota dosyasi yok");
  });
});

describe("metinler", () => {
  test("iki dilde de var", () => {
    for (const dil of ["tr", "en"] as const) {
      setLang(dil);
      for (const k of ["howTitle", "howLead", "howStep1", "howStep4Desc",
        "howLcTitle", "howStreakTitle", "howCouponTitle", "how1987Title",
        "howStripText", "howStripHide", "howNumbersFail"] as const) {
        const m = t(k);
        assert.ok(m && m !== k && m.length > 2, `${dil}/${k} cevrilmemis: ${JSON.stringify(m)}`);
      }
    }
    setLang("tr");
  });

  test("METİNDE RAKAM YOK — sayılar yalnızca yer tutucudan gelir", () => {
    /**
     * ⚠️ ASIL NÖBET BU. Maç bedeli 30 Eylül'de 1 → 3 olacak; "1 LC" yazan bir
     * cümle o gün yalan söyler. Yer tutucu ({n}, {bedel}, {saat}, {tavan},
     * {normal}, {d}) serbest — onlar sunucudan doluyor.
     */
    /* ⚠️ TEK MUAFİYET: ADIM NUMARASI. İlk yazımda nöbetçi üç yanlış pozitif
     * verdi (`howStep1..4` · `howLcRegen` · `howStripText`). İkisi METİN
     * düzeltilerek kapandı — muafiyet eklenerek değil:
     *   · `howLcRegen`in "1 LC"si artık `{miktar}` (tık miktarı dönemden
     *     bağımsız AMA `SKORLIG_REGEN_LC` ile değişebiliyor — ikinci
     *     gerçeklikti, `kurallar.gunluk.regenMiktar` olarak uca eklendi),
     *   · `howStripText` "1 dakikada" → "bir dakikada".
     * Kalan tek biçim `"3. Maç bitince…"` gibi baştaki sıra numarası: bu bir
     * EKONOMİ değeri değil, cümlenin kendi numarası. Anahtar listesi yerine
     * BİÇİM elendi — yeni bir adım eklenince liste bayatlamasın. */
    const ADIM_NO = /^\s*"?\d+\.\s/;

    const src = oku("lib/i18n.ts").split("\n")
      .filter((l) => /^\s*how[A-Z]/.test(l));
    assert.ok(src.length >= 20, `nasil oynanir metinleri bulunamadi (${src.length})`);
    const rakamli = src
      .filter((l) => {
        const deger = l.slice(l.indexOf(":") + 1).trim();
        const temiz = deger
          .replace(ADIM_NO, "")                // "1. Maçı seç" — sira numarasi
          .replace(/\{[a-zA-Z]+\}/g, "");      // yer tutucular sunucudan doluyor
        return /[0-9]/.test(temiz);
      })
      .map((l) => l.trim().split(":")[0]);

    assert.deepEqual([...new Set(rakamli)], [],
      "metinde sabit EKONOMI rakami var — donem degisince sayfa yalan soyler");
  });
});

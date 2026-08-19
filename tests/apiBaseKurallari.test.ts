/**
 * API ADRESİ KARARLARI.
 *
 * ⚠️ BU KURALLAR ÜRETİMDE UYGULAMAYI TAMAMEN KULLANILAMAZ YAPTI ve o güne
 * kadar hiç ölçülemiyorlardı: `apiBase.ts` expo-constants ve react-native
 * içe aktardığı için Node altında yüklenmiyor. Kurallar bu yüzden
 * `lib/apiBaseKurallari.ts` içine saf çekirdek olarak ayrıldı.
 *
 * Kesintinin kendisi (2026-08-09): sunucuda `trust proxy` ayarlı olmadığı
 * için `/api/runtime/config` yanıtı `apiBase: "http://…"` döndü. İstemci
 * https adresini bu değerle EZDİ; Android yayın derlemesi cleartext HTTP'yi
 * engellediği için sonraki her istek öldü. Kullanıcı hiçbir ekranda maç
 * göremedi, sunucu ise sağlıklıydı — sorun yalnızca adresteydi.
 *
 * "Bazen çalışıyordu"nun açıklaması da not: sunucu soğukken config isteği
 * düşüyor, istemci https'te kalıyor ve her şey çalışıyordu. Sunucu ısınınca
 * ezme devreye giriyor ve uygulama kırılıyordu.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  yerelAdresMi, ilanEdilenAdresKarari, guvenliBaseSec,
} from "../lib/apiBaseKurallari.ts";

const UZAK = "https://skorlig87.onrender.com";

describe("yerelAdresMi", () => {
  test("yerel adresler tanınıyor", () => {
    for (const u of [
      "http://localhost:4102", "https://localhost", "http://127.0.0.1:4102",
      "http://10.0.0.5:4102", "http://192.168.1.20:4102",
      "http://172.16.0.3", "http://172.31.255.1", "http://mac.local:4102",
    ]) {
      assert.equal(yerelAdresMi(u), true, `${u} yerel sayilmadi`);
    }
  });

  test("uzak adresler yerel SAYILMIYOR", () => {
    /* Negatif kontrol: her şeye "yerel" diyen bir fonksiyon yukarıdaki
     * iddiaların hepsini geçerdi ve yayın derlemesi app.json yedeğine
     * gereksiz yere düşerdi. */
    for (const u of [
      UZAK, "https://api.skorlig.com", "http://ornek.com",
      "https://172.32.0.1",   // özel aralığın DIŞINDA
      "https://11.0.0.1",     // 10.x değil
    ]) {
      assert.equal(yerelAdresMi(u), false, `${u} yanlislikla yerel sayildi`);
    }
  });

  test("boş değer YEREL sayılıyor (otomatik LAN tespiti serbest kalsın)", () => {
    /* Bilinçli karar, bkz. apiBase.ts başlığı: yapılandırma yoksa otomatik
     * tespit devreye girmeli. */
    for (const u of ["", "   ", null as any, undefined as any]) {
      assert.equal(yerelAdresMi(u), true);
    }
  });
});

describe("sunucunun ilan ettiği adres", () => {
  test("KESİNTİNİN KENDİSİ: https → http düşüşü reddediliyor", () => {
    /* Üretimde yaşanan tam senaryo. Geliştirme kipinde bile reddedilmeli:
     * düşüş hiçbir modda meşru değil. */
    for (const gelistirme of [true, false]) {
      const k = ilanEdilenAdresKarari(UZAK, "http://skorlig87.onrender.com", gelistirme);
      assert.equal(k.kabul, false,
        `https adres http ile ezildi (gelistirme=${gelistirme}) — ` +
        "Android yayin derlemesinde her istek olur");
      assert.equal(k.sebep, "https-dusurulemez");
    }
  });

  test("yayın derlemesinde http adres reddediliyor", () => {
    const k = ilanEdilenAdresKarari("http://192.168.1.5:4102", "http://baska.com", false);
    assert.equal(k.kabul, false, "yayinda cleartext http kabul edildi");
    assert.equal(k.sebep, "yayinda-https-sart");
  });

  test("GELİŞTİRMEDE http→http kabul ediliyor", () => {
    /* Negatif kontrol: kural "http asla" olsaydı yerel geliştirme tümden
     * kırılırdı ve testler yine yeşil görünürdü. */
    const k = ilanEdilenAdresKarari("http://192.168.1.5:4102", "http://192.168.1.9:4102", true);
    assert.equal(k.kabul, true, `gelistirmede yerel adres reddedildi: ${k.sebep}`);
  });

  test("https → https her modda kabul ediliyor", () => {
    for (const gelistirme of [true, false]) {
      const k = ilanEdilenAdresKarari(UZAK, "https://yeni.skorlig.com", gelistirme);
      assert.equal(k.kabul, true, `gecerli https adres reddedildi: ${k.sebep}`);
    }
  });

  test("http → https YÜKSELTMESİ kabul ediliyor", () => {
    /* Kural düşüşü engelliyor, yükseltmeyi değil. */
    const k = ilanEdilenAdresKarari("http://192.168.1.5:4102", UZAK, false);
    assert.equal(k.kabul, true, `yukseltme reddedildi: ${k.sebep}`);
  });

  test("boş aday sessizce reddediliyor (uyarı basılmamalı)", () => {
    /* `sebep: "bos"` çağıranın uyarı basmamasını sağlıyor: sunucu adres
     * ilan etmediyse bu bir hata değil. */
    for (const a of ["", "   ", null as any, undefined as any]) {
      const k = ilanEdilenAdresKarari(UZAK, a, false);
      assert.equal(k.kabul, false);
      assert.equal(k.sebep, "bos");
    }
  });
});

describe("açılış adresi seçimi", () => {
  test("geliştirmede aday olduğu gibi kullanılıyor", () => {
    const k = guvenliBaseSec("http://192.168.1.5:4102", UZAK, true);
    assert.equal(k.base, "http://192.168.1.5:4102");
    assert.equal(k.durum, "gelistirme");
  });

  test("yayında yerel adres yedeğe DÜŞÜYOR", () => {
    /* Yoksa uygulama herkeste ölü çıkar ve bu ancak mağazadan indirildikten
     * sonra fark edilir. */
    const k = guvenliBaseSec("http://192.168.1.5:4102", UZAK, false);
    assert.equal(k.base, UZAK, "yayin derlemesi yerel adreste kaldi");
    assert.equal(k.durum, "yedege-dusuldu");
  });

  test("yayında uzak adres olduğu gibi kalıyor", () => {
    const k = guvenliBaseSec(UZAK, "https://baska.com", false);
    assert.equal(k.base, UZAK, "gecerli uzak adres gereksiz yere degistirildi");
    assert.equal(k.durum, "uzak");
  });

  test("yedek de yerelse durum AYIRT EDİLİYOR (sessiz kalınmamalı)", () => {
    /**
     * Bu dal gerçek bir yayın kusuru: uygulama sunucuya ulaşamaz. Çağıran
     * bunu `console.error` ile bildiriyor — sessizce kırık bir sürüm
     * yayınlamaktan iyidir. `durum` ayrışmazsa o ayrım kaybolur.
     */
    const k = guvenliBaseSec("http://192.168.1.5:4102", "http://localhost:4102", false);
    assert.equal(k.durum, "yedek-yok");
    assert.equal(k.base, "http://192.168.1.5:4102", "carei yokken aday korunmali");
  });

  test("yedek boşsa da durum yedek-yok", () => {
    const k = guvenliBaseSec("http://10.0.0.4:4102", "", false);
    assert.equal(k.durum, "yedek-yok");
  });
});

describe("çekirdek gerçekten SAF (RN/expo bağımlılığı yok)", () => {
  test("modül Node altında yüklendi ve üç kural da dışa açık", () => {
    /**
     * ⚠️ ASIL NÖBETÇİ BU. Bu dosyanın var olma sebebi, kuralların Node
     * altında koşabilmesi. Biri buraya `react-native` ya da `expo-constants`
     * içe aktarırsa modül yüklenemez hâle gelir ve bütün bu testler
     * sessizce çalışmaz olur — o yüzden yüklenebilirliğin kendisi ölçülüyor.
     */
    for (const f of [yerelAdresMi, ilanEdilenAdresKarari, guvenliBaseSec]) {
      assert.equal(typeof f, "function");
    }
  });

  test("kararlar global __DEV__ okumuyor, parametre alıyor", () => {
    /* Global bayrağa bakan bir kural test edilemez olurdu: aynı girdiyle
     * iki farklı sonuç, ortama göre. Aynı girdinin iki mod için FARKLI
     * sonuç vermesi bunu kanıtlıyor. */
    const a = ilanEdilenAdresKarari("http://x:1", "http://y:2", true);
    const b = ilanEdilenAdresKarari("http://x:1", "http://y:2", false);
    assert.notEqual(a.kabul, b.kabul,
      "gelistirme bayragi karari degistirmiyor — parametre yok sayiliyor olabilir");
  });
});

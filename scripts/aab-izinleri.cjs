"use strict";

/**
 * MAĞAZA PAKETİNİN (.aab) GERÇEKTEN İSTEDİĞİ İZİNLER.
 *
 *   node scripts/aab-izinleri.cjs <dosya.aab>
 *
 * Çıkış kodu: 0 temiz · 1 YASAK izin var · 2 ölçüm yapılamadı (dosya
 * okunamadı ya da HİÇ izin bulunamadı — "0 izin" temiz DEĞİL, ölçüm yok).
 *
 * ⚠️ NEDEN KAYNAKTAN DEĞİL PAKETTEN (13 Eylül 2026): `android/` klasörü
 * depoya işlenmiş, yani EAS `app.json`daki izin alanlarını uygulamıyor; üstüne
 * kurulu kütüphanelerin manifestleri birleşmede kendi izinlerini ekliyor.
 * `app.json` yalnızca POST_NOTIFICATIONS diyordu, versionCode 33 paketi ise
 * kamera, mikrofon ve fotoğraf/video/ses okuma istiyordu — hiçbiri kodda
 * kullanılmıyordu. Son söz birleşmiş manifestte, o da yalnızca pakette var.
 *
 * Paketteki manifest ikili (protobuf) biçimde; izin adları içinde düz dize
 * olarak duruyor. Bağımlılık yok: ZIP merkez dizini elle okunuyor, sıkıştırılmış
 * girdi Node'un zlib'iyle açılıyor.
 */

const fs = require("fs");
const zlib = require("zlib");

/** Uygulamanın kullanmadığı ve Play'in ayrıca sorguladığı izinler. */
const YASAK = [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.READ_CONTACTS",
];

/** ZIP içinden tek bir girdiyi Buffer olarak döndürür; yoksa null. */
function zipGirdisi(zip, aranan) {
  // Merkez dizin sonu kaydı: sondan geriye, en fazla 65535 baytlık yorum payı.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP degil: merkez dizin sonu bulunamadi");

  const adet = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) throw new Error("ZIP64 desteklenmiyor");

  for (let n = 0; n < adet; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("bozuk merkez dizin kaydi");
    const yontem = zip.readUInt16LE(p + 10);
    const sikisik = zip.readUInt32LE(p + 20);
    const adUz = zip.readUInt16LE(p + 28);
    const ekUz = zip.readUInt16LE(p + 30);
    const yorumUz = zip.readUInt16LE(p + 32);
    const yerel = zip.readUInt32LE(p + 42);
    const ad = zip.toString("utf8", p + 46, p + 46 + adUz);
    p += 46 + adUz + ekUz + yorumUz;
    if (ad !== aranan) continue;

    if (zip.readUInt32LE(yerel) !== 0x04034b50) throw new Error("bozuk yerel baslik");
    const bas = yerel + 30 + zip.readUInt16LE(yerel + 26) + zip.readUInt16LE(yerel + 28);
    const veri = zip.subarray(bas, bas + sikisik);
    if (yontem === 0) return Buffer.from(veri);
    if (yontem === 8) return zlib.inflateRawSync(veri);
    throw new Error(`desteklenmeyen sikistirma yontemi: ${yontem}`);
  }
  return null;
}

/**
 * Manifest baytlarından izin adlarını çıkarır (sıralı, tekil).
 *
 * ⚠️ UZUNLUK BAYTI ADA YAPIŞIYOR — ilk sürüm bu yüzden KÖRDÜ. Protobuf her
 * dizenin önüne uzunluğunu tek bayt olarak yazar; o bayt yazdırılabilir bir
 * karaktere denk gelirse düz desen onu adın parçası sanıyor:
 * `android.permission.READ_MEDIA_VISUAL_USER_SELECTED` 50 karakter → önündeki
 * bayt 50 = "2" → "2android.permission…". Yasak listesiyle eşleşmiyor ve
 * sessizce TEMİZ sayılıyordu. versionCode 33'te 10 yasak iznin 2'si böyle
 * kaçtı (rapor 8 dedi).
 *
 * Çare protobuf'un kendi kuralı: eşleşmenin başından k karakter atıldığında
 * hemen önceki bayt kalan uzunluğa EŞİTSE ad oradan başlar. */
function izinleriCikar(manifest) {
  const metin = manifest.toString("latin1");
  const desen = /[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*\.permission\.[A-Z0-9_]+/g;
  const bulunan = new Set();
  for (const m of metin.matchAll(desen)) {
    const t = m[0];
    let ad = null;
    for (let k = 0; k < t.length; k++) {
      if (m.index + k > 0 && metin.charCodeAt(m.index + k - 1) === t.length - k) { ad = t.slice(k); break; }
    }
    // Uzunluk öneki yoksa (düz metin) ilk küçük harften başlat.
    bulunan.add(ad ?? t.replace(/^[^a-z]+/, ""));
  }
  return [...bulunan].sort();
}

/** Bir .aab dosyasını denetler. */
function aabDenetle(zipBuffer) {
  const manifest = zipGirdisi(zipBuffer, "base/manifest/AndroidManifest.xml");
  if (!manifest) return { olculdu: false, sebep: "base/manifest/AndroidManifest.xml pakette yok", izinler: [], yasakta: [] };
  const izinler = izinleriCikar(manifest);
  if (izinler.length === 0) return { olculdu: false, sebep: "manifestte hic izin okunamadi", izinler, yasakta: [] };
  return { olculdu: true, izinler, yasakta: izinler.filter((x) => YASAK.includes(x)) };
}

module.exports = { YASAK, zipGirdisi, izinleriCikar, aabDenetle };

if (require.main === module) {
  const dosya = process.argv[2];
  if (!dosya) {
    console.error("kullanim: node scripts/aab-izinleri.cjs <dosya.aab>");
    process.exit(2);
  }
  let sonuc;
  try {
    sonuc = aabDenetle(fs.readFileSync(dosya));
  } catch (e) {
    console.error("OLCULEMEDI:", e.message);
    process.exit(2);
  }
  if (!sonuc.olculdu) {
    console.error("OLCULEMEDI:", sonuc.sebep);
    process.exit(2);
  }
  console.log(`${sonuc.izinler.length} izin okundu:`);
  for (const iz of sonuc.izinler) console.log(`  ${YASAK.includes(iz) ? "YASAK " : "      "}${iz}`);
  if (sonuc.yasakta.length) {
    console.log(`\nDUSTU: ${sonuc.yasakta.length} yasak izin pakette.`);
    process.exit(1);
  }
  console.log("\nTEMIZ: yasak izin yok.");
}

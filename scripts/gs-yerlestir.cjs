/**
 * google-services.json'u Gradle'in aradigi yere koyar.
 *
 * NEDEN GEREKLI: bu proje bare workflow (android/ dizini var), bu yuzden EAS
 * Build'de Prebuild adimi ATLANIYOR — ve app config'deki `googleServicesFile`
 * degerini `android/app/google-services.json`'a kopyalayan tam olarak o adim.
 * Dosyayi EAS'a file-type ortam degiskeni olarak yuklemek tek basina yetmedi:
 * degisken build makinesinde bir gecici yola yaziliyor, Gradle ise oraya degil
 * `android/app/` altina bakiyor ve `:app:processReleaseGoogleServices` gorevinde
 * 11 dakikalik derlemenin SONUNDA dusuyordu (iki kez, ~1 saat kuyrukla birlikte).
 *
 * Bu script `eas-build-post-install` olarak kosar: bagimliliklar kurulmus,
 * Gradle henuz baslamamistir.
 *
 * ⚠️ EKSIKTE BILEREK HIZLI DUSER. Sessizce gecmek, hatayi yine 11 dakika
 * sonraya erteler; burada dusmek saniyeler icinde haber verir.
 */
const fs = require("fs");
const path = require("path");

const hedef = path.join(__dirname, "..", "android", "app", "google-services.json");

if (fs.existsSync(hedef)) {
  console.log("[gs-yerlestir] zaten yerinde, dokunulmadi: " + hedef);
  process.exit(0);
}

const kaynak = process.env.GOOGLE_SERVICES_JSON;

if (!kaynak) {
  console.error(
    "[gs-yerlestir] GOOGLE_SERVICES_JSON tanimsiz ve android/app/google-services.json yok.\n" +
    "  EAS'ta dosya tipi ortam degiskenini olusturun:\n" +
    "  eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file \\\n" +
    "    --value ./google-services.json --visibility secret --environment preview"
  );
  process.exit(1);
}

if (!fs.existsSync(kaynak)) {
  console.error("[gs-yerlestir] GOOGLE_SERVICES_JSON yolu okunamadi: " + kaynak);
  process.exit(1);
}

fs.mkdirSync(path.dirname(hedef), { recursive: true });
fs.copyFileSync(kaynak, hedef);

/* Dogru dosya mi — paket adi eslesmezse Gradle gecer ama Firebase calismaz. */
try {
  const d = JSON.parse(fs.readFileSync(hedef, "utf8"));
  const paketler = (d.client || []).map((c) => c.client_info.android_client_info.package_name);
  console.log("[gs-yerlestir] kopyalandi -> " + hedef);
  console.log("[gs-yerlestir] proje: " + d.project_info.project_id + " | paketler: " + paketler.join(", "));
} catch (e) {
  console.error("[gs-yerlestir] kopyalanan dosya gecerli JSON degil: " + String(e && e.message));
  process.exit(1);
}

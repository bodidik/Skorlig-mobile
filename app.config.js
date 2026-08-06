/**
 * app.json'u okur, yalnızca google-services.json yolunu ortama gore degistirir.
 *
 * NEDEN: `google-services.json` .gitignore'da. EAS Build proje dosyalarini git
 * arsivinden yukluyor, dolayisiyla dosya sunucuya HIC gitmiyordu ve Gradle
 * `:app:processReleaseGoogleServices` adiminda 12 dakikalik derlemenin sonunda
 * "File google-services.json is missing" ile duşuyordu.
 *
 * COZUM: dosya EAS'ta file-type ortam degiskeni olarak tutulur; build sirasinda
 * gecici bir yola yazilir ve yolu GOOGLE_SERVICES_JSON'da gelir. Yerelde
 * degisken tanimli olmadigindan app.json'daki yol gecerli kalir.
 */
module.exports = ({ config }) => {
  const yol = process.env.GOOGLE_SERVICES_JSON;
  if (yol) config.android = { ...config.android, googleServicesFile: yol };
  return config;
};

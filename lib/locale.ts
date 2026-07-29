/**
 * ISO 3166-1 alpha-2 region kodu → API'nin KANONİK ülke adı.
 *
 * ⚠️ Buradaki değerler sunucunun canonicalCountry() fonksiyonunun kabul ettiği
 * adlarla birebir aynı olmalıdır (kaynak: GET /api/live2/countries).
 * Türkçe ad göndermek "Türkiye" dışında COUNTRY_NOT_SUPPORTED ile reddedilir —
 * eski sürümdeki sessiz hata buydu.
 *
 * Listede olmayan bölge null döner: kullanıcı onboarding'de elle seçer.
 */
const REGION_TO_COUNTRY: Record<string, string> = {
  TR: "Türkiye",
  GB: "England",
  ES: "Spain",
  DE: "Germany",
  IT: "Italy",
  FR: "France",
  NL: "Netherlands",
  BE: "Belgium",
  GR: "Greece",
  PT: "Portugal",
  BR: "Brazil",
  AR: "Argentina",
  JP: "Japan",
  RU: "Russia",
  UA: "Ukraine",
  US: "USA",
  SA: "Saudi Arabia",
  AT: "Austria",
  CH: "Switzerland",
  PL: "Poland",
  MX: "Mexico",
  HR: "Croatia",
  RS: "Serbia",
  CZ: "Czech Republic",
  RO: "Romania",
  HU: "Hungary",
  SK: "Slovakia",
  BG: "Bulgaria",
};

export function getDeviceCountry(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    // "tr-TR" → "TR", "es-BO" → "BO", "en-GB" → "GB"
    const parts = locale.split(/[-_]/);
    const region = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : parts[0].toUpperCase();
    return REGION_TO_COUNTRY[region] ?? null;
  } catch {
    return null;
  }
}

export function getDeviceRegionCode(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const parts = locale.split(/[-_]/);
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : null;
  } catch {
    return null;
  }
}

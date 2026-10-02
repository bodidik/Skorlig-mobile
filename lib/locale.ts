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
  /* 2026-10-02 (Çin ölçümü): sunucunun 125 kanonik adının tamamı — ad
   * GET /api/live2/countries ile ISO kodu api/lib/countries.cjs ULKELER'den
   * ÜRETİLDİ, elle yazılmadı. FO/XK tabloda ISO'suz, elle eklendi. İskoçya,
   * Galler, K. İrlanda telefonda GB görünür → yukarıdaki England. */
  AD: "Andorra",
  AE: "UAE",
  AL: "Albania",
  AM: "Armenia",
  AO: "Angola",
  AU: "Australia",
  AZ: "Azerbaijan",
  BA: "Bosnia and Herzegovina",
  BD: "Bangladesh",
  BF: "Burkina Faso",
  BH: "Bahrain",
  BI: "Burundi",
  BO: "Bolivia",
  BW: "Botswana",
  BY: "Belarus",
  CA: "Canada",
  CI: "Ivory Coast",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  CR: "Costa Rica",
  CY: "Cyprus",
  DK: "Denmark",
  DO: "Dominican Republic",
  DZ: "Algeria",
  EC: "Ecuador",
  EE: "Estonia",
  EG: "Egypt",
  FI: "Finland",
  FO: "Faroe Islands",
  GE: "Georgia",
  GH: "Ghana",
  GI: "Gibraltar",
  GT: "Guatemala",
  HK: "Hong Kong",
  HN: "Honduras",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  IQ: "Iraq",
  IR: "Iran",
  IS: "Iceland",
  JM: "Jamaica",
  JO: "Jordan",
  KE: "Kenya",
  KG: "Kyrgyzstan",
  KH: "Cambodia",
  KR: "South Korea",
  KW: "Kuwait",
  KZ: "Kazakhstan",
  LB: "Lebanon",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  MA: "Morocco",
  MD: "Moldova",
  ME: "Montenegro",
  MK: "North Macedonia",
  MM: "Myanmar",
  MN: "Mongolia",
  MO: "Macau",
  MT: "Malta",
  MW: "Malawi",
  MY: "Malaysia",
  MZ: "Mozambique",
  NG: "Nigeria",
  NI: "Nicaragua",
  NO: "Norway",
  NZ: "New Zealand",
  OM: "Oman",
  PA: "Panama",
  PE: "Peru",
  PH: "Philippines",
  PY: "Paraguay",
  QA: "Qatar",
  RW: "Rwanda",
  SE: "Sweden",
  SG: "Singapore",
  SI: "Slovenia",
  SM: "San Marino",
  SV: "El Salvador",
  TH: "Thailand",
  TN: "Tunisia",
  TW: "Taiwan",
  TZ: "Tanzania",
  UG: "Uganda",
  UY: "Uruguay",
  UZ: "Uzbekistan",
  VE: "Venezuela",
  VN: "Vietnam",
  XK: "Kosovo",
  ZA: "South Africa",
  ZW: "Zimbabwe",
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

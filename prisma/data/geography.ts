/**
 * Timor-Leste administrative reference data — Municípios and Postos
 * Administrativos (14 municipalities, incl. RAEOA and Ataúro, which became a
 * municipality in 2022).
 *
 * Codes follow ISO 3166-2:TL (TL-XX); Ataúro uses "AT".
 * Coordinates are approximate centroids of each capital, for the public map.
 *
 * ⚠ Compiled from public sources. Before production, cross-check the posto
 *   list against the current Ministério da Administração Estatal (MAE)
 *   gazette — posts are occasionally split (e.g. proposals for Hatulia B).
 *   Sucos and Aldeias (~450 / ~2,200) are loaded from CSV, see seed.ts.
 */

export interface MunicipalitySeed {
  code: string;
  name: string;
  officialName: string;
  capital: string;
  isSpecialRegion?: boolean;
  lat: number;
  lng: number;
  adminPosts: string[];
}

export const MUNICIPALITIES: MunicipalitySeed[] = [
  {
    code: "DI",
    name: "Dili",
    officialName: "Município de Díli",
    capital: "Díli",
    lat: -8.556856,
    lng: 125.560314,
    adminPosts: ["Cristo Rei", "Dom Aleixo", "Metinaro", "Nain Feto", "Vera Cruz"],
  },
  {
    code: "BA",
    name: "Baucau",
    officialName: "Município de Baucau",
    capital: "Baucau",
    lat: -8.466667,
    lng: 126.45,
    adminPosts: ["Baguia", "Baucau", "Laga", "Quelicai", "Vemasse", "Venilale"],
  },
  {
    code: "ER",
    name: "Ermera",
    officialName: "Município de Ermera",
    capital: "Gleno",
    lat: -8.723889,
    lng: 125.436944,
    adminPosts: ["Atsabe", "Ermera", "Hatulia", "Letefoho", "Railaco"],
  },
  {
    code: "BO",
    name: "Bobonaro",
    officialName: "Município de Bobonaro",
    capital: "Maliana",
    lat: -8.991667,
    lng: 125.219722,
    adminPosts: ["Atabae", "Balibó", "Bobonaro", "Cailaco", "Lolotoe", "Maliana"],
  },
  {
    code: "VI",
    name: "Viqueque",
    officialName: "Município de Viqueque",
    capital: "Viqueque",
    lat: -8.8575,
    lng: 126.364167,
    adminPosts: ["Lacluta", "Ossu", "Uatucarbau", "Uatolari", "Viqueque"],
  },
  {
    code: "LA",
    name: "Lautém",
    officialName: "Município de Lautém",
    capital: "Lospalos",
    lat: -8.518056,
    lng: 127.0025,
    adminPosts: ["Iliomar", "Lautém", "Lospalos", "Luro", "Tutuala"],
  },
  {
    code: "CO",
    name: "Covalima",
    officialName: "Município de Covalima",
    capital: "Suai",
    lat: -9.3129,
    lng: 125.2565,
    adminPosts: ["Fatululic", "Fatumean", "Fohorem", "Maucatar", "Suai", "Tilomar", "Zumalai"],
  },
  {
    code: "AN",
    name: "Ainaro",
    officialName: "Município de Ainaro",
    capital: "Ainaro",
    lat: -8.991667,
    lng: 125.508333,
    adminPosts: ["Ainaro", "Hatu-Builico", "Hato-Udo", "Maubisse"],
  },
  {
    code: "MF",
    name: "Manufahi",
    officialName: "Município de Manufahi",
    capital: "Same",
    lat: -9.0,
    lng: 125.65,
    adminPosts: ["Alas", "Fatuberliu", "Same", "Turiscai"],
  },
  {
    code: "LI",
    name: "Liquiçá",
    officialName: "Município de Liquiçá",
    capital: "Liquiçá",
    lat: -8.5875,
    lng: 125.341944,
    adminPosts: ["Bazartete", "Liquiçá", "Maubara"],
  },
  {
    code: "MT",
    name: "Manatuto",
    officialName: "Município de Manatuto",
    capital: "Manatuto",
    lat: -8.511944,
    lng: 126.013611,
    adminPosts: ["Barique", "Laclo", "Laclubar", "Laleia", "Manatuto", "Soibada"],
  },
  {
    code: "AL",
    name: "Aileu",
    officialName: "Município de Aileu",
    capital: "Aileu",
    lat: -8.728056,
    lng: 125.566389,
    adminPosts: ["Aileu Vila", "Laulara", "Lequidoe", "Remexio"],
  },
  {
    code: "OE",
    name: "Oé-Cusse Ambeno",
    officialName: "Região Administrativa Especial de Oé-Cusse Ambeno (RAEOA)",
    capital: "Pante Macassar",
    isSpecialRegion: true,
    lat: -9.2,
    lng: 124.383333,
    adminPosts: ["Nitibe", "Oesilo", "Pante Macassar", "Passabe"],
  },
  {
    code: "AT",
    name: "Ataúro",
    officialName: "Município de Ataúro",
    capital: "Vila Maumeta",
    lat: -8.2167,
    lng: 125.5833,
    adminPosts: ["Beloi", "Biqueli", "Macadade", "Maquili", "Vila Maumeta"],
  },
];

// Single slug implementation shared with the app (import file, CMS slugs).
export { slugify } from "../../src/lib/utils/slug";

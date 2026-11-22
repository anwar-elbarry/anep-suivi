/**
 * Nombres et montants en lettres, orthographe traditionnelle
 * (traits d'union sous cent, « et » pour 21…71, accord de « vingt » et « cent »).
 */

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 à 99. `final` : le nombre termine l'expression (accord de « quatre-vingts »). */
function moinsDeCent(n: number, final: boolean): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    const base = d === 7 ? "soixante" : "quatre-vingt";
    const reste = 10 + u;
    if (d === 7 && u === 1) return "soixante et onze";
    return `${base}-${UNITES[reste]}`;
  }
  if (d === 8) return u === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${UNITES[u]}`;
  if (u === 0) return DIZAINES[d];
  if (u === 1) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/** 0 à 999. */
function moinsDeMille(n: number, final: boolean): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c === 0) return moinsDeCent(r, final);
  const cent = c === 1 ? "cent" : `${UNITES[c]} cent${r === 0 && final ? "s" : ""}`;
  return r === 0 ? cent : `${cent} ${moinsDeCent(r, final)}`;
}

/** Entier positif ou nul en lettres (jusqu'à 999 999 999 999). */
export function entierEnLettres(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zéro";
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1e3);
  const reste = n % 1e3;
  const morceaux: string[] = [];
  // « millions » et « milliards » sont des noms : « deux cents millions », « quatre-vingts milliards ».
  if (milliards) morceaux.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) morceaux.push(`${moinsDeMille(millions, true)} million${millions > 1 ? "s" : ""}`);
  // « mille » est invariable et ne fait pas accorder « cent » ni « vingt » : « deux cent mille ».
  if (milliers) morceaux.push(milliers === 1 ? "mille" : `${moinsDeMille(milliers, false)} mille`);
  if (reste) morceaux.push(moinsDeMille(reste, true));
  return morceaux.join(" ");
}

/** Montant en lettres : « … dirhams et … centimes » (unités paramétrables). */
export function montantEnLettres(
  montant: number,
  unite: { singulier: string; pluriel: string; centimes: string } = { singulier: "dirham", pluriel: "dirhams", centimes: "centimes" },
): string {
  const negatif = montant < 0;
  const centimesTotal = Math.round(Math.abs(montant) * 100);
  const entier = Math.floor(centimesTotal / 100);
  const cts = centimesTotal % 100;
  // « un million de dirhams », « deux millions de dirhams »
  const lettres = entierEnLettres(entier);
  const de = /(million|milliard)s?$/.test(lettres) ? " de" : "";
  let txt = `${lettres}${de} ${entier > 1 ? unite.pluriel : unite.singulier}`;
  if (cts) txt += ` et ${entierEnLettres(cts)} ${cts > 1 ? unite.centimes : unite.centimes.replace(/s$/, "")}`;
  return (negatif ? "moins " : "") + txt;
}

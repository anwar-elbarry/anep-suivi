"use client";
import * as XLSX from "xlsx";
import { normaliser } from "./calculs";

export interface LigneImportee {
  numero: string;
  designation: string;
  unite: string;
  quantite: number;
  prix_unitaire: number | null;
  montant: number | null;
}

const ENTETES: Record<keyof LigneImportee, string[]> = {
  numero: ["n", "no", "n prix", "num", "numero", "n du prix", "prix n", "article", "art", "code", "item", "n art"],
  designation: ["designation", "designation des ouvrages", "libelle", "description", "nature des prestations", "prestations", "ouvrages", "intitule"],
  unite: ["u", "unite", "unites", "u m"],
  quantite: ["quantite", "quantites", "qte", "qt", "quantite executee", "quantite cumulee", "qte executee", "qte cumulee", "quantite du mois"],
  prix_unitaire: ["prix unitaire", "pu", "p u", "prix unitaire ht", "pu ht", "prix u", "prix unitaire en chiffres", "prix"],
  montant: ["montant", "montant ht", "prix total", "total", "montant total", "pt", "montant total ht"],
};

function correspond(cellule: string, cle: keyof LigneImportee) {
  const c = normaliser(cellule);
  if (!c) return false;
  return ENTETES[cle].some((e) => c === e || (e.length > 3 && c.startsWith(e)));
}

/** Convertit "1 234,50" ou 1234.5 en nombre. */
export function versNombre(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/\s| | /g, "").replace(/(dh|mad|€|eur)$/i, "");
  if (!s) return null;
  const n = Number(s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export interface ResultatImport {
  lignes: LigneImportee[];
  /** Feuille du classeur lue ; vide si le bordereau a été lu par Claude (PDF, scan, photo). */
  feuille: string;
  colonnes: Partial<Record<keyof LigneImportee, string>>;
  avertissements: string[];
}

/**
 * Lit un fichier Excel (BPDE ou attachement) : repère la ligne d'en-tête sur les 30 premières lignes,
 * puis extrait n°, désignation, unité, quantité, prix unitaire et montant.
 */
export async function lireExcel(fichier: File): Promise<ResultatImport> {
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: "array" });
  let meilleur: ResultatImport | null = null;

  for (const nomFeuille of wb.SheetNames) {
    const ws = wb.Sheets[nomFeuille];
    const grille = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    for (let r = 0; r < Math.min(30, grille.length); r++) {
      const ligne = (grille[r] ?? []).map((c) => (c === null ? "" : String(c)));
      const index: Partial<Record<keyof LigneImportee, number>> = {};
      (Object.keys(ENTETES) as (keyof LigneImportee)[]).forEach((cle) => {
        const i = ligne.findIndex((c, j) => correspond(c, cle) && !Object.values(index).includes(j));
        if (i >= 0) index[cle] = i;
      });
      if (index.designation === undefined || index.quantite === undefined) continue;

      const lignes: LigneImportee[] = [];
      for (const brute of grille.slice(r + 1)) {
        const cel = (i?: number) => (i === undefined ? null : (brute as unknown[])[i]);
        const designation = String(cel(index.designation) ?? "").trim();
        const quantite = versNombre(cel(index.quantite));
        if (!designation) continue;
        if (/^(total|sous[- ]total|montant total|tva|total ttc|total ht|report)/i.test(normaliser(designation))) continue;
        if (quantite === null && versNombre(cel(index.prix_unitaire)) === null) continue; // titre de chapitre
        lignes.push({
          numero: String(cel(index.numero) ?? "").trim(),
          designation,
          unite: String(cel(index.unite) ?? "").trim(),
          quantite: quantite ?? 0,
          prix_unitaire: versNombre(cel(index.prix_unitaire)),
          montant: versNombre(cel(index.montant)),
        });
      }
      const colonnes: ResultatImport["colonnes"] = {};
      (Object.keys(index) as (keyof LigneImportee)[]).forEach((k) => (colonnes[k] = ligne[index[k]!]));
      const res: ResultatImport = { lignes, feuille: nomFeuille, colonnes, avertissements: [] };
      if (!meilleur || res.lignes.length > meilleur.lignes.length) meilleur = res;
      break;
    }
  }
  if (!meilleur) {
    throw new Error("En-têtes introuvables : le fichier doit contenir au moins les colonnes « Désignation » et « Quantité ».");
  }
  if (meilleur.colonnes.numero === undefined) meilleur.avertissements.push("Pas de colonne « N° » : rapprochement par désignation uniquement.");
  if (meilleur.colonnes.unite === undefined) meilleur.avertissements.push("Pas de colonne « Unité ».");
  return meilleur;
}

/** Contenu brut d'un classeur, feuille par feuille, pour une lecture par Claude quand les en-têtes ne sont pas reconnus. */
export async function excelEnTexte(fichier: File, limite = 600_000): Promise<string> {
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: "array" });
  const texte = wb.SheetNames.map((nom) => `### Feuille « ${nom} »\n${XLSX.utils.sheet_to_csv(wb.Sheets[nom], { FS: ";", blankrows: false })}`)
    .join("\n\n")
    .replace(/;{3,}/g, ";;"); // colonnes vides en série : sans intérêt pour la lecture
  if (texte.length > limite) throw new Error("Classeur trop volumineux pour une lecture par Claude : ne gardez que la feuille du bordereau.");
  return texte;
}

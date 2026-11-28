"use client";
import { BUCKET } from "../donnees";
import { avecTypeMime, messageBase, messageStockage, verifierTaille } from "../fichiers";
import { supabaseNavigateur } from "../supabase/client";
import { analyserModele, formatDuFichier, type Analyse, type FormatModele } from "./moteur";

export const CATEGORIES_MODELE = [
  "Décompte",
  "Bordereau d'envoi",
  "Décision / pénalités",
  "Marché",
  "Ordre de service",
  "PV",
  "Bordereau",
  "Courrier",
  "Tableau Excel",
  "Autre",
] as const;

export interface Modele {
  id: string;
  nom: string;
  categorie: string;
  description: string;
  format: FormatModele;
  chemin: string;
  nom_fichier: string;
  champs: Pick<Analyse, "connus" | "libres" | "avertissements">;
  created_at: string;
  updated_at: string;
}

export const EXEMPLES = [
  { fichier: "decompte.docx", nom: "Décompte (exemple)", categorie: "Décompte", description: "Détail des prix exécutés, récapitulatif et montant en lettres." },
  { fichier: "bordereau-envoi.docx", nom: "Bordereau d'envoi (exemple)", categorie: "Bordereau d'envoi", description: "Destinataire, objet et pièces saisis à la génération." },
  {
    fichier: "note-calcul-penalites.docx",
    nom: "Note de calcul des pénalités (exemple)",
    categorie: "Décision / pénalités",
    description: "Projet de note : délais, retard, exonérations, montant et plafond.",
  },
  { fichier: "situation-marche.xlsx", nom: "Situation du marché (exemple Excel)", categorie: "Tableau Excel", description: "Indicateurs clés dans un classeur." },
];

function verifier<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(messageBase(res.error));
  return res.data as T;
}

export async function listerModeles(): Promise<Modele[]> {
  return verifier(await supabaseNavigateur().from("modeles").select("*").order("categorie").order("nom")) as Modele[];
}

export async function chargerFichierModele(chemin: string): Promise<ArrayBuffer> {
  const { data, error } = await supabaseNavigateur().storage.from(BUCKET).download(chemin);
  if (error || !data) throw new Error(error?.message ?? "Modèle introuvable dans le stockage");
  return data.arrayBuffer();
}

export async function lireFichier(fichier: File): Promise<{ buffer: ArrayBuffer; format: FormatModele; analyse: Analyse }> {
  const format = formatDuFichier(fichier.name);
  if (!format) throw new Error(`« ${fichier.name} » : seuls les fichiers Word (.docx) et Excel (.xlsx) sont acceptés. Enregistrez les .doc / .xls au nouveau format.`);
  verifierTaille(fichier);
  const buffer = await fichier.arrayBuffer();
  return { buffer, format, analyse: analyserModele(buffer, format) };
}

const nettoyer = (nom: string) =>
  nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);

export async function enregistrerModele(
  fichier: File | Blob,
  nomFichier: string,
  infos: { nom: string; categorie: string; description: string },
  analyse: Analyse,
): Promise<Modele> {
  const sb = supabaseNavigateur();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Session expirée, reconnectez-vous");
  const chemin = `${data.user.id}/modeles/${crypto.randomUUID()}-${nettoyer(nomFichier)}`;
  // Le stockage se fie au type porté par le fichier : on le fixe d'après l'extension (souvent vide côté navigateur).
  const { error } = await sb.storage.from(BUCKET).upload(chemin, avecTypeMime(fichier, nomFichier));
  if (error) throw new Error(messageStockage(error.message));
  const res = await sb
    .from("modeles")
    .insert({
      ...infos,
      format: analyse.format,
      chemin,
      nom_fichier: nomFichier,
      champs: { connus: analyse.connus, libres: analyse.libres, avertissements: analyse.avertissements },
    })
    .select()
    .single();
  if (res.error) {
    await sb.storage.from(BUCKET).remove([chemin]);
    throw new Error(messageBase(res.error));
  }
  return res.data as Modele;
}

export async function modifierModele(id: string, valeurs: Partial<Pick<Modele, "nom" | "categorie" | "description">>) {
  verifier(await supabaseNavigateur().from("modeles").update(valeurs).eq("id", id).select());
}

export async function supprimerModele(m: Modele) {
  const sb = supabaseNavigateur();
  const res = await sb.from("modeles").delete().eq("id", m.id);
  if (res.error) throw new Error(messageBase(res.error));
  await sb.storage.from(BUCKET).remove([m.chemin]);
}

/** Ajoute à la bibliothèque les modèles d'exemple fournis avec l'application. */
export async function importerExemples(existants: Modele[]): Promise<number> {
  let n = 0;
  for (const ex of EXEMPLES) {
    if (existants.some((m) => m.nom === ex.nom)) continue;
    const reponse = await fetch(`/modeles-exemples/${ex.fichier}`);
    if (!reponse.ok) throw new Error(`Exemple indisponible : ${ex.fichier}`);
    const blob = await reponse.blob();
    const format = formatDuFichier(ex.fichier)!;
    const analyse = analyserModele(await blob.arrayBuffer(), format);
    await enregistrerModele(blob, ex.fichier, { nom: ex.nom, categorie: ex.categorie, description: ex.description }, analyse);
    n++;
  }
  return n;
}

/** Valeurs saisies pour les champs libres, mémorisées par modèle dans ce navigateur. */
export function lireValeursLibres(cle: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(`modele-libres:${cle}`) ?? "{}");
  } catch {
    return {};
  }
}
export function memoriserValeursLibres(cle: string, valeurs: Record<string, string>) {
  try {
    localStorage.setItem(`modele-libres:${cle}`, JSON.stringify(valeurs));
  } catch {
    // stockage indisponible : sans conséquence
  }
}

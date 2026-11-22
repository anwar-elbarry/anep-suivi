"use client";
import { supabaseNavigateur } from "./supabase/client";
import type {
  Activite,
  Attachement,
  BpdeLigne,
  Decompte,
  DocumentAFournir,
  DossierMarche,
  Garantie,
  Intervenant,
  Marche,
  OrdreService,
  PvReunion,
} from "./types";

export const BUCKET = "scans";

function verifier<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function chargerDossier(id: string): Promise<DossierMarche | null> {
  const sb = supabaseNavigateur();
  const [m, i, o, p, b, a, d, dc, g, act] = await Promise.all([
    sb.from("marches").select("*").eq("id", id).maybeSingle(),
    sb.from("intervenants").select("*").eq("marche_id", id).order("created_at"),
    sb.from("ordres_service").select("*").eq("marche_id", id).order("date_emission", { nullsFirst: false }),
    sb.from("pv_reunions").select("*").eq("marche_id", id).order("date", { ascending: false, nullsFirst: false }),
    sb.from("bpde_lignes").select("*").eq("marche_id", id).order("ordre"),
    sb
      .from("attachements")
      .select("*, attachement_lignes(*)")
      .eq("marche_id", id)
      .order("date", { nullsFirst: false })
      .order("ordre", { referencedTable: "attachement_lignes" }),
    sb.from("documents").select("*").eq("marche_id", id).order("echeance", { nullsFirst: false }),
    sb.from("decomptes").select("*").eq("marche_id", id).order("date", { nullsFirst: false }).order("created_at"),
    sb.from("garanties").select("*").eq("marche_id", id).order("date_expiration", { nullsFirst: false }),
    sb.from("activites").select("*").eq("marche_id", id).order("created_at", { ascending: false }).limit(15),
  ]);
  const marche = verifier(m) as Marche | null;
  if (!marche) return null;
  return {
    marche,
    intervenants: verifier(i) as Intervenant[],
    ordres: verifier(o) as OrdreService[],
    pvs: verifier(p) as PvReunion[],
    bpde: verifier(b) as BpdeLigne[],
    attachements: verifier(a) as Attachement[],
    documents: verifier(d) as DocumentAFournir[],
    decomptes: verifier(dc) as Decompte[],
    garanties: verifier(g) as Garantie[],
    activites: verifier(act) as Activite[],
  };
}

/** Données de tous les marchés pour la page d'accueil. */
export async function chargerPortefeuille() {
  const sb = supabaseNavigateur();
  const [m, o, b, a, d, doc, g] = await Promise.all([
    sb.from("marches").select("*").order("created_at", { ascending: false }),
    sb.from("ordres_service").select("*"),
    sb.from("bpde_lignes").select("*"),
    sb.from("attachements").select("*, attachement_lignes(*)"),
    sb.from("decomptes").select("*"),
    sb.from("documents").select("*"),
    sb.from("garanties").select("*"),
  ]);
  return {
    marches: verifier(m) as Marche[],
    ordres: verifier(o) as OrdreService[],
    bpde: verifier(b) as BpdeLigne[],
    attachements: verifier(a) as Attachement[],
    decomptes: verifier(d) as Decompte[],
    documents: verifier(doc) as DocumentAFournir[],
    garanties: verifier(g) as Garantie[],
  };
}

type Table =
  | "marches"
  | "intervenants"
  | "ordres_service"
  | "pv_reunions"
  | "bpde_lignes"
  | "attachements"
  | "attachement_lignes"
  | "documents"
  | "decomptes"
  | "garanties";

export async function inserer<T extends object>(table: Table, valeurs: T | T[]) {
  const res = await supabaseNavigateur().from(table).insert(valeurs).select();
  return verifier(res);
}

export async function modifier(table: Table, id: string, valeurs: object) {
  const res = await supabaseNavigateur().from(table).update(valeurs).eq("id", id).select();
  return verifier(res);
}

export async function supprimer(table: Table, id: string) {
  const res = await supabaseNavigateur().from(table).delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

export async function supprimerParMarche(table: Table, marcheId: string) {
  const res = await supabaseNavigateur().from(table).delete().eq("marche_id", marcheId);
  if (res.error) throw new Error(res.error.message);
}

// ---------------------------------------------------------------------------
// Fichiers (scans, CPS)
// ---------------------------------------------------------------------------

function nettoyerNom(nom: string) {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);
}

export const TAILLE_MAX = 20 * 1024 * 1024;

export async function televerser(marcheId: string, dossier: "scans" | "cps", fichier: File): Promise<string> {
  if (fichier.size > TAILLE_MAX) throw new Error("Fichier trop volumineux (20 Mo maximum)");
  const sb = supabaseNavigateur();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Session expirée, reconnectez-vous");
  const chemin = `${data.user.id}/${marcheId}/${dossier}/${crypto.randomUUID()}-${nettoyerNom(fichier.name)}`;
  const { error } = await sb.storage.from(BUCKET).upload(chemin, fichier, { contentType: fichier.type || undefined });
  if (error) throw new Error(error.message);
  return chemin;
}

export async function ouvrirFichier(chemin: string) {
  const { data, error } = await supabaseNavigateur().storage.from(BUCKET).createSignedUrl(chemin, 300);
  if (error || !data) throw new Error(error?.message ?? "Lien indisponible");
  window.open(data.signedUrl, "_blank", "noopener");
}

export async function supprimerFichier(chemin: string | null | undefined) {
  if (!chemin) return;
  await supabaseNavigateur().storage.from(BUCKET).remove([chemin]);
}

export function normaliserPourDoublon(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Appelle une route Claude et renvoie les documents proposés. */
export async function appelerIA(route: "documents-cps" | "documents-attachement", corps: object) {
  const res = await fetch(`/api/ia/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.erreur ?? `Erreur ${res.status}`);
  return json.documents as import("./types").PropositionDocument[];
}

export const supabaseClient = supabaseNavigateur;

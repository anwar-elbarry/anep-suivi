"use client";
import { avecTypeMime, messageBase, messageStockage, TAILLE_MAX, verifierTaille } from "./fichiers";
import { supabaseNavigateur } from "./supabase/client";
import type {
  Activite,
  Attachement,
  BpdeLigne,
  Decompte,
  DocumentAFournir,
  Avenant,
  DossierMarche,
  Garantie,
  Reserve,
  Intervenant,
  Marche,
  OrdreService,
  PvReunion,
} from "./types";

export const BUCKET = "scans";

function verifier<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(messageBase(res.error));
  return res.data as T;
}

export async function chargerDossier(id: string): Promise<DossierMarche | null> {
  const sb = supabaseNavigateur();
  const [m, i, o, p, b, a, d, dc, g, av, res, act] = await Promise.all([
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
    sb.from("avenants").select("*").eq("marche_id", id).order("date", { nullsFirst: false }).order("created_at"),
    sb.from("reserves").select("*").eq("marche_id", id).order("created_at"),
    sb.from("activites").select("*").eq("marche_id", id).order("created_at", { ascending: false }).limit(15),
  ]);
  const marche = verifier(m) as Marche | null;
  if (!marche) return null;
  const avenants = verifier(av) as Avenant[];
  return {
    marche: avecAvenants(marche, avenants),
    avenants,
    reserves: verifier(res) as Reserve[],
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
/** Ajoute au marché les variations de montant et de délai issues des avenants (champs calculés, non stockés). */
export function avecAvenants(marche: Marche, avenants: Avenant[]): Marche {
  const siens = avenants.filter((a) => a.marche_id === marche.id);
  return {
    ...marche,
    montant_avenants: siens.reduce((s, a) => s + (Number(a.montant_ttc) || 0), 0),
    jours_avenants: siens.reduce((s, a) => s + (Number(a.jours_supplementaires) || 0), 0),
  };
}

export async function chargerPortefeuille() {
  const sb = supabaseNavigateur();
  const [m, o, b, a, d, doc, g, av, res] = await Promise.all([
    sb.from("marches").select("*").order("created_at", { ascending: false }),
    sb.from("ordres_service").select("*"),
    sb.from("bpde_lignes").select("*"),
    sb.from("attachements").select("*, attachement_lignes(*)"),
    sb.from("decomptes").select("*"),
    sb.from("documents").select("*"),
    sb.from("garanties").select("*"),
    sb.from("avenants").select("*"),
    sb.from("reserves").select("*"),
  ]);
  const avenants = verifier(av) as Avenant[];
  return {
    marches: (verifier(m) as Marche[]).map((x) => avecAvenants(x, avenants)),
    reserves: verifier(res) as Reserve[],
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
  | "garanties"
  | "avenants"
  | "reserves";

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
  if (res.error) throw new Error(messageBase(res.error));
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

export { TAILLE_MAX };

export async function televerser(marcheId: string, dossier: "scans" | "cps" | "bpde", fichier: File): Promise<string> {
  verifierTaille(fichier);
  const sb = supabaseNavigateur();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Session expirée, reconnectez-vous");
  const chemin = `${data.user.id}/${marcheId}/${dossier}/${crypto.randomUUID()}-${nettoyerNom(fichier.name)}`;
  // Le stockage se fie au type porté par le fichier : on le fixe d'après l'extension (souvent vide côté navigateur).
  const { error } = await sb.storage.from(BUCKET).upload(chemin, avecTypeMime(fichier, fichier.name));
  if (error) throw new Error(messageStockage(error.message));
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

let etatIA: Promise<boolean> | null = null;

/** Indique si les fonctions Claude sont activées sur le serveur (clé API renseignée). */
export function iaActivee(): Promise<boolean> {
  etatIA ??= fetch("/api/ia/etat")
    .then((r) => (r.ok ? r.json() : { configuree: true })) // session expirée, etc. : l'appel suivant donnera l'erreur exacte
    .then((j) => Boolean(j.configuree))
    .catch(() => {
      etatIA = null;
      return true; // état inconnu : l'appel lui-même donnera l'erreur exacte
    });
  return etatIA;
}

export const MESSAGE_IA_INACTIVE =
  "Fonctions Claude non activées : la variable ANTHROPIC_API_KEY n'est pas renseignée sur le serveur (hébergeur > variables d'environnement, puis redéploiement).";

/** À appeler avant d'envoyer un fichier pour analyse : évite un dépôt inutile si Claude n'est pas activé. */
export async function exigerIA() {
  if (!(await iaActivee())) throw new Error(MESSAGE_IA_INACTIVE);
}

/** Appelle une route Claude et renvoie sa réponse JSON. */
export async function appelerRouteIA<T>(route: string, corps: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/ia/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new Error("Connexion interrompue pendant l'analyse : vérifiez le réseau et réessayez.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    if (json?.erreur) throw new Error(json.erreur);
    if (res.status === 504 || res.status === 408) throw new Error("Analyse trop longue pour le serveur (délai dépassé) : réessayez avec un document plus court ou découpé.");
    if (res.status === 413) throw new Error("Contenu trop volumineux pour le serveur.");
    throw new Error(`Erreur ${res.status}`);
  }
  return json as T;
}

/** Appelle une route Claude et renvoie les documents proposés. */
export async function appelerIA(route: "documents-cps" | "documents-attachement", corps: object) {
  const json = await appelerRouteIA<{ documents: import("./types").PropositionDocument[] }>(route, corps);
  return json.documents;
}

export const supabaseClient = supabaseNavigateur;

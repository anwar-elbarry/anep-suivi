"use client";
import { supabaseNavigateur } from "./supabase/client";

const TABLES = ["marches", "avenants", "reserves", "intervenants", "ordres_service", "pv_reunions", "bpde_lignes", "attachements", "attachement_lignes", "documents", "decomptes", "garanties"] as const;

/** Exporte toutes les données de l'utilisateur au format JSON. */
export async function exporterTout() {
  const sb = supabaseNavigateur();
  const contenu: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const { data, error } = await sb.from(t).select("*");
    if (error) throw new Error(error.message);
    contenu[t] = data ?? [];
  }
  return { format: "suivi-travaux", version: 1, date: new Date().toISOString(), donnees: contenu };
}

/**
 * Restaure une sauvegarde : les lignes sont insérées ou mises à jour (même identifiant),
 * rattachées à l'utilisateur connecté. Les données existantes non présentes dans la sauvegarde sont conservées.
 */
export async function restaurer(json: unknown) {
  const s = json as { format?: string; donnees?: Record<string, Record<string, unknown>[]> };
  if (s?.format !== "suivi-travaux" || !s.donnees) throw new Error("Fichier de sauvegarde non reconnu");
  const sb = supabaseNavigateur();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Session expirée");
  let total = 0;
  for (const t of TABLES) {
    const lignes = (s.donnees[t] ?? []).map((l) => ({ ...l, user_id: data.user!.id }));
    for (let i = 0; i < lignes.length; i += 500) {
      const { error } = await sb.from(t).upsert(lignes.slice(i, i + 500));
      if (error) throw new Error(`${t} : ${error.message}`);
    }
    total += lignes.length;
  }
  return total;
}

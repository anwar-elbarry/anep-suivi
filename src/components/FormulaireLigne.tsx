"use client";
import { useState } from "react";
import { inserer, modifier, supprimerFichier, televerser } from "@/lib/donnees";
import { TAILLE_MAX_MO } from "@/lib/fichiers";
import { Champ, ChampNombre, Erreur, Modal } from "./ui";

export type DefChamp = {
  cle: string;
  label: string;
  /** « fichier » : scan (PDF ou photo) déposé dans le stockage ; la colonne reçoit son chemin. */
  type?: "texte" | "zone" | "date" | "nombre" | "liste" | "email" | "tel" | "fichier";
  options?: readonly string[] | { valeur: string; label: string }[];
  large?: boolean;
  requis?: boolean;
};

type Table = Parameters<typeof inserer>[0];

/**
 * Formulaire générique d'ajout / modification d'une ligne liée à un marché.
 */
export function FormulaireLigne({
  titre,
  table,
  champs,
  marcheId,
  initial,
  onFermer,
  onEnregistre,
  avant,
}: {
  titre: string;
  table: Table;
  champs: DefChamp[];
  marcheId: string;
  initial?: Record<string, unknown> & { id?: string };
  onFermer: () => void;
  onEnregistre: () => void | Promise<void>;
  avant?: (v: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
}) {
  const [v, setV] = useState<Record<string, unknown>>(() => {
    const base: Record<string, unknown> = {};
    for (const c of champs) {
      if (c.type === "fichier") continue;
      const val = initial?.[c.cle];
      base[c.cle] = val ?? (c.type === "nombre" ? 0 : c.type === "liste" ? optionsDe(c)[0]?.valeur : c.type === "date" ? null : "");
    }
    return base;
  });
  const [fichiers, setFichiers] = useState<Record<string, File | null>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    const deposes: string[] = [];
    try {
      let valeurs: Record<string, unknown> = { ...v };
      for (const c of champs) {
        if (c.type === "date" && !valeurs[c.cle]) valeurs[c.cle] = null;
        if (typeof valeurs[c.cle] === "string") valeurs[c.cle] = (valeurs[c.cle] as string).trim();
      }
      if (avant) valeurs = await avant(valeurs);
      // Fichiers joints : déposés après les contrôles, retirés du stockage si l'enregistrement échoue.
      const remplaces: string[] = [];
      for (const c of champs) {
        const f = c.type === "fichier" ? fichiers[c.cle] : null;
        if (!f) continue;
        const chemin = await televerser(marcheId, "scans", f);
        deposes.push(chemin);
        valeurs[c.cle] = chemin;
        if (typeof initial?.[c.cle] === "string") remplaces.push(initial[c.cle] as string);
      }
      if (initial?.id) await modifier(table, initial.id, valeurs);
      else await inserer(table, { ...valeurs, marche_id: marcheId });
      deposes.length = 0;
      await Promise.all(remplaces.map((ancien) => supprimerFichier(ancien)));
      await onEnregistre();
      onFermer();
    } catch (err) {
      await Promise.all(deposes.map((chemin) => supprimerFichier(chemin)));
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal titre={titre} ouvert onFermer={onFermer}>
      <Erreur message={erreur} />
      <form onSubmit={soumettre} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {champs.map((c) => (
          <Champ key={c.cle} label={c.label + (c.requis ? " *" : "")} className={c.large || c.type === "zone" || c.type === "fichier" ? "sm:col-span-2" : ""}>
            {c.type === "fichier" ? (
              <>
                <input
                  className="champ file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium"
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setFichiers((x) => ({ ...x, [c.cle]: e.target.files?.[0] ?? null }))}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  PDF ou photo, {TAILLE_MAX_MO} Mo maximum.
                  {initial?.[c.cle] ? " Un scan est déjà joint : un nouveau fichier le remplace." : ""}
                </span>
              </>
            ) : c.type === "zone" ? (
              <textarea className="champ" rows={3} value={String(v[c.cle] ?? "")} onChange={(e) => setV({ ...v, [c.cle]: e.target.value })} />
            ) : c.type === "nombre" ? (
              <ChampNombre valeur={v[c.cle] as number} onChange={(n) => setV((x) => ({ ...x, [c.cle]: n ?? 0 }))} />
            ) : c.type === "liste" ? (
              <select className="champ" value={String(v[c.cle] ?? "")} onChange={(e) => setV({ ...v, [c.cle]: e.target.value })}>
                {optionsDe(c).map((o) => (
                  <option key={o.valeur} value={o.valeur}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="champ"
                type={c.type === "date" ? "date" : c.type === "email" ? "email" : c.type === "tel" ? "tel" : "text"}
                required={c.requis}
                value={String(v[c.cle] ?? "")}
                onChange={(e) => setV({ ...v, [c.cle]: e.target.value })}
              />
            )}
          </Champ>
        ))}
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onFermer}>
            Annuler
          </button>
          <button className="btn-primaire" disabled={envoi}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function optionsDe(c: DefChamp): { valeur: string; label: string }[] {
  return (c.options ?? []).map((o) => (typeof o === "string" ? { valeur: o, label: o } : o));
}

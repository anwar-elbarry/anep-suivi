"use client";
import { useState } from "react";
import { inserer, modifier } from "@/lib/donnees";
import { Champ, ChampNombre, Erreur, Modal } from "./ui";

export type DefChamp = {
  cle: string;
  label: string;
  type?: "texte" | "zone" | "date" | "nombre" | "liste" | "email" | "tel";
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
      const val = initial?.[c.cle];
      base[c.cle] = val ?? (c.type === "nombre" ? 0 : c.type === "liste" ? optionsDe(c)[0]?.valeur : c.type === "date" ? null : "");
    }
    return base;
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      let valeurs: Record<string, unknown> = { ...v };
      for (const c of champs) {
        if (c.type === "date" && !valeurs[c.cle]) valeurs[c.cle] = null;
        if (typeof valeurs[c.cle] === "string") valeurs[c.cle] = (valeurs[c.cle] as string).trim();
      }
      if (avant) valeurs = await avant(valeurs);
      if (initial?.id) await modifier(table, initial.id, valeurs);
      else await inserer(table, { ...valeurs, marche_id: marcheId });
      await onEnregistre();
      onFermer();
    } catch (err) {
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
          <Champ key={c.cle} label={c.label + (c.requis ? " *" : "")} className={c.large || c.type === "zone" ? "sm:col-span-2" : ""}>
            {c.type === "zone" ? (
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

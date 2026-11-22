"use client";
import { useState } from "react";
import { modifier } from "@/lib/donnees";
import type { Marche } from "@/lib/types";
import { ChampNombre } from "./ui";

type CleNombre = Exclude<
  {
    [K in keyof Marche]-?: Marche[K] extends number | null ? K : never;
  }[keyof Marche],
  "montant_avenants" | "jours_avenants"
>;

/** Champ numérique enregistré directement sur le marché à la sortie du champ. */
export function ParametreNombre({
  marche,
  cle,
  label,
  recharger,
  vide = "nul",
  aide,
}: {
  marche: Marche;
  cle: CleNombre;
  label: string;
  recharger: () => Promise<void>;
  /** Valeur enregistrée quand le champ est vidé : null ou 0. */
  vide?: "nul" | "zero";
  aide?: string;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <label className="block">
      <span className="etiquette">{label}</span>
      <ChampNombre
        valeur={marche[cle] as number | null}
        onChange={async (n) => {
          const v = n === null ? (vide === "nul" ? null : 0) : n;
          if (v !== null && v < 0) return setErreur("Valeur négative refusée");
          if (v === marche[cle]) return;
          try {
            setErreur(null);
            await modifier("marches", marche.id, { [cle]: v });
            await recharger();
          } catch (e) {
            setErreur(e instanceof Error ? e.message : String(e));
          }
        }}
      />
      {aide && !erreur && <span className="mt-0.5 block text-xs text-slate-500">{aide}</span>}
      {erreur && <span className="mt-0.5 block text-xs text-red-600">{erreur}</span>}
    </label>
  );
}

export function ParametreDate({
  marche,
  cle,
  label,
  recharger,
  aide,
}: {
  marche: Marche;
  cle: "date_reception_provisoire" | "date_reception_definitive" | "avance_date" | "date_debut";
  label: string;
  recharger: () => Promise<void>;
  aide?: string;
}) {
  return (
    <label className="block">
      <span className="etiquette">{label}</span>
      <input
        className="champ"
        type="date"
        defaultValue={marche[cle] ?? ""}
        key={marche[cle] ?? ""}
        onBlur={async (e) => {
          const v = e.target.value || null;
          if (v === marche[cle]) return;
          await modifier("marches", marche.id, { [cle]: v });
          await recharger();
        }}
      />
      {aide && <span className="mt-0.5 block text-xs text-slate-500">{aide}</span>}
    </label>
  );
}

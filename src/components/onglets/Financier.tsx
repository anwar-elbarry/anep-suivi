"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatDate, formatMontant, formatPct, situationFinanciere } from "@/lib/calculs";
import { modifier, supprimer } from "@/lib/donnees";
import type { Decompte } from "@/lib/types";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { ImportBpde } from "../ImportBpde";
import { Barre, ChampNombre, Chiffre, Erreur, Vide } from "../ui";
import type { PropsOnglet } from "./types";

const CHAMPS: DefChamp[] = [
  { cle: "numero", label: "N° du décompte", requis: true },
  { cle: "date", label: "Date", type: "date" },
  { cle: "montant_travaux", label: "Montant des travaux de la période (TTC)", type: "nombre" },
  { cle: "montant_revision", label: "Révision des prix de la période (TTC)", type: "nombre" },
  { cle: "observations", label: "Observations", type: "zone" },
];

export function OngletFinancier({ dossier, recharger }: PropsOnglet) {
  const { marche, decomptes } = dossier;
  const [edite, setEdite] = useState<Partial<Decompte> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const s = situationFinanciere(marche, decomptes);
  const tries = [...decomptes].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const cumuls = tries.reduce<number[]>((acc, d) => [...acc, (acc.at(-1) ?? 0) + Number(d.montant_travaux) + Number(d.montant_revision)], []);

  async function majParametre(champ: string, valeur: number | null) {
    if (valeur === null || valeur < 0) return;
    try {
      await modifier("marches", marche.id, { [champ]: valeur });
      await recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="space-y-5">
      <Erreur message={erreur} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Chiffre label="Montant atteint TTC" valeur={formatMontant(s.montantAtteint)} sous={`dont révision ${formatMontant(s.cumulRevision)}`} />
        <Chiffre label="Part du marché" valeur={formatPct(s.part)} alerte={s.part > 1} sous={s.part > 1 ? "Dépassement du montant" : undefined} />
        <Chiffre label="Retenue de garantie" valeur={formatMontant(s.retenue)} />
        <Chiffre label="Net après retenue" valeur={formatMontant(s.netApresRetenue)} />
        <Chiffre label="Reste à réaliser" valeur={formatMontant(s.reste)} alerte={s.reste < 0} />
      </div>
      <div className="carte p-4">
        <Barre label="Avancement financier" valeur={s.part} couleur="bg-emerald-500" />
      </div>

      <div className="carte p-4">
        <h2 className="mb-3 font-semibold">Paramètres</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label>
            <span className="etiquette">Taux de retenue de garantie (%)</span>
            <ChampNombre valeur={Number(marche.taux_retenue)} onChange={(n) => majParametre("taux_retenue", n)} />
          </label>
          <label>
            <span className="etiquette">Plafond de la retenue (% du marché)</span>
            <ChampNombre valeur={Number(marche.plafond_retenue)} onChange={(n) => majParametre("plafond_retenue", n)} />
          </label>
          <label>
            <span className="etiquette">Taux de TVA (%)</span>
            <ChampNombre valeur={Number(marche.taux_tva)} onChange={(n) => majParametre("taux_tva", n)} />
          </label>
          <div className="flex items-end">
            <ImportBpde marcheId={marche.id} nbExistant={dossier.bpde.length} onImporte={recharger} />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Valeurs par défaut (10 % plafonné à 7 %, TVA 20 %) à vérifier au regard du CPS et du CCAG-T applicable.
        </p>
      </div>

      <div className="carte overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold">Décomptes</h2>
          <button className="btn-primaire" onClick={() => setEdite({ numero: String(decomptes.length + 1) })}>
            <Plus size={15} /> Ajouter un décompte
          </button>
        </div>
        {tries.length === 0 ? (
          <div className="p-4">
            <Vide>Aucun décompte. Saisissez-les ici ou générez-les depuis l&apos;onglet Décompte.</Vide>
          </div>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th>N°</th>
                <th>Date</th>
                <th className="num">Travaux TTC</th>
                <th className="num">Révision TTC</th>
                <th className="num">K</th>
                <th className="num">Cumul TTC</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tries.map((d, i) => {
                return (
                  <tr key={d.id}>
                    <td className="font-medium">{d.numero}</td>
                    <td>{formatDate(d.date)}</td>
                    <td className="num">{formatMontant(Number(d.montant_travaux))}</td>
                    <td className="num">{formatMontant(Number(d.montant_revision))}</td>
                    <td className="num">{d.coefficient_k ? Number(d.coefficient_k).toFixed(4).replace(".", ",") : "—"}</td>
                    <td className="num">{formatMontant(cumuls[i])}</td>
                    <td className="whitespace-nowrap text-right">
                      <button className="btn-icone" aria-label="Modifier" onClick={() => setEdite(d)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="btn-icone hover:text-red-600"
                        aria-label="Supprimer"
                        onClick={async () => {
                          if (confirm(`Supprimer le décompte n° ${d.numero} ?`)) {
                            await supprimer("decomptes", d.id);
                            recharger();
                          }
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {edite && (
        <FormulaireLigne
          titre={edite.id ? "Modifier le décompte" : "Nouveau décompte"}
          table="decomptes"
          champs={CHAMPS}
          marcheId={marche.id}
          initial={edite}
          onFermer={() => setEdite(null)}
          onEnregistre={recharger}
        />
      )}
    </section>
  );
}

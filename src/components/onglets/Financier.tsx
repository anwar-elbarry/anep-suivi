"use client";
import { Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatDate, formatMontant, formatPct, remboursementAvanceCumule, situationFinanciere } from "@/lib/calculs";
import { modifier, supprimer } from "@/lib/donnees";
import type { Decompte } from "@/lib/types";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { ImportBpde } from "../ImportBpde";
import { ParametreDate, ParametreNombre } from "../ParametreMarche";
import { Barre, Chiffre, Erreur, Vide } from "../ui";
import type { PropsOnglet } from "./types";

const CHAMPS: DefChamp[] = [
  { cle: "numero", label: "N° du décompte", requis: true },
  { cle: "date", label: "Date", type: "date" },
  { cle: "montant_travaux", label: "Travaux de la période (TTC)", type: "nombre" },
  { cle: "montant_revision", label: "Révision des prix de la période (TTC)", type: "nombre" },
  { cle: "montant_penalites", label: "Pénalités imputées (période)", type: "nombre" },
  { cle: "remboursement_avance", label: "Remboursement d'avance (période)", type: "nombre" },
  { cle: "observations", label: "Observations", type: "zone" },
];

export function OngletFinancier({ dossier, recharger }: PropsOnglet) {
  const { marche, decomptes } = dossier;
  const [edite, setEdite] = useState<Partial<Decompte> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const s = situationFinanciere(marche, decomptes);
  const tries = [...decomptes].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const cumuls = tries.reduce<number[]>((acc, d) => [...acc, (acc.at(-1) ?? 0) + Number(d.montant_travaux) + Number(d.montant_revision)], []);
  const avance = Number(marche.avance_montant) || 0;
  const rembDu = remboursementAvanceCumule(marche, s.cumulTravaux);

  async function basculerRetenue() {
    try {
      await modifier("marches", marche.id, { retenue_remplacee_par_caution: !marche.retenue_remplacee_par_caution });
      await recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="space-y-5">
      <Erreur message={erreur} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Chiffre label="Montant atteint TTC" valeur={formatMontant(s.montantAtteint)} sous={`dont révision ${formatMontant(s.cumulRevision)}`} />
        <Chiffre label="Part du marché" valeur={formatPct(s.part)} alerte={s.part > 1} sous={s.part > 1 ? "Dépassement du montant" : undefined} />
        <Chiffre
          label="Retenue de garantie"
          valeur={formatMontant(s.retenue)}
          sous={marche.retenue_remplacee_par_caution ? "remplacée par caution" : undefined}
        />
        <Chiffre label="Pénalités imputées" valeur={formatMontant(s.cumulPenalites)} alerte={s.cumulPenalites > 0} />
        <Chiffre label="Net après déductions" valeur={formatMontant(s.netApresDeductions)} sous="retenue, pénalités, avance" />
        <Chiffre label="Reste à réaliser" valeur={formatMontant(s.reste)} alerte={s.reste < 0} />
      </div>
      <div className="carte p-4">
        <Barre label="Avancement financier" valeur={s.part} couleur="bg-emerald-500" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="carte p-4">
          <h2 className="mb-3 font-semibold">Paramètres</h2>
          <div className="grid grid-cols-2 gap-3">
            <ParametreNombre marche={marche} cle="taux_retenue" label="Taux de retenue de garantie (%)" recharger={recharger} vide="zero" />
            <ParametreNombre marche={marche} cle="plafond_retenue" label="Plafond de la retenue (% du marché)" recharger={recharger} vide="zero" />
            <ParametreNombre marche={marche} cle="taux_tva" label="Taux de TVA (%)" recharger={recharger} vide="zero" />
            <div className="flex items-end">
              <ImportBpde marcheId={marche.id} nbExistant={dossier.bpde.length} onImporte={recharger} />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={marche.retenue_remplacee_par_caution} onChange={basculerRetenue} />
            Retenue de garantie remplacée par une caution (aucune retenue sur les décomptes)
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Valeurs de départ (10 % plafonnée à 7 %, TVA 20 %) à vérifier au regard du CPS et du CCAG-T applicable.
          </p>
        </div>

        <div className="carte p-4">
          <h2 className="mb-3 font-semibold">Avance</h2>
          <div className="grid grid-cols-2 gap-3">
            <ParametreNombre marche={marche} cle="avance_montant" label="Montant de l'avance (TTC)" recharger={recharger} vide="zero" />
            <ParametreDate marche={marche} cle="avance_date" label="Date de versement" recharger={recharger} />
            <ParametreNombre
              marche={marche}
              cle="avance_debut_remboursement"
              label="Début du remboursement (% d'avancement)"
              recharger={recharger}
              vide="zero"
            />
            <ParametreNombre marche={marche} cle="avance_fin_remboursement" label="Fin du remboursement (% d'avancement)" recharger={recharger} vide="zero" />
          </div>
          {avance > 0 ? (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Remboursé (décomptes)</dt>
                <dd className="font-medium tabular-nums">{formatMontant(s.cumulRemboursement)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Dû à ce stade</dt>
                <dd className={`font-medium tabular-nums ${rembDu > s.cumulRemboursement + 0.01 ? "text-amber-700" : ""}`}>{formatMontant(rembDu)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Reste à rembourser</dt>
                <dd className="font-medium tabular-nums">{formatMontant(s.avanceRestante)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Pas d&apos;avance enregistrée.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Remboursement linéaire entre les deux seuils d&apos;avancement (cumul des travaux TTC / montant du marché). 0 % et 100 % = au prorata de
            chaque décompte. Seuils à reprendre du CPS.
          </p>
        </div>
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
                <th className="num">Pénalités</th>
                <th className="num">Rembt avance</th>
                <th className="num">Net à payer</th>
                <th className="num">Cumul TTC</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tries.map((d, i) => (
                <tr key={d.id}>
                  <td className="font-medium">{d.numero}</td>
                  <td>{formatDate(d.date)}</td>
                  <td className="num">{formatMontant(Number(d.montant_travaux))}</td>
                  <td className="num">{formatMontant(Number(d.montant_revision))}</td>
                  <td className="num">{d.coefficient_k ? Number(d.coefficient_k).toFixed(4).replace(".", ",") : "—"}</td>
                  <td className="num">{formatMontant(Number(d.montant_penalites))}</td>
                  <td className="num">{formatMontant(Number(d.remboursement_avance))}</td>
                  <td className="num">{d.net_a_payer === null ? "—" : formatMontant(Number(d.net_a_payer))}</td>
                  <td className="num">{formatMontant(cumuls[i])}</td>
                  <td className="whitespace-nowrap text-right">
                    <a
                      className="btn-icone"
                      href={`/marches/${marche.id}/imprimer?doc=decompte&decompte=${d.id}`}
                      target="_blank"
                      rel="noopener"
                      title="Imprimer ce décompte"
                      aria-label="Imprimer ce décompte"
                    >
                      <Printer size={15} />
                    </a>
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
              ))}
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
          avant={(v) => {
            // Net recalculé si la retenue de la période est connue (décompte généré), sinon laissé vide.
            const r = edite.retenue_garantie;
            const n = (k: string) => Number(v[k]) || 0;
            const net = n("montant_travaux") + n("montant_revision") - n("montant_penalites") - n("remboursement_avance") - Number(r ?? 0);
            return { ...v, net_a_payer: r === null || r === undefined ? null : Math.round(net * 100) / 100 };
          }}
        />
      )}
    </section>
  );
}

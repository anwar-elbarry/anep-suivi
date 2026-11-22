"use client";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMontant, montantLigneHT, totalBpdeHT, verifierBpde } from "@/lib/calculs";
import { inserer, modifier, supprimer } from "@/lib/donnees";
import type { BpdeLigne } from "@/lib/types";
import { ImportBpde } from "../ImportBpde";
import { ChampNombre, Chiffre, Erreur, Vide } from "../ui";
import type { PropsOnglet } from "./types";

export function OngletBpde({ dossier, recharger }: PropsOnglet) {
  const { marche, bpde } = dossier;
  const [erreur, setErreur] = useState<string | null>(null);
  const [seulementAlertes, setSeulementAlertes] = useState(false);
  const alertes = useMemo(() => verifierBpde(bpde, marche), [bpde, marche]);
  const parLigne = useMemo(() => {
    const m = new Map<string, typeof alertes>();
    for (const a of alertes) if (a.ligneId) m.set(a.ligneId, [...(m.get(a.ligneId) ?? []), a]);
    return m;
  }, [alertes]);
  const globales = alertes.filter((a) => !a.ligneId);
  const totalHT = totalBpdeHT(bpde);
  const tva = Number(marche.taux_tva) / 100;
  const lignes = seulementAlertes ? bpde.filter((l) => parLigne.has(l.id)) : bpde;

  async function maj(l: BpdeLigne, champ: keyof BpdeLigne, valeur: unknown) {
    if (l[champ] === valeur) return;
    try {
      await modifier("bpde_lignes", l.id, { [champ]: valeur });
      await recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  async function ajouter() {
    await inserer("bpde_lignes", { marche_id: marche.id, ordre: (bpde.at(-1)?.ordre ?? 0) + 1, designation: "Nouvelle prestation" });
    recharger();
  }

  return (
    <section className="space-y-4">
      <Erreur message={erreur} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chiffre label="Lignes" valeur={bpde.length} />
        <Chiffre label="Total HT" valeur={formatMontant(totalHT)} />
        <Chiffre label={`Total TTC (TVA ${Number(marche.taux_tva)} %)`} valeur={formatMontant(totalHT * (1 + tva))} sous={`Marché : ${formatMontant(Number(marche.montant_ttc))}`} />
        <Chiffre label="Alertes" valeur={alertes.length} alerte={alertes.some((a) => a.niveau === "erreur")} />
      </div>
      {globales.map((a) => (
        <div key={a.message} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={15} /> {a.message}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={seulementAlertes} onChange={(e) => setSeulementAlertes(e.target.checked)} />
          Lignes avec alerte uniquement
        </label>
        <div className="ml-auto flex gap-2">
          <ImportBpde marcheId={marche.id} nbExistant={bpde.length} onImporte={recharger} />
          <button className="btn-primaire" onClick={ajouter}>
            <Plus size={15} /> Ligne
          </button>
        </div>
      </div>

      {bpde.length === 0 ? (
        <Vide>Importez le BPDE (Excel : N°, désignation, unité, quantité, prix unitaire) ou saisissez les lignes.</Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="tableau">
            <thead>
              <tr>
                <th className="w-20">N°</th>
                <th>Désignation</th>
                <th className="w-20">Unité</th>
                <th className="num w-28">Quantité</th>
                <th className="num w-32">PU HT</th>
                <th className="num w-36">Montant HT</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const a = parLigne.get(l.id);
                const erreurLigne = a?.some((x) => x.niveau === "erreur");
                return (
                  <tr key={l.id} className={erreurLigne ? "bg-red-50/60" : a ? "bg-amber-50/60" : ""}>
                    <td>
                      <input className="champ px-2 py-1" defaultValue={l.numero} onBlur={(e) => maj(l, "numero", e.target.value.trim())} aria-label="N° de prix" />
                    </td>
                    <td>
                      <textarea
                        className="champ px-2 py-1"
                        rows={1}
                        defaultValue={l.designation}
                        onBlur={(e) => maj(l, "designation", e.target.value.trim())}
                        aria-label="Désignation"
                      />
                      {a?.map((x) => (
                        <div key={x.message} className={`mt-1 text-xs ${x.niveau === "erreur" ? "text-red-700" : "text-amber-700"}`}>
                          {x.message}
                        </div>
                      ))}
                    </td>
                    <td>
                      <input className="champ px-2 py-1" defaultValue={l.unite} onBlur={(e) => maj(l, "unite", e.target.value.trim())} aria-label="Unité" />
                    </td>
                    <td>
                      <ChampNombre className="champ px-2 py-1 text-right" valeur={l.quantite} onChange={(n) => maj(l, "quantite", n ?? 0)} aria-label="Quantité" />
                    </td>
                    <td>
                      <ChampNombre className="champ px-2 py-1 text-right" valeur={l.prix_unitaire} onChange={(n) => maj(l, "prix_unitaire", n)} aria-label="Prix unitaire" />
                    </td>
                    <td className="num pt-3">{formatMontant(montantLigneHT(l))}</td>
                    <td>
                      <button
                        className="btn-icone hover:text-red-600"
                        aria-label="Supprimer la ligne"
                        onClick={async () => {
                          if (confirm("Supprimer cette ligne du BPDE ?")) {
                            await supprimer("bpde_lignes", l.id);
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
        </div>
      )}
      <p className="text-xs text-slate-500">Les prix unitaires sont considérés hors taxes. Les montants importés sont comparés à quantité × prix.</p>
    </section>
  );
}

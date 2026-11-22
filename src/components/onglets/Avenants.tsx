"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatDate, formatMontant, formatPct, formatQte, montantLigneHT, montantMarche } from "@/lib/calculs";
import { supprimer, supprimerFichier } from "@/lib/donnees";
import type { Avenant, BpdeLigne } from "@/lib/types";
import { BoutonScan } from "../BoutonScan";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { ParametreNombre } from "../ParametreMarche";
import { Chiffre, Vide } from "../ui";
import type { PropsOnglet } from "./types";

const CHAMPS: DefChamp[] = [
  { cle: "numero", label: "N° de l'avenant", requis: true },
  { cle: "date", label: "Date", type: "date" },
  { cle: "objet", label: "Objet", type: "zone" },
  { cle: "montant_ttc", label: "Variation du montant TTC (négatif si diminution)", type: "nombre" },
  { cle: "jours_supplementaires", label: "Variation du délai (jours)", type: "nombre" },
  { cle: "observations", label: "Observations", type: "zone" },
];

export function OngletAvenants({ dossier, recharger, allerA }: PropsOnglet) {
  const { marche, avenants } = dossier;
  const [edite, setEdite] = useState<Partial<Avenant> | null>(null);
  const [prix, setPrix] = useState<Partial<BpdeLigne> | null>(null);
  const initial = Number(marche.montant_ttc) || 0;
  const variation = Number(marche.montant_avenants) || 0;
  const seuil = Number(marche.seuil_avenants);
  const depasse = seuil > 0 && initial > 0 && Math.abs(variation) / initial > seuil / 100;
  const prixNouveaux = dossier.bpde.filter((l) => l.avenant_id);
  const numeroAvenant = (id: string | null) => avenants.find((a) => a.id === id)?.numero ?? "?";
  const tries = [...avenants].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chiffre label="Montant initial TTC" valeur={formatMontant(initial)} />
        <Chiffre
          label="Avenants"
          valeur={formatMontant(variation)}
          sous={initial > 0 ? `${formatPct(variation / initial)} du montant initial` : undefined}
          alerte={depasse}
        />
        <Chiffre label="Montant actuel TTC" valeur={formatMontant(montantMarche(marche))} />
        <Chiffre label="Délai ajouté" valeur={`${Number(marche.jours_avenants) || 0} j`} sous="pris en compte dans la fin prévue" />
      </div>

      <div className="carte flex flex-wrap items-end gap-4 p-4">
        <div className="w-64">
          <ParametreNombre
            marche={marche}
            cle="seuil_avenants"
            label="Seuil d'alerte du cumul des avenants (%)"
            recharger={recharger}
            aide="limite fixée par le CPS / CCAG ; vide = pas d'alerte"
          />
        </div>
        {depasse && <p className="text-sm font-medium text-rouge-fonce">Seuil dépassé : vérifiez la procédure applicable avant de poursuivre.</p>}
      </div>

      <div className="carte overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold">Avenants</h2>
          <button className="btn-primaire" onClick={() => setEdite({ numero: String(avenants.length + 1) })}>
            <Plus size={15} /> Ajouter un avenant
          </button>
        </div>
        {tries.length === 0 ? (
          <div className="p-4">
            <Vide>Aucun avenant.</Vide>
          </div>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th>N°</th>
                <th>Date</th>
                <th>Objet</th>
                <th className="num">Montant TTC</th>
                <th className="num">Délai</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tries.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{a.numero}</td>
                  <td>{formatDate(a.date)}</td>
                  <td className="max-w-md">
                    {a.objet}
                    {a.observations && <div className="text-xs text-slate-500">{a.observations}</div>}
                  </td>
                  <td className="num">{formatMontant(Number(a.montant_ttc))}</td>
                  <td className="num">{a.jours_supplementaires ? `${a.jours_supplementaires} j` : "—"}</td>
                  <td className="whitespace-nowrap text-right">
                    <BoutonScan table="avenants" id={a.id} marcheId={marche.id} chemin={a.scan_path} onChange={recharger} />
                    <button className="btn-icone" aria-label="Modifier" onClick={() => setEdite(a)}>
                      <Pencil size={15} />
                    </button>
                    <button
                      className="btn-icone hover:text-rouge-fonce"
                      aria-label="Supprimer"
                      onClick={async () => {
                        if (confirm(`Supprimer l'avenant n° ${a.numero} ? Ses prix nouveaux resteront au BPDE, sans rattachement.`)) {
                          await supprimer("avenants", a.id);
                          await supprimerFichier(a.scan_path);
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

      <div className="carte overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="font-semibold">Prix nouveaux</h2>
            <p className="text-xs text-slate-500">Ajoutés au BPDE : ils entrent dans l&apos;état physique, le décompte et les écarts.</p>
          </div>
          <button
            className="btn"
            disabled={!avenants.length}
            title={avenants.length ? undefined : "Créez d'abord l'avenant qui introduit le prix"}
            onClick={() => setPrix({ avenant_id: tries.at(-1)?.id ?? null })}
          >
            <Plus size={15} /> Prix nouveau
          </button>
        </div>
        {prixNouveaux.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-slate-500">Aucun prix nouveau.</p>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th>Avenant</th>
                <th>N°</th>
                <th>Désignation</th>
                <th>U</th>
                <th className="num">Quantité</th>
                <th className="num">PU HT</th>
                <th className="num">Montant HT</th>
              </tr>
            </thead>
            <tbody>
              {prixNouveaux.map((l) => (
                <tr key={l.id}>
                  <td>n° {numeroAvenant(l.avenant_id)}</td>
                  <td>{l.numero}</td>
                  <td>{l.designation}</td>
                  <td>{l.unite}</td>
                  <td className="num">{formatQte(Number(l.quantite))}</td>
                  <td className="num">{formatMontant(l.prix_unitaire)}</td>
                  <td className="num">{formatMontant(montantLigneHT(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {prixNouveaux.length > 0 && (
          <p className="px-4 pb-3 text-xs text-slate-500">
            Modification et suppression dans l&apos;onglet{" "}
            <button className="text-marque-700 hover:underline" onClick={() => allerA("bpde")}>
              BPDE et prix
            </button>
            .
          </p>
        )}
      </div>

      {edite && (
        <FormulaireLigne
          titre={edite.id ? "Modifier l'avenant" : "Nouvel avenant"}
          table="avenants"
          champs={CHAMPS}
          marcheId={marche.id}
          initial={edite}
          onFermer={() => setEdite(null)}
          onEnregistre={recharger}
          avant={(v) => ({ ...v, jours_supplementaires: Math.round(Number(v.jours_supplementaires) || 0) })}
        />
      )}
      {prix && (
        <FormulaireLigne
          titre="Nouveau prix (avenant)"
          table="bpde_lignes"
          champs={[
            { cle: "avenant_id", label: "Avenant", type: "liste", options: tries.map((a) => ({ valeur: a.id, label: `Avenant n° ${a.numero}` })) },
            { cle: "numero", label: "N° de prix (ex. PN1)", requis: true },
            { cle: "designation", label: "Désignation", requis: true, large: true },
            { cle: "unite", label: "Unité" },
            { cle: "quantite", label: "Quantité", type: "nombre" },
            { cle: "prix_unitaire", label: "Prix unitaire HT", type: "nombre" },
          ]}
          marcheId={marche.id}
          initial={prix}
          onFermer={() => setPrix(null)}
          onEnregistre={recharger}
          avant={(v) => ({ ...v, ordre: (dossier.bpde.at(-1)?.ordre ?? 0) + 1, prix_unitaire: Number(v.prix_unitaire) > 0 ? v.prix_unitaire : null })}
        />
      )}
    </section>
  );
}

"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { aujourdhuiUtc, etatExpiration, formatDate, formatMontant } from "@/lib/calculs";
import { supprimer, supprimerFichier } from "@/lib/donnees";
import { STATUTS_GARANTIE, TYPES_GARANTIE, type Garantie } from "@/lib/types";
import { BoutonScan } from "../BoutonScan";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { Chiffre, Vide } from "../ui";
import type { PropsOnglet } from "./types";

const CHAMPS: DefChamp[] = [
  { cle: "type", label: "Type", type: "liste", options: TYPES_GARANTIE },
  { cle: "statut", label: "Statut", type: "liste", options: STATUTS_GARANTIE },
  { cle: "organisme", label: "Banque / assureur" },
  { cle: "reference", label: "N° de caution / police" },
  { cle: "montant", label: "Montant garanti", type: "nombre" },
  { cle: "date_emission", label: "Date d'émission / d'effet", type: "date" },
  { cle: "date_expiration", label: "Date d'expiration", type: "date" },
  { cle: "observations", label: "Observations", type: "zone" },
];

const COULEURS_STATUT: Record<string, string> = {
  "En vigueur": "bg-bleu-pale text-bleu-texte",
  Mainlevée: "bg-slate-200/80 text-slate-700",
  Restituée: "bg-slate-200/80 text-slate-700",
};

export function OngletGaranties({ dossier, recharger }: PropsOnglet) {
  const [edite, setEdite] = useState<Partial<Garantie> | null>(null);
  const auj = aujourdhuiUtc();
  const liste = [...dossier.garanties].sort((a, b) => (a.date_expiration ?? "9999").localeCompare(b.date_expiration ?? "9999"));
  const enVigueur = liste.filter((g) => g.statut === "En vigueur");
  const expirees = liste.filter((g) => etatExpiration(g, auj) === "expiree").length;
  const proches = liste.filter((g) => etatExpiration(g, auj) === "proche").length;
  const montantCautions = enVigueur.filter((g) => g.type.startsWith("Caution")).reduce((s, g) => s + (Number(g.montant) || 0), 0);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chiffre label="En vigueur" valeur={enVigueur.length} sous={`${liste.length} au total`} />
        <Chiffre label="Cautions en vigueur" valeur={formatMontant(montantCautions)} />
        <Chiffre label="Expirent sous 30 j" valeur={proches} alerte={proches > 0} />
        <Chiffre label="Expirées" valeur={expirees} alerte={expirees > 0} />
      </div>
      <div className="flex justify-end">
        <button className="btn-primaire" onClick={() => setEdite({ type: "Caution définitive", statut: "En vigueur" })}>
          <Plus size={15} /> Ajouter une caution ou une assurance
        </button>
      </div>
      {liste.length === 0 ? (
        <Vide>Aucune garantie : caution définitive, caution de restitution d&apos;avance, attestations d&apos;assurance RC et TRC…</Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="tableau">
            <thead>
              <tr>
                <th>Type</th>
                <th>Organisme</th>
                <th>Référence</th>
                <th className="num">Montant</th>
                <th>Émission</th>
                <th>Expiration</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {liste.map((g) => {
                const e = etatExpiration(g, auj);
                return (
                  <tr key={g.id} className={e === "expiree" ? "bg-rouge-pale/60" : e === "proche" ? "bg-bleu-pale/60" : ""}>
                    <td>
                      <div className="font-medium">{g.type}</div>
                      {g.observations && <div className="text-xs text-slate-500">{g.observations}</div>}
                    </td>
                    <td>{g.organisme || "—"}</td>
                    <td>{g.reference || "—"}</td>
                    <td className="num">{formatMontant(g.montant)}</td>
                    <td>{formatDate(g.date_emission)}</td>
                    <td className={e === "expiree" ? "font-semibold text-rouge-fonce" : e === "proche" ? "font-semibold text-bleu-texte" : ""}>
                      {formatDate(g.date_expiration)}
                      {e === "expiree" && <div className="text-xs">expirée</div>}
                      {e === "proche" && <div className="text-xs">expire bientôt</div>}
                    </td>
                    <td>
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COULEURS_STATUT[g.statut]}`}>{g.statut}</span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <BoutonScan table="garanties" id={g.id} marcheId={dossier.marche.id} chemin={g.scan_path} onChange={recharger} />
                      <button className="btn-icone" aria-label="Modifier" onClick={() => setEdite(g)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="btn-icone hover:text-rouge-fonce"
                        aria-label="Supprimer"
                        onClick={async () => {
                          if (confirm(`Supprimer « ${g.type} » ?`)) {
                            await supprimer("garanties", g.id);
                            await supprimerFichier(g.scan_path);
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
      <p className="text-xs text-slate-500">
        Alerte 30 jours avant l&apos;expiration de toute garantie « En vigueur ». Les garanties et assurances exigées, leurs montants et durées
        relèvent du CPS et du CCAG-T applicable : la liste des types est indicative.
      </p>
      {edite && (
        <FormulaireLigne
          titre={edite.id ? "Modifier la garantie" : "Nouvelle garantie ou assurance"}
          table="garanties"
          champs={CHAMPS}
          marcheId={dossier.marche.id}
          initial={edite}
          onFermer={() => setEdite(null)}
          onEnregistre={recharger}
          avant={(v) => ({ ...v, montant: Number(v.montant) > 0 ? v.montant : null })}
        />
      )}
    </section>
  );
}

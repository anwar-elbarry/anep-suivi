"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { aujourdhuiUtc, calculerDelais, dateEffetOS, formatDate } from "@/lib/calculs";
import { supprimer } from "@/lib/donnees";
import { TYPES_OS, type OrdreService } from "@/lib/types";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { Chiffre, Vide } from "../ui";
import type { PropsOnglet } from "./types";

const CHAMPS: DefChamp[] = [
  { cle: "type", label: "Type", type: "liste", options: Object.entries(TYPES_OS).map(([valeur, label]) => ({ valeur, label })) },
  { cle: "numero", label: "N° de l'OS" },
  { cle: "date_emission", label: "Date d'effet / d'émission *", type: "date" },
  { cle: "date_notification", label: "Date de notification", type: "date" },
  { cle: "jours_supplementaires", label: "Jours supplémentaires (prolongation)", type: "nombre" },
  { cle: "objet", label: "Objet / motif", type: "zone" },
];

const COULEURS: Record<string, string> = {
  demarrage: "bg-blue-100 text-blue-800",
  arret: "bg-red-100 text-red-800",
  reprise: "bg-emerald-100 text-emerald-800",
  prolongation: "bg-amber-100 text-amber-800",
  autre: "bg-slate-100 text-slate-700",
};

export function OngletDelais({ dossier, recharger }: PropsOnglet) {
  const [edite, setEdite] = useState<Partial<OrdreService> | null>(null);
  const d = calculerDelais(dossier.marche, dossier.ordres, aujourdhuiUtc());
  const ordres = [...dossier.ordres].sort((a, b) => (dateEffetOS(a)?.getTime() ?? 0) - (dateEffetOS(b)?.getTime() ?? 0));

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Chiffre
          label="Démarrage"
          valeur={formatDate(d.dateDemarrage)}
          sous={d.sourceDemarrage === "os" ? "OS de démarrage" : d.sourceDemarrage === "marche" ? "Date du marché (pas d'OS)" : "Aucun OS de démarrage"}
        />
        <Chiffre label="Fin contractuelle" valeur={formatDate(d.finContractuelle)} sous={`${Number(dossier.marche.duree_mois)} mois`} />
        <Chiffre label="Arrêts" valeur={`${d.joursArret} j`} sous={d.arretEnCours ? "Arrêt en cours" : `${d.arrets.length} période(s)`} alerte={d.arretEnCours} />
        <Chiffre label="Prolongations" valeur={`${d.joursProlongation} j`} />
        <Chiffre
          label="Fin prévue"
          valeur={formatDate(d.finPrevue)}
          sous={d.joursRestants === null ? "" : d.joursRestants < 0 ? `${-d.joursRestants} j de retard` : `${d.joursRestants} j restants`}
          alerte={d.joursRestants !== null && d.joursRestants < 0}
        />
      </div>

      {d.anomalies.length > 0 && (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {d.anomalies.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      )}

      <div className="carte overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold">Ordres de service</h2>
          <button className="btn-primaire" onClick={() => setEdite({ type: ordres.length ? "arret" : "demarrage" })}>
            <Plus size={15} /> Ajouter un OS
          </button>
        </div>
        {ordres.length === 0 ? (
          <div className="p-4">
            <Vide>Enregistrez l&apos;OS de démarrage, puis les OS d&apos;arrêt, de reprise et de prolongation.</Vide>
          </div>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th>Type</th>
                <th>N°</th>
                <th>Date d&apos;effet</th>
                <th>Notification</th>
                <th className="num">Jours supp.</th>
                <th>Objet</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ordres.map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COULEURS[o.type]}`}>{TYPES_OS[o.type]}</span>
                  </td>
                  <td>{o.numero || "—"}</td>
                  <td>{formatDate(o.date_emission)}</td>
                  <td>{formatDate(o.date_notification)}</td>
                  <td className="num">{o.jours_supplementaires || "—"}</td>
                  <td className="max-w-md text-slate-600">{o.objet}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn-icone" aria-label="Modifier" onClick={() => setEdite(o)}>
                      <Pencil size={15} />
                    </button>
                    <button
                      className="btn-icone hover:text-red-600"
                      aria-label="Supprimer"
                      onClick={async () => {
                        if (confirm("Supprimer cet ordre de service ?")) {
                          await supprimer("ordres_service", o.id);
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
      <p className="text-xs text-slate-500">
        Règle : fin prévue = date d&apos;effet de l&apos;OS de démarrage + délai contractuel + jours d&apos;arrêt (de l&apos;OS d&apos;arrêt à
        l&apos;OS de reprise ; un arrêt non repris court jusqu&apos;à aujourd&apos;hui) + jours de prolongation. Vérifiez la règle de
        computation des délais prévue par votre CPS et le CCAG-T applicable.
      </p>

      {edite && (
        <FormulaireLigne
          titre={edite.id ? "Modifier l'ordre de service" : "Nouvel ordre de service"}
          table="ordres_service"
          champs={CHAMPS}
          marcheId={dossier.marche.id}
          initial={edite}
          onFermer={() => setEdite(null)}
          onEnregistre={recharger}
          avant={(v) => {
            if (!v.date_emission) throw new Error("La date d'effet est obligatoire");
            return v;
          }}
        />
      )}
    </section>
  );
}

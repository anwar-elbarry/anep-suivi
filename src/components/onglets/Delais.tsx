"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { aujourdhuiUtc, calculerDelais, calculerPenalites, dateEffetOS, formatDate, formatMontant } from "@/lib/calculs";
import { modifier, supprimer } from "@/lib/donnees";
import { BASES_PENALITE, TYPES_OS, type OrdreService } from "@/lib/types";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { ParametreDate, ParametreNombre } from "../ParametreMarche";
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
  demarrage: "bg-bleu-pale text-bleu-texte",
  arret: "bg-rouge-pale text-rouge-fonce",
  reprise: "bg-bleu-pale text-bleu-texte",
  prolongation: "bg-bleu-pale text-bleu-texte",
  autre: "bg-slate-200/80 text-slate-700",
};

export function OngletDelais({ dossier, recharger }: PropsOnglet) {
  const [edite, setEdite] = useState<Partial<OrdreService> | null>(null);
  const auj = aujourdhuiUtc();
  const d = calculerDelais(dossier.marche, dossier.ordres, auj);
  const pen = calculerPenalites(dossier.marche, d, auj);
  const m = dossier.marche;
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
        <Chiffre label="Prolongations" valeur={`${d.joursProlongation + d.joursAvenants} j`} sous={d.joursAvenants ? `dont ${d.joursAvenants} j par avenant` : "par OS"} />
        <Chiffre
          label="Fin prévue"
          valeur={formatDate(d.finPrevue)}
          sous={d.joursRestants === null ? "" : d.joursRestants < 0 ? `${-d.joursRestants} j de retard` : `${d.joursRestants} j restants`}
          alerte={d.joursRestants !== null && d.joursRestants < 0}
        />
      </div>

      {d.anomalies.length > 0 && (
        <ul className="rounded-lg border border-bleu/30 bg-bleu-pale px-4 py-2 text-sm text-bleu-texte">
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
                      className="btn-icone hover:text-rouge-fonce"
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
      <div className="carte p-4">
        <h2 className="mb-3 font-semibold">Pénalités de retard</h2>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ParametreNombre marche={m} cle="penalite_taux_millieme" label="Taux (‰ du montant par jour)" recharger={recharger} aide="ex. 1 pour 1/1000" />
            <ParametreNombre marche={m} cle="penalite_plafond" label="Plafond (% du montant)" recharger={recharger} aide="vide = sans plafond" />
            <ParametreNombre marche={m} cle="penalite_jours_exoneres" label="Jours exonérés" recharger={recharger} vide="zero" aide="retards justifiés, acceptés par le MO" />
            <ParametreDate marche={m} cle="date_reception_provisoire" label="Réception provisoire" recharger={recharger} aide="arrête le décompte du retard" />
            <label className="sm:col-span-2 block">
              <span className="etiquette">Base de calcul</span>
              <select
                className="champ"
                value={m.penalite_base}
                onChange={async (e) => {
                  await modifier("marches", m.id, { penalite_base: e.target.value });
                  recharger();
                }}
              >
                {Object.entries(BASES_PENALITE).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Retard arrêté au</dt>
            <dd className="font-medium">
              {formatDate(pen.dateReference)} {pen.arreteeALaReception ? "(réception)" : "(aujourd'hui)"}
            </dd>
            <dt className="text-slate-500">Jours de retard</dt>
            <dd className="font-medium tabular-nums">{pen.joursRetard} j</dd>
            <dt className="text-slate-500">Jours pénalisables</dt>
            <dd className="font-medium tabular-nums">{pen.joursPenalisables} j</dd>
            <dt className="text-slate-500">Pénalité par jour</dt>
            <dd className="font-medium tabular-nums">{pen.parametre ? formatMontant(pen.parJour) : "taux non renseigné"}</dd>
            <dt className="text-slate-500">Plafond</dt>
            <dd className="font-medium tabular-nums">{pen.plafond === null ? "—" : formatMontant(pen.plafond)}</dd>
            <dt className="font-semibold">Pénalités encourues</dt>
            <dd className={`font-semibold tabular-nums ${pen.montant > 0 ? "text-rouge-fonce" : ""}`}>
              {formatMontant(pen.montant)}
              {pen.plafonne && " (plafond atteint)"}
            </dd>
          </dl>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Base retenue : {BASES_PENALITE[m.penalite_base].toLowerCase()} ({formatMontant(pen.base)}). Taux, plafond, base et jours exonérés sont à reprendre du CPS ; les
          pénalités n&apos;ont pas de valeur par défaut. Elles sont imputées dans le projet de décompte.
        </p>
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

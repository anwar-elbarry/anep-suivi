"use client";
import { AlertCircle, AlertTriangle, CheckCircle2, Mail, Phone } from "lucide-react";
import { dateEffetOS, formatDate, formatMontant, formatPct } from "@/lib/calculs";
import { syntheseMarche } from "@/lib/synthese";
import { TYPES_OS } from "@/lib/types";
import { Barre, Chiffre } from "../ui";
import type { PropsOnglet } from "./types";

const COULEUR_OS: Record<string, string> = {
  demarrage: "bg-blue-600",
  arret: "bg-red-500",
  reprise: "bg-emerald-500",
  prolongation: "bg-amber-500",
  autre: "bg-slate-400",
};

export function OngletApercu({ dossier, allerA }: PropsOnglet) {
  const { marche } = dossier;
  const s = syntheseMarche(marche, dossier.ordres, dossier.bpde, dossier.attachements, dossier.decomptes, dossier.documents);
  const { delais: d, finances: f, physique: p } = s;
  const j = d.joursRestants;
  const docsValides = dossier.documents.filter((x) => x.statut === "Validé").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Chiffre label="Montant TTC" valeur={formatMontant(Number(marche.montant_ttc))} />
        <Chiffre
          label="Fin prévue"
          valeur={formatDate(d.finPrevue)}
          sous={j === null ? "Pas de date de démarrage" : j < 0 ? `${-j} j de retard` : `${j} j restants`}
          alerte={s.enRetard}
        />
        <Chiffre label="Avancement physique" valeur={formatPct(p.avancement)} />
        <Chiffre label="Montant atteint" valeur={formatMontant(f.montantAtteint)} sous={formatPct(f.part) + " du marché"} />
        <Chiffre label="Documents validés" valeur={`${docsValides} / ${dossier.documents.length}`} />
      </div>

      <div className="carte grid gap-4 p-4 md:grid-cols-3">
        <Barre label="Délai écoulé" valeur={d.tempsEcoule} couleur={s.enRetard ? "bg-red-500" : "bg-slate-500"} />
        <Barre label="Avancement physique" valeur={p.avancement} />
        <Barre label="Avancement financier" valeur={f.part} couleur="bg-emerald-500" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <FriseDelais dossier={dossier} />

          <div className="carte p-4">
            <h2 className="mb-3 font-semibold">Situation financière</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm md:grid-cols-3">
              {(
                [
                  ["Montant du marché TTC", Number(marche.montant_ttc)],
                  ["Travaux décomptés", f.cumulTravaux],
                  ["Révision des prix", f.cumulRevision],
                  ["Montant atteint", f.montantAtteint],
                  ["Retenue de garantie", f.retenue],
                  ["Net après retenue", f.netApresRetenue],
                  ["Reste à réaliser", f.reste],
                ] as const
              ).map(([l, v]) => (
                <div key={l}>
                  <dt className="text-xs text-slate-500">{l}</dt>
                  <dd className="font-medium tabular-nums">{formatMontant(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="space-y-5">
          <div className="carte p-4">
            <h2 className="mb-3 font-semibold">À surveiller</h2>
            {s.vigilance.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 size={16} /> Rien à signaler.
              </p>
            ) : (
              <ul className="space-y-2">
                {s.vigilance.map((v, i) => (
                  <li key={i}>
                    <button className="flex w-full items-start gap-2 text-left text-sm hover:underline" onClick={() => allerA(v.onglet)}>
                      {v.niveau === "erreur" ? (
                        <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
                      ) : (
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                      )}
                      {v.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="carte p-4">
            <h2 className="mb-3 font-semibold">Intervenants</h2>
            {dossier.intervenants.length === 0 ? (
              <button className="text-sm text-marque-700 hover:underline" onClick={() => allerA("intervenants")}>
                Ajouter les intervenants
              </button>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {dossier.intervenants.map((i) => (
                  <li key={i.id}>
                    <div className="text-xs text-slate-500">{i.role}</div>
                    <div className="font-medium">
                      {i.nom}
                      {i.organisme && <span className="font-normal text-slate-500"> · {i.organisme}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs">
                      {i.telephone && (
                        <a className="inline-flex items-center gap-1 text-slate-600 hover:text-marque-700" href={`tel:${i.telephone}`}>
                          <Phone size={11} /> {i.telephone}
                        </a>
                      )}
                      {i.email && (
                        <a className="inline-flex items-center gap-1 text-slate-600 hover:text-marque-700" href={`mailto:${i.email}`}>
                          <Mail size={11} /> {i.email}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="carte p-4">
            <h2 className="mb-3 font-semibold">Activité récente</h2>
            {dossier.activites.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune activité.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {dossier.activites.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="text-slate-700">{a.message}</span>
                    <span className="shrink-0 text-xs text-slate-400">{new Date(a.created_at).toLocaleDateString("fr-FR")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FriseDelais({ dossier }: { dossier: PropsOnglet["dossier"] }) {
  const s = syntheseMarche(dossier.marche, dossier.ordres, [], [], [], []);
  const d = s.delais;
  if (!d.dateDemarrage || !d.finPrevue) {
    return (
      <div className="carte p-4">
        <h2 className="mb-2 font-semibold">Échéancier</h2>
        <p className="text-sm text-slate-500">Saisissez l&apos;OS de démarrage (onglet Délais et OS) ou une date de début pour afficher l&apos;échéancier.</p>
      </div>
    );
  }
  const debut = d.dateDemarrage.getTime();
  const fin = Math.max(d.finPrevue.getTime(), s.aujourdhui.getTime());
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - debut) / (fin - debut || 1)) * 100))}%`;
  const reperes = [
    ...dossier.ordres
      .filter((o) => dateEffetOS(o))
      .map((o) => ({ t: dateEffetOS(o)!.getTime(), label: `${TYPES_OS[o.type]}${o.numero ? ` (${o.numero})` : ""}`, couleur: COULEUR_OS[o.type] })),
    { t: d.finContractuelle!.getTime(), label: "Fin contractuelle", couleur: "bg-slate-800" },
    { t: d.finPrevue.getTime(), label: "Fin prévue", couleur: s.enRetard ? "bg-red-600" : "bg-marque-700" },
  ].sort((a, b) => a.t - b.t);

  return (
    <div className="carte p-4">
      <h2 className="mb-4 font-semibold">Échéancier</h2>
      <div className="relative mx-2 mb-2 h-3 rounded-full bg-slate-100">
        {d.arrets.map((a, i) => (
          <div
            key={i}
            className="absolute top-0 h-3 bg-red-200"
            style={{ left: pos(a.debut.getTime()), width: `calc(${pos((a.fin ?? s.aujourdhui).getTime())} - ${pos(a.debut.getTime())})` }}
            title="Période d'arrêt"
          />
        ))}
        <div className="absolute top-0 h-3 rounded-l-full bg-marque-500/30" style={{ width: pos(s.aujourdhui.getTime()) }} />
        <div className="absolute -top-1.5 h-6 w-0.5 bg-slate-900" style={{ left: pos(s.aujourdhui.getTime()) }} title="Aujourd'hui" />
        {reperes.map((r, i) => (
          <div key={i} className={`absolute top-0.5 h-2 w-2 -translate-x-1 rounded-full ring-2 ring-white ${r.couleur}`} style={{ left: pos(r.t) }} title={r.label} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{formatDate(d.dateDemarrage)}</span>
        <span>Aujourd&apos;hui : {formatDate(s.aujourdhui)}</span>
        <span>{formatDate(new Date(fin))}</span>
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {reperes.map((r, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${r.couleur}`} />
            <span className="text-slate-500 tabular-nums">{formatDate(new Date(r.t))}</span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

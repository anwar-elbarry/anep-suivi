"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatDate } from "@/lib/calculs";
import { supprimer, supprimerFichier } from "@/lib/donnees";
import type { PvReunion } from "@/lib/types";
import { BoutonScan } from "../BoutonScan";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { Vide } from "../ui";
import type { PropsOnglet } from "./types";

const CHAMPS: DefChamp[] = [
  { cle: "numero", label: "N° du PV", requis: true },
  { cle: "date", label: "Date de la réunion", type: "date" },
  { cle: "participants", label: "Participants", type: "zone" },
  { cle: "decisions", label: "Décisions", type: "zone" },
  { cle: "actions", label: "Actions (qui, quoi, pour quand)", type: "zone" },
];

export function OngletPv({ dossier, recharger }: PropsOnglet) {
  const [edite, setEdite] = useState<Partial<PvReunion> | null>(null);
  const pvs = [...dossier.pvs].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <section>
      <div className="mb-3 flex justify-end">
        <button className="btn-primaire" onClick={() => setEdite({ numero: String(pvs.length + 1) })}>
          <Plus size={15} /> Nouveau PV
        </button>
      </div>
      {pvs.length === 0 ? (
        <Vide>Aucun PV de réunion de chantier.</Vide>
      ) : (
        <div className="space-y-3">
          {pvs.map((p) => (
            <article key={p.id} className="carte p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">
                  PV n° {p.numero} <span className="font-normal text-slate-500">· {formatDate(p.date)}</span>
                </h3>
                <div className="flex items-center">
                  <BoutonScan table="pv_reunions" id={p.id} marcheId={dossier.marche.id} chemin={p.scan_path} onChange={recharger} />
                  <button className="btn-icone" aria-label="Modifier" onClick={() => setEdite(p)}>
                    <Pencil size={15} />
                  </button>
                  <button
                    className="btn-icone hover:text-red-600"
                    aria-label="Supprimer"
                    onClick={async () => {
                      if (confirm(`Supprimer le PV n° ${p.numero} ?`)) {
                        await supprimer("pv_reunions", p.id);
                        await supprimerFichier(p.scan_path);
                        recharger();
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <dl className="mt-2 grid gap-3 text-sm md:grid-cols-3">
                {(
                  [
                    ["Participants", p.participants],
                    ["Décisions", p.decisions],
                    ["Actions", p.actions],
                  ] as const
                ).map(([t, v]) => (
                  <div key={t}>
                    <dt className="etiquette">{t}</dt>
                    <dd className="whitespace-pre-line text-slate-700">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      )}
      {edite && (
        <FormulaireLigne
          titre={edite.id ? "Modifier le PV" : "Nouveau PV de réunion"}
          table="pv_reunions"
          champs={CHAMPS}
          marcheId={dossier.marche.id}
          initial={edite}
          onFermer={() => setEdite(null)}
          onEnregistre={recharger}
        />
      )}
    </section>
  );
}

"use client";
import { Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { supprimer } from "@/lib/donnees";
import { ROLES_INTERVENANT, type Intervenant } from "@/lib/types";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { Vide } from "../ui";
import type { PropsOnglet } from "./types";

const CHAMPS: DefChamp[] = [
  { cle: "role", label: "Rôle", type: "liste", options: ROLES_INTERVENANT },
  { cle: "organisme", label: "Organisme / société" },
  { cle: "nom", label: "Nom du contact", requis: true, large: true },
  { cle: "telephone", label: "Téléphone", type: "tel" },
  { cle: "email", label: "E-mail", type: "email" },
];

export function OngletIntervenants({ dossier, recharger }: PropsOnglet) {
  const [edite, setEdite] = useState<Partial<Intervenant> | null>(null);
  const liste = [...dossier.intervenants].sort(
    (a, b) => ROLES_INTERVENANT.indexOf(a.role as never) - ROLES_INTERVENANT.indexOf(b.role as never),
  );

  return (
    <section>
      <div className="mb-3 flex justify-end">
        <button className="btn-primaire" onClick={() => setEdite({})}>
          <Plus size={15} /> Ajouter un intervenant
        </button>
      </div>
      {liste.length === 0 ? (
        <Vide>Aucun intervenant : maître d&apos;ouvrage, BET, entreprise, contrôle technique, laboratoire…</Vide>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {liste.map((i) => (
            <div key={i.id} className="carte p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-marque-700">{i.role}</div>
                  <div className="font-medium">{i.nom}</div>
                  {i.organisme && <div className="text-sm text-slate-600">{i.organisme}</div>}
                </div>
                <div className="flex">
                  <button className="btn-icone" aria-label="Modifier" onClick={() => setEdite(i)}>
                    <Pencil size={15} />
                  </button>
                  <button
                    className="btn-icone hover:text-rouge-fonce"
                    aria-label="Supprimer"
                    onClick={async () => {
                      if (confirm(`Supprimer ${i.nom} ?`)) {
                        await supprimer("intervenants", i.id);
                        recharger();
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                {i.telephone && (
                  <a href={`tel:${i.telephone}`} className="flex items-center gap-1.5 text-slate-700 hover:text-marque-700">
                    <Phone size={13} /> {i.telephone}
                  </a>
                )}
                {i.email && (
                  <a href={`mailto:${i.email}`} className="flex items-center gap-1.5 text-slate-700 hover:text-marque-700">
                    <Mail size={13} /> {i.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {edite && (
        <FormulaireLigne
          titre={edite.id ? "Modifier l'intervenant" : "Nouvel intervenant"}
          table="intervenants"
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

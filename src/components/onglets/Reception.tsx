"use client";
import { Check, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { aujourdhuiUtc, calculerReception, formatDate, reserveEnRetard, versIso } from "@/lib/calculs";
import { modifier, supprimer, supprimerFichier } from "@/lib/donnees";
import { STATUTS_RESERVE, type Reserve } from "@/lib/types";
import { BoutonScan } from "../BoutonScan";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { ParametreDate, ParametreNombre } from "../ParametreMarche";
import { Chiffre, Vide } from "../ui";
import type { PropsOnglet } from "./types";

const CHAMPS: DefChamp[] = [
  { cle: "numero", label: "N°" },
  { cle: "statut", label: "Statut", type: "liste", options: STATUTS_RESERVE },
  { cle: "designation", label: "Réserve", requis: true, large: true },
  { cle: "localisation", label: "Localisation (bâtiment, niveau, local)" },
  { cle: "responsable", label: "À lever par" },
  { cle: "date_constat", label: "Date de constat", type: "date" },
  { cle: "echeance", label: "Délai de levée", type: "date" },
  { cle: "date_levee", label: "Date de levée", type: "date" },
  { cle: "observations", label: "Observations", type: "zone" },
];

export function OngletReception({ dossier, recharger }: PropsOnglet) {
  const { marche } = dossier;
  const [edite, setEdite] = useState<Partial<Reserve> | null>(null);
  const [filtre, setFiltre] = useState<"" | "Ouverte" | "Levée">("Ouverte");
  const auj = aujourdhuiUtc();
  const rec = calculerReception(marche, dossier.reserves, auj);
  const reserves = dossier.reserves
    .filter((r) => !filtre || r.statut === filtre)
    .sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }));

  async function basculer(r: Reserve) {
    const levee = r.statut === "Ouverte";
    await modifier("reserves", r.id, { statut: levee ? "Levée" : "Ouverte", date_levee: levee ? versIso(auj) : null });
    recharger();
  }

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chiffre label="Réception provisoire" valeur={formatDate(rec.dateProvisoire)} />
        <Chiffre
          label="Réception définitive"
          valeur={formatDate(rec.dateDefinitive)}
          sous={
            rec.definitivePrononcee
              ? "prononcée"
              : rec.joursAvantDefinitive !== null
                ? rec.joursAvantDefinitive < 0
                  ? `prévue, dépassée de ${-rec.joursAvantDefinitive} j`
                  : `prévue, dans ${rec.joursAvantDefinitive} j`
                : !rec.dateProvisoire
                  ? "réception provisoire à saisir"
                  : "délai de garantie à saisir"
          }
        />
        <Chiffre label="Réserves ouvertes" valeur={rec.ouvertes} sous={`${rec.levees} levée(s)`} alerte={rec.ouvertes > 0} />
        <Chiffre label="Réserves hors délai" valeur={rec.enRetard} alerte={rec.enRetard > 0} />
      </div>

      <div className="carte p-4">
        <h2 className="mb-3 font-semibold">Réception</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ParametreDate marche={marche} cle="date_reception_provisoire" label="Date de réception provisoire" recharger={recharger} aide="arrête aussi le retard" />
          <ParametreNombre marche={marche} cle="delai_garantie_mois" label="Délai de garantie (mois)" recharger={recharger} aide="selon le CPS" />
          <ParametreDate marche={marche} cle="date_reception_definitive" label="Réception définitive prononcée le" recharger={recharger} />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          À la réception définitive : vérifier la levée de toutes les réserves, puis la restitution de la retenue de garantie et la mainlevée des
          cautions (onglet Garanties), dans les conditions du CPS.
        </p>
      </div>

      <div className="carte overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="font-semibold">Réserves</h2>
          <div className="flex items-center gap-2">
            <select className="champ w-auto py-1" value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)} aria-label="Filtrer les réserves">
              <option value="Ouverte">Ouvertes</option>
              <option value="Levée">Levées</option>
              <option value="">Toutes</option>
            </select>
            <button
              className="btn-primaire"
              onClick={() =>
                setEdite({
                  numero: String(dossier.reserves.length + 1),
                  statut: "Ouverte",
                  responsable: "Entreprise",
                  date_constat: marche.date_reception_provisoire ?? versIso(auj),
                })
              }
            >
              <Plus size={15} /> Ajouter une réserve
            </button>
          </div>
        </div>
        {reserves.length === 0 ? (
          <div className="p-4">
            <Vide>{dossier.reserves.length ? "Aucune réserve pour ce filtre." : "Aucune réserve enregistrée."}</Vide>
          </div>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th>N°</th>
                <th>Réserve</th>
                <th>Localisation</th>
                <th>Par</th>
                <th>Délai</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reserves.map((r) => {
                const retard = reserveEnRetard(r, auj);
                return (
                  <tr key={r.id} className={retard ? "bg-rouge-pale/60" : ""}>
                    <td>{r.numero}</td>
                    <td>
                      <div className="font-medium">{r.designation}</div>
                      {r.observations && <div className="text-xs text-slate-500">{r.observations}</div>}
                    </td>
                    <td>{r.localisation || "—"}</td>
                    <td>{r.responsable}</td>
                    <td className={retard ? "font-semibold text-rouge-fonce" : ""}>{formatDate(r.echeance)}</td>
                    <td>
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.statut === "Levée" ? "bg-bleu-pale text-bleu-texte" : "bg-bleu-pale text-bleu-texte"
                        }`}
                      >
                        {r.statut}
                        {r.statut === "Levée" && r.date_levee ? ` le ${formatDate(r.date_levee)}` : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        className="btn-icone"
                        title={r.statut === "Ouverte" ? "Lever la réserve (date du jour)" : "Rouvrir la réserve"}
                        aria-label={r.statut === "Ouverte" ? "Lever la réserve" : "Rouvrir la réserve"}
                        onClick={() => basculer(r)}
                      >
                        {r.statut === "Ouverte" ? <Check size={16} className="text-bleu-texte" /> : <RotateCcw size={15} />}
                      </button>
                      <BoutonScan table="reserves" id={r.id} marcheId={marche.id} chemin={r.scan_path} onChange={recharger} />
                      <button className="btn-icone" aria-label="Modifier" onClick={() => setEdite(r)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="btn-icone hover:text-rouge-fonce"
                        aria-label="Supprimer"
                        onClick={async () => {
                          if (confirm(`Supprimer la réserve n° ${r.numero} ?`)) {
                            await supprimer("reserves", r.id);
                            await supprimerFichier(r.scan_path);
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
          titre={edite.id ? "Modifier la réserve" : "Nouvelle réserve"}
          table="reserves"
          champs={CHAMPS}
          marcheId={marche.id}
          initial={edite}
          onFermer={() => setEdite(null)}
          onEnregistre={recharger}
          avant={(v) => ({ ...v, date_levee: v.statut === "Levée" ? v.date_levee || versIso(auj) : null })}
        />
      )}
    </section>
  );
}

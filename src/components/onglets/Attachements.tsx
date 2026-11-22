"use client";
import { ChevronDown, ChevronRight, FileSpreadsheet, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { formatDate, formatMontant, formatQte, trouverLigneBpde } from "@/lib/calculs";
import { appelerIA, inserer, supprimer, supabaseClient } from "@/lib/donnees";
import { lireExcel, type ResultatImport } from "@/lib/excel";
import { STATUTS_ATTACHEMENT, type Attachement, type PropositionDocument } from "@/lib/types";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { PropositionsIA } from "../PropositionsIA";
import { Erreur, Modal, Vide } from "../ui";
import type { PropsOnglet } from "./types";

const CHAMPS: DefChamp[] = [
  { cle: "numero", label: "N° de l'attachement", requis: true },
  { cle: "statut", label: "Statut", type: "liste", options: STATUTS_ATTACHEMENT },
  { cle: "periode", label: "Période (ex. mars 2026)" },
  { cle: "date", label: "Date", type: "date" },
  { cle: "montant", label: "Montant déclaré (TTC)", type: "nombre" },
  { cle: "observations", label: "Observations", type: "zone" },
];

const COULEURS: Record<string, string> = {
  "En attente": "bg-amber-100 text-amber-800",
  Validé: "bg-emerald-100 text-emerald-800",
  Rejeté: "bg-red-100 text-red-800",
};

export function OngletAttachements({ dossier, recharger, allerA }: PropsOnglet) {
  const [edite, setEdite] = useState<Partial<Attachement> | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [import_, setImport] = useState<{ att: Attachement; res: ResultatImport } | null>(null);
  const [propositions, setPropositions] = useState<PropositionDocument[] | null>(null);
  const [analyse, setAnalyse] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const entree = useRef<HTMLInputElement>(null);
  const cible = useRef<Attachement | null>(null);
  const atts = [...dossier.attachements].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  async function lire(f: File) {
    setErreur(null);
    try {
      const res = await lireExcel(f);
      if (cible.current) setImport({ att: cible.current, res });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  async function demanderDocuments(att: Attachement) {
    const lignes = att.attachement_lignes ?? [];
    if (!lignes.length) {
      setErreur("Importez d'abord les prestations de l'attachement (fichier Excel).");
      return;
    }
    setErreur(null);
    setAnalyse(`Claude analyse les ${lignes.length} prestation(s) de l'attachement n° ${att.numero}…`);
    try {
      const vues = new Set<string>();
      const prestations = lignes
        .filter((l) => {
          const k = l.designation.toLowerCase();
          if (vues.has(k)) return false;
          vues.add(k);
          return true;
        })
        .map((l) => ({ designation: l.designation, unite: l.unite }));
      setPropositions(await appelerIA("documents-attachement", { marcheId: dossier.marche.id, prestations }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyse(null);
    }
  }

  return (
    <section>
      <Erreur message={erreur} />
      {analyse && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-marque-100 bg-marque-50 px-3 py-2 text-sm text-marque-700">
          <Sparkles size={15} className="animate-pulse" /> {analyse}
        </div>
      )}
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Attachements {dossier.marche.attachements_cumulatifs ? "cumulatifs (le dernier fait foi)" : "mensuels (quantités additionnées)"} — réglage dans{" "}
          <button className="text-marque-700 hover:underline" onClick={() => allerA("physique")}>
            État physique
          </button>
          .
        </p>
        <button className="btn-primaire" onClick={() => setEdite({ numero: String(atts.length + 1), statut: "En attente" })}>
          <Plus size={15} /> Nouvel attachement
        </button>
      </div>

      <input
        ref={entree}
        type="file"
        accept=".xlsx,.xls,.xlsm,.csv,.ods"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) lire(f);
        }}
      />

      {atts.length === 0 ? (
        <Vide>Aucun attachement. Créez-le, puis importez le fichier Excel (prestations, unités, quantités).</Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="tableau">
            <thead>
              <tr>
                <th className="w-8" />
                <th>N°</th>
                <th>Période</th>
                <th>Date</th>
                <th className="num">Montant</th>
                <th className="num">Lignes</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {atts.map((a) => {
                const lignes = a.attachement_lignes ?? [];
                const nonRapp = lignes.filter((l) => !trouverLigneBpde(l, dossier.bpde)).length;
                return (
                  <Fragment key={a.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOuvert(ouvert === a.id ? null : a.id)}>
                      <td>{ouvert === a.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                      <td className="font-medium">{a.numero}</td>
                      <td>{a.periode || "—"}</td>
                      <td>{formatDate(a.date)}</td>
                      <td className="num">{formatMontant(a.montant)}</td>
                      <td className="num">
                        {lignes.length}
                        {nonRapp > 0 && <span className="ml-1 text-xs text-amber-700">({nonRapp} non rapprochée(s))</span>}
                      </td>
                      <td>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COULEURS[a.statut]}`}>{a.statut}</span>
                      </td>
                      <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-icone"
                          title="Importer les prestations (Excel)"
                          aria-label="Importer Excel"
                          onClick={() => {
                            cible.current = a;
                            entree.current?.click();
                          }}
                        >
                          <FileSpreadsheet size={15} />
                        </button>
                        <button className="btn-icone" title="Documents requis par ces prestations (Claude)" aria-label="Documents requis" onClick={() => demanderDocuments(a)} disabled={!!analyse}>
                          <Sparkles size={15} />
                        </button>
                        <button className="btn-icone" aria-label="Modifier" onClick={() => setEdite(a)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="btn-icone hover:text-red-600"
                          aria-label="Supprimer"
                          onClick={async () => {
                            if (confirm(`Supprimer l'attachement n° ${a.numero} et ses lignes ?`)) {
                              await supprimer("attachements", a.id);
                              recharger();
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                    {ouvert === a.id && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50/60 p-3">
                          {lignes.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              Aucune prestation. Utilisez <FileSpreadsheet size={13} className="inline" /> pour importer le fichier Excel.
                            </p>
                          ) : (
                            <table className="tableau rounded bg-white">
                              <thead>
                                <tr>
                                  <th>N°</th>
                                  <th>Désignation</th>
                                  <th>Unité</th>
                                  <th className="num">Quantité</th>
                                  <th>Ligne BPDE</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lignes.map((l) => {
                                  const b = trouverLigneBpde(l, dossier.bpde);
                                  return (
                                    <tr key={l.id}>
                                      <td>{l.numero}</td>
                                      <td>{l.designation}</td>
                                      <td>{l.unite}</td>
                                      <td className="num">{formatQte(Number(l.quantite))}</td>
                                      <td className={b ? "text-emerald-700" : "text-amber-700"}>{b ? `Prix n° ${b.numero || "?"}` : "Non rapprochée"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                          {a.observations && <p className="mt-2 text-sm text-slate-600">{a.observations}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {edite && (
        <FormulaireLigne
          titre={edite.id ? "Modifier l'attachement" : "Nouvel attachement"}
          table="attachements"
          champs={CHAMPS}
          marcheId={dossier.marche.id}
          initial={edite as Record<string, unknown>}
          onFermer={() => setEdite(null)}
          onEnregistre={recharger}
          avant={(v) => {
            delete v.attachement_lignes;
            if (v.montant === 0) v.montant = null;
            return v;
          }}
        />
      )}
      {import_ && (
        <ApercuImport
          {...import_}
          dossier={dossier}
          onFermer={() => setImport(null)}
          onImporte={async () => {
            setOuvert(import_.att.id);
            await recharger();
          }}
        />
      )}
      {propositions && (
        <PropositionsIA
          propositions={propositions}
          existants={dossier.documents}
          source="attachement"
          marcheId={dossier.marche.id}
          onFermer={() => setPropositions(null)}
          onAjoute={recharger}
        />
      )}
    </section>
  );
}

function ApercuImport({
  att,
  res,
  dossier,
  onFermer,
  onImporte,
}: {
  att: Attachement;
  res: ResultatImport;
  dossier: PropsOnglet["dossier"];
  onFermer: () => void;
  onImporte: () => Promise<void>;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const remplace = (att.attachement_lignes ?? []).length > 0;
  const nonRapp = res.lignes.filter((l) => !trouverLigneBpde(l, dossier.bpde)).length;

  async function valider() {
    setEnvoi(true);
    setErreur(null);
    try {
      if (remplace) {
        const { error } = await supabaseClient().from("attachement_lignes").delete().eq("attachement_id", att.id);
        if (error) throw new Error(error.message);
      }
      await inserer(
        "attachement_lignes",
        res.lignes.map((l, i) => ({
          attachement_id: att.id,
          ordre: i,
          numero: l.numero,
          designation: l.designation,
          unite: l.unite,
          quantite: l.quantite,
        })),
      );
      await onImporte();
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal titre={`Import Excel — attachement n° ${att.numero}`} ouvert onFermer={onFermer} large>
      <Erreur message={erreur} />
      <p className="mb-2 text-sm text-slate-600">
        Feuille « {res.feuille} » : {res.lignes.length} ligne(s) lue(s)
        {dossier.bpde.length ? `, ${nonRapp} non rapprochée(s) du BPDE` : " — BPDE non importé : les lignes ne pourront pas être valorisées"}.
        {remplace && " Les lignes actuelles de l'attachement seront remplacées."}
      </p>
      {res.avertissements.map((a) => (
        <p key={a} className="mb-1 text-sm text-amber-700">
          • {a}
        </p>
      ))}
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
        <table className="tableau">
          <thead className="sticky top-0">
            <tr>
              <th>N°</th>
              <th>Désignation</th>
              <th>Unité</th>
              <th className="num">Quantité</th>
              <th>BPDE</th>
            </tr>
          </thead>
          <tbody>
            {res.lignes.map((l, i) => {
              const b = trouverLigneBpde(l, dossier.bpde);
              return (
                <tr key={i}>
                  <td>{l.numero}</td>
                  <td>{l.designation}</td>
                  <td>{l.unite}</td>
                  <td className="num">{formatQte(l.quantite)}</td>
                  <td className={b ? "text-emerald-700" : "text-amber-700"}>{b ? `n° ${b.numero || "?"}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onFermer}>
          Annuler
        </button>
        <button className="btn-primaire" onClick={valider} disabled={envoi || !res.lignes.length}>
          {envoi ? "Import…" : `Importer ${res.lignes.length} ligne(s)`}
        </button>
      </div>
    </Modal>
  );
}

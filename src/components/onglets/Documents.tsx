"use client";
import { FileSearch, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { aujourdhuiUtc, documentEnRetard, formatDate } from "@/lib/calculs";
import { appelerIA, modifier, supprimer, supprimerFichier, televerser } from "@/lib/donnees";
import { STATUTS_DOCUMENT, type DocumentAFournir, type PropositionDocument, type StatutDocument } from "@/lib/types";
import { BoutonScan } from "../BoutonScan";
import { FormulaireLigne, type DefChamp } from "../FormulaireLigne";
import { PropositionsIA } from "../PropositionsIA";
import { COULEURS_DOC, Erreur, Vide } from "../ui";
import type { PropsOnglet } from "./types";

const CHAMPS: DefChamp[] = [
  { cle: "nom", label: "Document", requis: true, large: true },
  { cle: "responsable", label: "À fournir par" },
  { cle: "echeance", label: "Échéance", type: "date" },
  { cle: "statut", label: "Statut", type: "liste", options: STATUTS_DOCUMENT },
  { cle: "prestation", label: "Prestation / lot" },
  { cle: "article_cps", label: "Article du CPS" },
  { cle: "observations", label: "Observations", type: "zone" },
];

export function OngletDocuments({ dossier, recharger }: PropsOnglet) {
  const [edite, setEdite] = useState<Partial<DocumentAFournir> | null>(null);
  const [filtre, setFiltre] = useState<"" | StatutDocument | "retard">("");
  const [propositions, setPropositions] = useState<PropositionDocument[] | null>(null);
  const [analyse, setAnalyse] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const entreeCps = useRef<HTMLInputElement>(null);
  const auj = aujourdhuiUtc();

  const docs = useMemo(
    () =>
      dossier.documents
        .filter((d) => !filtre || (filtre === "retard" ? documentEnRetard(d, auj) : d.statut === filtre))
        .sort((a, b) => (a.echeance ?? "9999").localeCompare(b.echeance ?? "9999")),
    [dossier.documents, filtre, auj],
  );
  const compte = (s: StatutDocument) => dossier.documents.filter((d) => d.statut === s).length;
  const nbRetard = dossier.documents.filter((d) => documentEnRetard(d, auj)).length;

  async function importerCps(f: File) {
    setErreur(null);
    const ext = f.name.toLowerCase().split(".").pop();
    if (!["pdf", "docx", "txt"].includes(ext ?? "")) {
      setErreur("Format non pris en charge : PDF, Word (.docx) ou texte. Les anciens fichiers .doc doivent être enregistrés en .docx.");
      return;
    }
    try {
      setAnalyse("Envoi du CPS…");
      const chemin = await televerser(dossier.marche.id, "cps", f);
      setAnalyse("Claude lit le CPS et recense les documents exigés… (jusqu'à quelques minutes)");
      try {
        setPropositions(await appelerIA("documents-cps", { marcheId: dossier.marche.id, chemin }));
      } finally {
        await supprimerFichier(chemin); // le CPS n'est pas conservé
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyse(null);
    }
  }

  async function changerStatut(d: DocumentAFournir, statut: StatutDocument) {
    await modifier("documents", d.id, { statut });
    recharger();
  }

  return (
    <section>
      <Erreur message={erreur} />
      {analyse && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-marque-100 bg-marque-50 px-3 py-2 text-sm text-marque-700">
          <Sparkles size={15} className="animate-pulse" /> {analyse}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          <FiltreBouton actif={filtre === ""} onClick={() => setFiltre("")}>
            Tous ({dossier.documents.length})
          </FiltreBouton>
          {STATUTS_DOCUMENT.map((s) => (
            <FiltreBouton key={s} actif={filtre === s} onClick={() => setFiltre(s)}>
              {s} ({compte(s)})
            </FiltreBouton>
          ))}
          <FiltreBouton actif={filtre === "retard"} onClick={() => setFiltre("retard")} alerte={nbRetard > 0}>
            En retard ({nbRetard})
          </FiltreBouton>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => entreeCps.current?.click()} disabled={!!analyse} title="PDF, Word (.docx) ou texte">
            <FileSearch size={15} /> Importer le CPS
          </button>
          <input
            ref={entreeCps}
            type="file"
            accept=".pdf,.docx,.txt"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) importerCps(f);
            }}
          />
          <button className="btn-primaire" onClick={() => setEdite({})}>
            <Plus size={15} /> Ajouter
          </button>
        </div>
      </div>

      {docs.length === 0 ? (
        <Vide>
          {dossier.documents.length
            ? "Aucun document pour ce filtre."
            : "Aucun document. Importez le CPS pour générer la liste, ou demandez les documents depuis un attachement."}
        </Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="tableau">
            <thead>
              <tr>
                <th>Document</th>
                <th>Prestation</th>
                <th>Art. CPS</th>
                <th>Par</th>
                <th>Échéance</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const retard = documentEnRetard(d, auj);
                return (
                  <tr key={d.id} className={retard ? "bg-red-50/60" : ""}>
                    <td>
                      <div className="font-medium">{d.nom}</div>
                      {d.observations && <div className="text-xs text-slate-500">{d.observations}</div>}
                    </td>
                    <td className="text-slate-600">{d.prestation || "—"}</td>
                    <td className="whitespace-nowrap text-slate-600">{d.article_cps || "—"}</td>
                    <td className="text-slate-600">{d.responsable}</td>
                    <td className={`whitespace-nowrap ${retard ? "font-semibold text-red-600" : ""}`}>{formatDate(d.echeance)}</td>
                    <td>
                      <select
                        className={`cursor-pointer rounded-full border-0 px-2 py-0.5 text-xs font-medium outline-none focus:ring-2 focus:ring-marque-100 ${COULEURS_DOC[d.statut]}`}
                        value={d.statut}
                        aria-label="Statut"
                        onChange={(e) => changerStatut(d, e.target.value as StatutDocument)}
                      >
                        {STATUTS_DOCUMENT.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <BoutonScan table="documents" id={d.id} marcheId={dossier.marche.id} chemin={d.scan_path} onChange={recharger} />
                      <button className="btn-icone" aria-label="Modifier" onClick={() => setEdite(d)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="btn-icone hover:text-red-600"
                        aria-label="Supprimer"
                        onClick={async () => {
                          if (confirm(`Supprimer « ${d.nom} » ?`)) {
                            await supprimer("documents", d.id);
                            await supprimerFichier(d.scan_path);
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

      {edite && (
        <FormulaireLigne
          titre={edite.id ? "Modifier le document" : "Nouveau document à fournir"}
          table="documents"
          champs={CHAMPS}
          marcheId={dossier.marche.id}
          initial={{ responsable: "Entreprise", ...edite }}
          onFermer={() => setEdite(null)}
          onEnregistre={recharger}
        />
      )}
      {propositions && (
        <PropositionsIA
          propositions={propositions}
          existants={dossier.documents}
          source="cps"
          marcheId={dossier.marche.id}
          onFermer={() => setPropositions(null)}
          onAjoute={recharger}
        />
      )}
    </section>
  );
}

function FiltreBouton({ actif, alerte, onClick, children }: { actif: boolean; alerte?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        actif ? "bg-slate-800 text-white" : alerte ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

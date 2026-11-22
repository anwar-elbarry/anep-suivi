"use client";
import { useMemo, useState } from "react";
import { inserer, normaliserPourDoublon } from "@/lib/donnees";
import type { DocumentAFournir, PropositionDocument } from "@/lib/types";
import { Champ, Erreur, Modal } from "./ui";

/** Relecture des documents proposés par Claude : rien n'est ajouté avant validation. */
export function PropositionsIA({
  propositions,
  existants,
  source,
  marcheId,
  onFermer,
  onAjoute,
}: {
  propositions: PropositionDocument[];
  existants: DocumentAFournir[];
  source: "cps" | "attachement";
  marcheId: string;
  onFermer: () => void;
  onAjoute: () => void;
}) {
  const dejaLa = useMemo(() => new Set(existants.map((d) => normaliserPourDoublon(d.nom))), [existants]);
  const [choix, setChoix] = useState<boolean[]>(() => propositions.map((p) => !dejaLa.has(normaliserPourDoublon(p.nom))));
  const [echeance, setEcheance] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const nb = choix.filter(Boolean).length;

  async function ajouter() {
    setEnvoi(true);
    setErreur(null);
    try {
      const lignes = propositions
        .filter((_, i) => choix[i])
        .map((p) => ({
          marche_id: marcheId,
          nom: p.nom,
          prestation: p.prestation,
          article_cps: p.article_cps ?? "",
          observations: p.justification,
          source,
          responsable: "Entreprise",
          echeance: echeance || null,
        }));
      if (lignes.length) await inserer("documents", lignes);
      onAjoute();
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal titre={`Documents proposés par Claude (${propositions.length})`} ouvert onFermer={onFermer} large>
      <Erreur message={erreur} />
      <p className="mb-3 text-sm text-slate-600">
        Ce sont des suggestions : vérifiez-les au regard du CPS et des pièces du marché. Les documents déjà présents sont décochés.
      </p>
      <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200">
        <table className="tableau">
          <thead className="sticky top-0">
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner"
                  checked={nb === propositions.length}
                  onChange={(e) => setChoix(propositions.map(() => e.target.checked))}
                />
              </th>
              <th>Document</th>
              <th>Prestation</th>
              <th>Article CPS</th>
              <th>Motif</th>
            </tr>
          </thead>
          <tbody>
            {propositions.map((p, i) => (
              <tr key={i} className={choix[i] ? "" : "opacity-50"}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Retenir ${p.nom}`}
                    checked={choix[i]}
                    onChange={(e) => setChoix(choix.map((c, j) => (j === i ? e.target.checked : c)))}
                  />
                </td>
                <td className="font-medium">
                  {p.nom}
                  {dejaLa.has(normaliserPourDoublon(p.nom)) && <span className="ml-2 text-xs text-amber-700">(déjà dans la liste)</span>}
                </td>
                <td>{p.prestation}</td>
                <td className="whitespace-nowrap">{p.article_cps ?? "—"}</td>
                <td className="text-slate-600">{p.justification}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <Champ label="Échéance à appliquer (facultatif)">
          <input className="champ" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
        </Champ>
        <div className="flex gap-2">
          <button className="btn" onClick={onFermer}>
            Annuler
          </button>
          <button className="btn-primaire" disabled={envoi || nb === 0} onClick={ajouter}>
            {envoi ? "Ajout…" : `Ajouter ${nb} document(s)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

"use client";
import { FileSpreadsheet } from "lucide-react";
import { useRef, useState } from "react";
import { formatMontant, formatQte } from "@/lib/calculs";
import { inserer, supprimerParMarche } from "@/lib/donnees";
import { lireExcel, type ResultatImport } from "@/lib/excel";
import { Erreur, Modal } from "./ui";

/** Bouton + aperçu d'import du BPDE depuis Excel (remplace le BPDE existant). */
export function ImportBpde({ marcheId, nbExistant, onImporte }: { marcheId: string; nbExistant: number; onImporte: () => void }) {
  const entree = useRef<HTMLInputElement>(null);
  const [res, setRes] = useState<ResultatImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function valider() {
    if (!res) return;
    setEnvoi(true);
    setErreur(null);
    try {
      if (nbExistant) await supprimerParMarche("bpde_lignes", marcheId);
      await inserer(
        "bpde_lignes",
        res.lignes.map((l, i) => ({
          marche_id: marcheId,
          ordre: i,
          numero: l.numero,
          designation: l.designation,
          unite: l.unite,
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire,
          montant_importe: l.montant,
        })),
      );
      setRes(null);
      onImporte();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  }

  const total = res?.lignes.reduce((s, l) => s + l.quantite * (l.prix_unitaire ?? 0), 0) ?? 0;

  return (
    <>
      <button className="btn" onClick={() => entree.current?.click()}>
        <FileSpreadsheet size={15} /> Importer le BPDE (Excel)
      </button>
      <input
        ref={entree}
        type="file"
        accept=".xlsx,.xls,.xlsm,.csv,.ods"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setErreur(null);
          try {
            setRes(await lireExcel(f));
          } catch (err) {
            setErreur(err instanceof Error ? err.message : String(err));
            setRes({ lignes: [], feuille: "", colonnes: {}, avertissements: [] });
          }
        }}
      />
      {res && (
        <Modal titre="Import du BPDE" ouvert onFermer={() => setRes(null)} large>
          <Erreur message={erreur} />
          {res.lignes.length > 0 && (
            <>
              <p className="mb-2 text-sm text-slate-600">
                Feuille « {res.feuille} » : {res.lignes.length} ligne(s), total HT {formatMontant(total)}.
                {nbExistant > 0 && <strong className="text-bleu-texte"> Le BPDE actuel ({nbExistant} lignes) sera remplacé.</strong>}
              </p>
              {res.colonnes.prix_unitaire === undefined && (
                <p className="mb-1 text-sm text-bleu-texte">• Pas de colonne « Prix unitaire » : les prix seront à saisir dans l&apos;onglet BPDE et prix.</p>
              )}
              {res.avertissements.map((a) => (
                <p key={a} className="mb-1 text-sm text-bleu-texte">
                  • {a}
                </p>
              ))}
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
                <table className="tableau">
                  <thead className="sticky top-0">
                    <tr>
                      <th>N°</th>
                      <th>Désignation</th>
                      <th>U</th>
                      <th className="num">Quantité</th>
                      <th className="num">PU HT</th>
                      <th className="num">Montant HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.lignes.map((l, i) => (
                      <tr key={i}>
                        <td>{l.numero}</td>
                        <td>{l.designation}</td>
                        <td>{l.unite}</td>
                        <td className="num">{formatQte(l.quantite)}</td>
                        <td className={`num ${l.prix_unitaire === null ? "text-rouge-fonce" : ""}`}>{formatMontant(l.prix_unitaire)}</td>
                        <td className="num">{formatMontant(l.montant ?? l.quantite * (l.prix_unitaire ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn" onClick={() => setRes(null)}>
              Annuler
            </button>
            <button className="btn-primaire" onClick={valider} disabled={envoi || !res.lignes.length}>
              {envoi ? "Import…" : `Importer ${res.lignes.length} ligne(s)`}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

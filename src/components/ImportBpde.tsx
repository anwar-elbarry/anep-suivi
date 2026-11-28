"use client";
import { FileSpreadsheet, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { formatMontant, formatQte } from "@/lib/calculs";
import { appelerRouteIA, exigerIA, inserer, supprimerFichier, supprimerParMarche, televerser } from "@/lib/donnees";
import { excelEnTexte, lireExcel, type LigneImportee, type ResultatImport } from "@/lib/excel";
import { extensionDe } from "@/lib/fichiers";
import type { BpdeIA } from "@/lib/schemasIA";
import { Erreur, Modal } from "./ui";

const TABLEURS = ["xlsx", "xls", "xlsm", "csv", "ods"];
const SCANS = ["pdf", "jpg", "jpeg", "png", "webp"];

/** Écart entre le prix total écrit sur le bordereau et quantité × prix unitaire (erreur de lecture ou de calcul d'origine). */
function ecartMontant(l: LigneImportee): boolean {
  if (l.montant === null || l.prix_unitaire === null) return false;
  return Math.abs(l.montant - Math.round(l.quantite * l.prix_unitaire * 100) / 100) > 0.011;
}

function depuisClaude(b: BpdeIA): ResultatImport {
  const sansQuantite = b.lignes.filter((l) => l.quantite === null).length;
  return {
    lignes: b.lignes.map((l) => ({
      numero: l.numero.trim(),
      designation: l.designation.trim(),
      unite: l.unite.trim(),
      quantite: l.quantite ?? 0,
      prix_unitaire: l.prix_unitaire,
      montant: l.montant,
    })),
    feuille: "",
    colonnes: { numero: "N°", unite: "U", prix_unitaire: "PU" },
    avertissements: [
      "Lecture par Claude : contrôlez chaque ligne par rapport au bordereau signé avant d'importer.",
      ...(sansQuantite ? [`${sansQuantite} ligne(s) sans quantité lisible : quantité mise à 0, à corriger.`] : []),
      ...b.remarques,
    ],
  };
}

/** Bouton + aperçu d'import du BPDE (remplace le BPDE existant) : Excel lu directement ; PDF, scan ou photo lus par Claude. */
export function ImportBpde({ marcheId, nbExistant, onImporte }: { marcheId: string; nbExistant: number; onImporte: () => void }) {
  const entree = useRef<HTMLInputElement>(null);
  const [res, setRes] = useState<ResultatImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etat, setEtat] = useState<string | null>(null);
  /** Classeur dont les en-têtes n'ont pas été reconnus : proposé à Claude. */
  const [secours, setSecours] = useState<File | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const vide = (): ResultatImport => ({ lignes: [], feuille: "", colonnes: {}, avertissements: [] });

  async function lireAvecClaude(f: File, tableur: boolean) {
    setErreur(null);
    setSecours(null);
    try {
      await exigerIA();
      let bpde: BpdeIA;
      if (tableur) {
        setEtat("Claude lit le classeur…");
        bpde = await appelerRouteIA<BpdeIA>("bpde", { marcheId, texte: await excelEnTexte(f), nom: f.name });
      } else {
        setEtat("Envoi du bordereau…");
        const chemin = await televerser(marcheId, "bpde", f);
        setEtat("Claude lit le bordereau… (jusqu'à quelques minutes)");
        try {
          bpde = await appelerRouteIA<BpdeIA>("bpde", { marcheId, chemin });
        } finally {
          await supprimerFichier(chemin); // le fichier n'est pas conservé
        }
      }
      const lu = depuisClaude(bpde);
      if (!lu.lignes.length) setErreur(bpde.remarques[0] ?? "Aucune ligne de prix trouvée dans ce document.");
      setRes(lu);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setRes(vide());
    } finally {
      setEtat(null);
    }
  }

  async function ouvrir(f: File) {
    setErreur(null);
    setSecours(null);
    const ext = extensionDe(f.name);
    if (SCANS.includes(ext)) return lireAvecClaude(f, false);
    if (!TABLEURS.includes(ext)) {
      setErreur("Format non pris en charge : Excel (.xlsx, .xls, .csv), PDF ou photo (JPEG, PNG, WebP).");
      setRes(vide());
      return;
    }
    try {
      setRes(await lireExcel(f));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
      setSecours(f);
      setRes(vide());
    }
  }

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
  const nbEcarts = res?.lignes.filter(ecartMontant).length ?? 0;

  return (
    <>
      <button className="btn" onClick={() => entree.current?.click()} disabled={!!etat} title="Excel, PDF, scan ou photo du bordereau des prix">
        {etat ? <Sparkles size={15} className="animate-pulse" /> : <FileSpreadsheet size={15} />} {etat ?? "Importer le BPDE (Excel, PDF, scan)"}
      </button>
      <input
        ref={entree}
        type="file"
        accept=".xlsx,.xls,.xlsm,.csv,.ods,.pdf,.jpg,.jpeg,.png,.webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) ouvrir(f);
        }}
      />
      {res && (
        <Modal titre="Import du BPDE" ouvert onFermer={() => setRes(null)} large>
          <Erreur message={erreur} />
          {secours && (
            <p className="mb-3 text-sm text-slate-600">
              Les colonnes de ce classeur n&apos;ont pas été reconnues automatiquement.{" "}
              <button className="font-medium text-bleu-texte underline" onClick={() => lireAvecClaude(secours, true)} disabled={!!etat}>
                {etat ?? "Faire lire le classeur par Claude"}
              </button>
            </p>
          )}
          {res.lignes.length > 0 && (
            <>
              <p className="mb-2 text-sm text-slate-600">
                {res.feuille ? `Feuille « ${res.feuille} »` : "Bordereau lu par Claude"} : {res.lignes.length} ligne(s), total HT {formatMontant(total)}.
                {nbExistant > 0 && <strong className="text-bleu-texte"> Le BPDE actuel ({nbExistant} lignes) sera remplacé.</strong>}
              </p>
              {res.colonnes.prix_unitaire === undefined && (
                <p className="mb-1 text-sm text-bleu-texte">• Pas de colonne « Prix unitaire » : les prix seront à saisir dans l&apos;onglet BPDE et prix.</p>
              )}
              {nbEcarts > 0 && (
                <p className="mb-1 text-sm text-rouge-fonce">
                  • {nbEcarts} ligne(s) dont le montant écrit diffère de quantité × prix unitaire (en rouge) : à vérifier sur le bordereau.
                </p>
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
                    {res.lignes.map((l, i) => {
                      const ecart = ecartMontant(l);
                      return (
                        <tr key={i} className={ecart ? "bg-rouge-pale/60" : ""}>
                          <td>{l.numero}</td>
                          <td>{l.designation}</td>
                          <td>{l.unite}</td>
                          <td className="num">{formatQte(l.quantite)}</td>
                          <td className={`num ${l.prix_unitaire === null ? "text-rouge-fonce" : ""}`}>{formatMontant(l.prix_unitaire)}</td>
                          <td className={`num ${ecart ? "font-semibold text-rouge-fonce" : ""}`} title={ecart ? `Quantité × PU = ${formatMontant(l.quantite * (l.prix_unitaire ?? 0))}` : undefined}>
                            {formatMontant(l.montant ?? l.quantite * (l.prix_unitaire ?? 0))}
                          </td>
                        </tr>
                      );
                    })}
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

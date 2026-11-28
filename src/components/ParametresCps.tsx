"use client";
import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { formatMontant } from "@/lib/calculs";
import { appelerRouteIA, exigerIA, modifier, supprimerFichier, televerser } from "@/lib/donnees";
import type { ParametresCps } from "@/lib/schemasIA";
import { BASES_PENALITE, type BasePenalite, type IndiceRevision, type Marche } from "@/lib/types";
import { Erreur, Modal } from "./ui";

interface Ligne {
  cle: string;
  label: string;
  actuel: string;
  propose: string;
  article: string | null;
  extrait: string | null;
  /** Champs à écrire sur le marché si la ligne est retenue. */
  valeurs: Partial<Marche>;
}

const NUMERIQUES: { cle: keyof ParametresCps & keyof Marche; label: string; unite: string }[] = [
  { cle: "taux_tva", label: "Taux de TVA", unite: "%" },
  { cle: "taux_retenue", label: "Retenue de garantie", unite: "%" },
  { cle: "plafond_retenue", label: "Plafond de la retenue", unite: "% du marché" },
  { cle: "penalite_taux_millieme", label: "Pénalité de retard", unite: "‰ par jour" },
  { cle: "penalite_plafond", label: "Plafond des pénalités", unite: "% du marché" },
  { cle: "avance_debut_remboursement", label: "Début du remboursement de l'avance", unite: "% d'avancement" },
  { cle: "avance_fin_remboursement", label: "Fin du remboursement de l'avance", unite: "% d'avancement" },
  { cle: "delai_garantie_mois", label: "Délai de garantie", unite: "mois" },
];

const fmt = (n: number | null | undefined, unite = "") =>
  n === null || n === undefined ? "—" : `${String(n).replace(".", ",")}${unite ? ` ${unite}` : ""}`;

function construireLignes(p: ParametresCps, m: Marche): Ligne[] {
  const lignes: Ligne[] = [];
  if (p.delai_mois.valeur !== null) {
    lignes.push({
      cle: "duree_mois",
      label: "Délai d'exécution",
      actuel: fmt(Number(m.duree_mois), "mois"),
      propose: fmt(p.delai_mois.valeur, "mois"),
      article: p.delai_mois.article,
      extrait: p.delai_mois.extrait,
      valeurs: { duree_mois: p.delai_mois.valeur },
    });
  }
  for (const n of NUMERIQUES) {
    const v = p[n.cle] as { valeur: number | null; article: string | null; extrait: string | null };
    if (v.valeur === null) continue;
    lignes.push({
      cle: n.cle,
      label: n.label,
      actuel: fmt(m[n.cle] as number | null, n.unite),
      propose: fmt(v.valeur, n.unite),
      article: v.article,
      extrait: v.extrait,
      valeurs: { [n.cle]: v.valeur },
    });
  }
  if (p.penalite_base.valeur) {
    lignes.push({
      cle: "penalite_base",
      label: "Base des pénalités",
      actuel: BASES_PENALITE[m.penalite_base],
      propose: BASES_PENALITE[p.penalite_base.valeur as BasePenalite],
      article: p.penalite_base.article,
      extrait: p.penalite_base.extrait,
      valeurs: { penalite_base: p.penalite_base.valeur as BasePenalite },
    });
  }
  if (p.avance_pourcentage.valeur !== null) {
    const montant = Math.round(((Number(m.montant_ttc) || 0) * p.avance_pourcentage.valeur) / 100 * 100) / 100;
    lignes.push({
      cle: "avance_montant",
      label: "Avance",
      actuel: formatMontant(Number(m.avance_montant)),
      propose: `${fmt(p.avance_pourcentage.valeur, "%")} = ${formatMontant(montant)}`,
      article: p.avance_pourcentage.article,
      extrait: p.avance_pourcentage.extrait,
      valeurs: { avance_montant: montant },
    });
  }
  if (p.revision.applicable && p.revision.indices.length) {
    const indices: IndiceRevision[] = p.revision.indices.slice(0, 3).map((i) => ({ nom: i.nom, part: i.part, base: 0, actuel: 0 }));
    lignes.push({
      cle: "indices_revision",
      label: "Révision des prix",
      actuel: m.indices_revision?.length ? m.indices_revision.map((i) => `${i.nom} ${fmt(i.part)}`).join(", ") : "aucun indice",
      propose: indices.map((i) => `${i.nom} ${fmt(i.part)}`).join(", ") + " (valeurs d'indices à saisir)",
      article: p.revision.article,
      extrait: p.revision.formule,
      valeurs: { indices_revision: indices },
    });
  }
  return lignes;
}

/** Bouton « Paramètres du CPS » : Claude lit le CPS et propose les paramètres, appliqués après validation. */
export function ParametresCpsBouton({ marche, recharger }: { marche: Marche; recharger: () => Promise<void> }) {
  const entree = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ lignes: Ligne[]; remarques: string[]; prixFermes: boolean } | null>(null);
  const [choix, setChoix] = useState<Record<string, boolean>>({});
  const [envoi, setEnvoi] = useState(false);

  async function analyser(f: File) {
    setErreur(null);
    const ext = f.name.toLowerCase().split(".").pop();
    if (!["pdf", "docx", "txt"].includes(ext ?? "")) {
      setErreur("Format non pris en charge : PDF, Word (.docx) ou texte. Les anciens fichiers .doc doivent être enregistrés en .docx.");
      setResultat({ lignes: [], remarques: [], prixFermes: false });
      return;
    }
    try {
      await exigerIA();
      setEtat("Envoi du CPS…");
      const chemin = await televerser(marche.id, "cps", f);
      setEtat("Claude lit le CPS… (jusqu'à quelques minutes)");
      try {
        const { parametres: p } = await appelerRouteIA<{ parametres: ParametresCps }>("parametres-cps", { marcheId: marche.id, chemin });
        const lignes = construireLignes(p, marche);
        setChoix(Object.fromEntries(lignes.map((l) => [l.cle, l.actuel !== l.propose])));
        setResultat({ lignes, remarques: p.remarques, prixFermes: p.revision.applicable === false });
      } finally {
        await supprimerFichier(chemin);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setResultat({ lignes: [], remarques: [], prixFermes: false });
    } finally {
      setEtat(null);
    }
  }

  async function appliquer() {
    if (!resultat) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const valeurs = Object.assign({}, ...resultat.lignes.filter((l) => choix[l.cle]).map((l) => l.valeurs));
      if (Object.keys(valeurs).length) await modifier("marches", marche.id, valeurs);
      await recharger();
      setResultat(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  }

  const nb = resultat?.lignes.filter((l) => choix[l.cle]).length ?? 0;

  return (
    <>
      <button className="btn" onClick={() => entree.current?.click()} disabled={!!etat} title="Claude lit le CPS et propose délai, retenue, pénalités, avance, révision">
        <Sparkles size={14} className={etat ? "animate-pulse" : ""} /> <span>{etat ? "Lecture…" : <><span className="hidden sm:inline">Paramètres du </span>CPS</>}</span>
      </button>
      <input
        ref={entree}
        type="file"
        accept=".pdf,.docx,.txt"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) analyser(f);
        }}
      />
      {resultat && (
        <Modal titre="Paramètres lus dans le CPS" ouvert onFermer={() => setResultat(null)} large>
          <Erreur message={erreur} />
          {resultat.lignes.length === 0 && !erreur && <p className="text-sm text-slate-600">Aucun paramètre explicite trouvé dans ce document.</p>}
          {resultat.prixFermes && <p className="mb-2 text-sm text-slate-700">Le CPS indique des prix fermes (non révisables).</p>}
          {resultat.lignes.length > 0 && (
            <>
              <p className="mb-3 text-sm text-slate-600">
                Vérifiez chaque valeur au regard de l&apos;extrait cité avant de l&apos;appliquer. Rien n&apos;est modifié sans validation.
              </p>
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
                <table className="tableau">
                  <thead className="sticky top-0">
                    <tr>
                      <th className="w-8" />
                      <th>Paramètre</th>
                      <th>Actuel</th>
                      <th>Lu dans le CPS</th>
                      <th>Article et extrait</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultat.lignes.map((l) => (
                      <tr key={l.cle} className={choix[l.cle] ? "" : "opacity-60"}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Appliquer ${l.label}`}
                            checked={!!choix[l.cle]}
                            onChange={(e) => setChoix({ ...choix, [l.cle]: e.target.checked })}
                          />
                        </td>
                        <td className="font-medium">{l.label}</td>
                        <td className="whitespace-nowrap text-slate-600">{l.actuel}</td>
                        <td className="font-medium">{l.propose}</td>
                        <td className="text-xs text-slate-600">
                          {l.article && <div className="font-semibold text-slate-800">{l.article}</div>}
                          {l.extrait && <div className="italic">« {l.extrait} »</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {resultat.remarques.length > 0 && (
            <div className="mt-3 rounded-lg border border-bleu/30 bg-bleu-pale px-3 py-2 text-sm text-bleu-texte">
              <p className="font-medium">Points d&apos;attention signalés</p>
              <ul className="mt-1 list-disc pl-5">
                {resultat.remarques.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn" onClick={() => setResultat(null)}>
              Fermer
            </button>
            {resultat.lignes.length > 0 && (
              <button className="btn-primaire" onClick={appliquer} disabled={envoi || nb === 0}>
                {envoi ? "Application…" : `Appliquer ${nb} paramètre(s)`}
              </button>
            )}
          </div>
        </Modal>
      )}
      {!resultat && erreur && <span className="text-xs text-rouge-fonce">{erreur}</span>}
    </>
  );
}

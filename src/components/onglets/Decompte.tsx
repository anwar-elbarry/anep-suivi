"use client";
import { Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  aujourdhuiUtc,
  calculerDelais,
  calculerPenalites,
  etatPhysique,
  formatMontant,
  formatPct,
  formatQte,
  projetDecompte,
  rapprocher,
  versIso,
} from "@/lib/calculs";
import { inserer, modifier } from "@/lib/donnees";
import type { IndiceRevision, Marche } from "@/lib/types";
import { ChampNombre, Erreur, Vide } from "../ui";
import type { PropsOnglet } from "./types";

export function OngletDecompte({ dossier, recharger, allerA }: PropsOnglet) {
  const { marche, bpde, attachements, decomptes } = dossier;
  const [indices, setIndices] = useState<IndiceRevision[]>(marche.indices_revision ?? []);
  const [tva, setTva] = useState<number>(Number(marche.taux_tva));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [appliquerPenalites, setAppliquerPenalites] = useState(true);

  const simule: Marche = { ...marche, indices_revision: indices, taux_tva: tva };
  const r = useMemo(() => rapprocher(attachements, bpde, marche.attachements_cumulatifs), [attachements, bpde, marche.attachements_cumulatifs]);
  const physique = useMemo(() => etatPhysique(bpde, r.quantites), [bpde, r]);
  const auj = aujourdhuiUtc();
  const penalites = calculerPenalites(marche, calculerDelais(marche, dossier.ordres, auj), auj);
  const projet = projetDecompte(simule, physique, decomptes, penalites, appliquerPenalites);
  const modifie = JSON.stringify(indices) !== JSON.stringify(marche.indices_revision ?? []) || tva !== Number(marche.taux_tva);

  const majIndice = (i: number, p: Partial<IndiceRevision>) => setIndices(indices.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function enregistrerParametres() {
    await modifier("marches", marche.id, { indices_revision: indices, taux_tva: tva });
    await recharger();
  }

  async function enregistrerDecompte() {
    setErreur(null);
    if (projet.travauxPeriodeTTC <= 0) {
      setErreur("Le montant des travaux de la période est nul ou négatif : rien à décompter.");
      return;
    }
    if (!projet.k.valide) {
      setErreur(`Formule de révision incomplète : ${projet.k.anomalies.join(" ; ")}`);
      return;
    }
    if (
      !confirm(
        `Enregistrer le décompte n° ${decomptes.length + 1} : travaux ${formatMontant(projet.travauxPeriodeTTC)} TTC, révision ${formatMontant(projet.revisionPeriodeTTC)} TTC, net à payer ${formatMontant(projet.netAPayer)} ?`,
      )
    )
      return;
    setEnvoi(true);
    try {
      if (modifie) await modifier("marches", marche.id, { indices_revision: indices, taux_tva: tva });
      await inserer("decomptes", {
        marche_id: marche.id,
        numero: String(decomptes.length + 1),
        date: versIso(aujourdhuiUtc()),
        montant_travaux: projet.travauxPeriodeTTC,
        montant_revision: projet.revisionPeriodeTTC,
        coefficient_k: Number(projet.k.k.toFixed(6)),
        montant_penalites: projet.penalitesPeriode,
        remboursement_avance: projet.remboursementPeriode,
        retenue_garantie: projet.retenuePeriode,
        net_a_payer: projet.netAPayer,
        observations: `Projet généré : cumul exécuté ${formatMontant(projet.cumulExecuteTTC)} TTC.${
          projet.penalitesPeriode ? ` Pénalités : ${penalites.joursPenalisables} j × ${formatMontant(penalites.parJour)}.` : ""
        }`,
      });
      await recharger();
      allerA("financier");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  }

  if (!bpde.length) return <Vide>Le projet de décompte valorise les attachements aux prix du BPDE : importez d&apos;abord le BPDE.</Vide>;

  const lignes: [string, number, string?][] = [
    ["Travaux exécutés cumulés HT", projet.cumulExecuteHT],
    [`TVA ${tva} %`, projet.cumulExecuteTTC - projet.cumulExecuteHT],
    ["Travaux exécutés cumulés TTC", projet.cumulExecuteTTC, "font-semibold"],
    ["À déduire : décomptes précédents (travaux)", -projet.decomptesPrecedentsTTC],
    ["Travaux de la période TTC", projet.travauxPeriodeTTC, "font-semibold"],
    [`Révision de la période HT (K − 1 = ${(projet.k.k - 1).toFixed(4).replace(".", ",")})`, projet.revisionPeriodeHT],
    ["Révision de la période TTC", projet.revisionPeriodeTTC],
    [marche.retenue_remplacee_par_caution ? "Retenue de garantie (remplacée par caution)" : "Retenue de garantie de la période", -projet.retenuePeriode],
    [`Pénalités de retard de la période${appliquerPenalites ? "" : " (non appliquées)"}`, -projet.penalitesPeriode],
    ["Remboursement de l'avance", -projet.remboursementPeriode],
    ["Net à payer TTC", projet.netAPayer, "font-bold text-marque-700 text-base"],
  ];

  return (
    <section className="space-y-5">
      <Erreur message={erreur} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="carte p-4">
          <h2 className="mb-3 font-semibold">Paramètres</h2>
          <label className="mb-4 block w-40">
            <span className="etiquette">Taux de TVA (%)</span>
            <ChampNombre valeur={tva} onChange={(n) => setTva(n ?? 0)} />
          </label>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Révision des prix — indices (copiés du CPS)</h3>
            <button className="btn px-2 py-1 text-xs" disabled={indices.length >= 3} onClick={() => setIndices([...indices, { nom: "", part: 0, base: 0, actuel: 0 }])}>
              <Plus size={13} /> Indice
            </button>
          </div>
          {indices.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun indice : pas de révision (K = 1).</p>
          ) : (
            <table className="tableau">
              <thead>
                <tr>
                  <th>Indice</th>
                  <th className="num">Part</th>
                  <th className="num">Base</th>
                  <th className="num">Actuel</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {indices.map((x, i) => (
                  <tr key={i}>
                    <td>
                      <input className="champ px-2 py-1" value={x.nom} placeholder="ex. BAT6" onChange={(e) => majIndice(i, { nom: e.target.value })} aria-label="Nom de l'indice" />
                    </td>
                    <td>
                      <ChampNombre className="champ px-2 py-1 text-right" valeur={x.part} onChange={(n) => majIndice(i, { part: n ?? 0 })} aria-label="Part" />
                    </td>
                    <td>
                      <ChampNombre className="champ px-2 py-1 text-right" valeur={x.base} onChange={(n) => majIndice(i, { base: n ?? 0 })} aria-label="Indice de base" />
                    </td>
                    <td>
                      <ChampNombre className="champ px-2 py-1 text-right" valeur={x.actuel} onChange={(n) => majIndice(i, { actuel: n ?? 0 })} aria-label="Indice actuel" />
                    </td>
                    <td>
                      <button className="btn-icone" aria-label="Retirer l'indice" onClick={() => setIndices(indices.filter((_, j) => j !== i))}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-sm">
            K = {projet.k.partieFixe.toFixed(4).replace(".", ",")} (partie fixe)
            {indices.map((x) => ` + ${String(x.part).replace(".", ",")} × ${x.actuel || "?"} / ${x.base || "?"}`).join("")} ={" "}
            <strong>{projet.k.k.toFixed(4).replace(".", ",")}</strong>
          </p>
          {projet.k.anomalies.map((a) => (
            <p key={a} className="text-sm text-red-600">
              • {a}
            </p>
          ))}
          {modifie && (
            <button className="btn mt-3" onClick={enregistrerParametres}>
              <Save size={14} /> Enregistrer les paramètres
            </button>
          )}
        </div>

        <div className="carte p-4">
          <h2 className="mb-3 font-semibold">Projet de décompte n° {decomptes.length + 1}</h2>
          <table className="w-full text-sm">
            <tbody>
              {lignes.map(([l, v, cls]) => (
                <tr key={l} className="border-b border-slate-100 last:border-0">
                  <td className={`py-1.5 ${cls ?? ""}`}>{l}</td>
                  <td className={`num py-1.5 ${cls ?? ""}`}>{formatMontant(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={appliquerPenalites} onChange={(e) => setAppliquerPenalites(e.target.checked)} />
            Imputer les pénalités de retard ({penalites.parametre ? `${penalites.joursPenalisables} j, cumul ${formatMontant(penalites.montant)}` : "taux non renseigné"})
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Retenue cumulée {formatMontant(projet.retenueCumulee)} (plafond {Number(marche.plafond_retenue)} % du marché). Pénalités cumulées{" "}
            {formatMontant(projet.penalitesCumulees)}, avance remboursée {formatMontant(projet.remboursementCumule)}. Autres déductions (frais,
            sanctions diverses) non calculées. Document de travail : ne vaut pas décompte officiel.
          </p>
          {r.nonRapprochees.length > 0 && (
            <p className="mt-2 text-sm text-amber-700">{r.nonRapprochees.length} ligne(s) d&apos;attachement non rapprochée(s) ne sont pas valorisées.</p>
          )}
          <button className="btn-primaire mt-4" onClick={enregistrerDecompte} disabled={envoi}>
            <Save size={15} /> {envoi ? "Enregistrement…" : "Enregistrer comme décompte"}
          </button>
        </div>
      </div>

      <div className="carte overflow-x-auto">
        <h2 className="px-4 py-3 font-semibold">Écarts entre quantités du marché et quantités exécutées</h2>
        <table className="tableau">
          <thead>
            <tr>
              <th>N°</th>
              <th>Désignation</th>
              <th className="num">Qté marché</th>
              <th className="num">Qté exécutée</th>
              <th className="num">Écart</th>
              <th className="num">Écart %</th>
              <th className="num">Montant marché HT</th>
              <th className="num">Montant exécuté HT</th>
              <th className="num">Écart HT</th>
            </tr>
          </thead>
          <tbody>
            {physique.lignes.map((l) => (
              <tr key={l.ligne.id} className={l.depassement ? "text-red-700" : ""}>
                <td>{l.ligne.numero}</td>
                <td>{l.ligne.designation}</td>
                <td className="num">{formatQte(l.qteMarche)}</td>
                <td className="num">{formatQte(l.qteExecutee)}</td>
                <td className="num">{formatQte(l.ecart)}</td>
                <td className="num">{formatPct(l.ecartPct)}</td>
                <td className="num">{formatMontant(l.montantMarche)}</td>
                <td className="num">{formatMontant(l.montantExecute)}</td>
                <td className="num">{formatMontant(l.ecartMontant)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={6} className="px-3 py-2">
                Total
              </td>
              <td className="num px-3 py-2">{formatMontant(physique.montantMarcheHT)}</td>
              <td className="num px-3 py-2">{formatMontant(physique.montantExecuteHT)}</td>
              <td className="num px-3 py-2">{formatMontant(physique.montantExecuteHT - physique.montantMarcheHT)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

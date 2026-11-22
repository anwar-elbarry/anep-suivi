"use client";
import { Printer } from "lucide-react";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { aujourdhuiUtc, documentEnRetard, formatDate, formatMontant, formatPct, formatQte, montantMarche, reserveEnRetard } from "@/lib/calculs";
import logoAnep from "@/assets/logo-anep.png";
import { chargerDossier } from "@/lib/donnees";
import { projetCourant } from "@/lib/synthese";
import type { DossierMarche } from "@/lib/types";

const TITRES: Record<string, string> = {
  decompte: "Décompte",
  ecarts: "Tableau des écarts de quantités",
  fiche: "Fiche de synthèse du marché",
  documents: "Liste des documents à fournir",
  reserves: "Liste des réserves",
};

export default function PageImpression() {
  return (
    <Suspense fallback={<p className="p-10 text-sm">Chargement…</p>}>
      <Impression />
    </Suspense>
  );
}

function Impression() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const doc = params.get("doc") ?? "fiche";
  const decompteId = params.get("decompte");
  const [dossier, setDossier] = useState<DossierMarche | null | undefined>(undefined);

  useEffect(() => {
    chargerDossier(id).then(setDossier, () => setDossier(null));
  }, [id]);

  useEffect(() => {
    if (!dossier) return;
    document.title = `${TITRES[doc] ?? "Document"} - marché ${dossier.marche.numero}`;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [dossier, doc]);

  if (dossier === undefined) return <p className="p-10 text-sm">Chargement…</p>;
  if (dossier === null) return <p className="p-10 text-sm">Marché introuvable.</p>;

  const c = projetCourant(dossier);
  const m = dossier.marche;
  const auj = aujourdhuiUtc();

  return (
    <div className="impression mx-auto max-w-[210mm] bg-white p-8 text-[11px] leading-snug text-slate-900 print:p-0">
      <div className="no-print mb-6 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <span>Utilisez « Enregistrer au format PDF » dans la fenêtre d&apos;impression.</span>
        <button className="btn-primaire" onClick={() => window.print()}>
          <Printer size={15} /> Imprimer / PDF
        </button>
      </div>

      <header className="mb-5 border-b-2 border-slate-800 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Image src={logoAnep} alt="ANEP" height={48} priority />
            <div>
            <h1 className="text-lg font-bold">{TITRES[doc] ?? "Document"}</h1>
            <p className="mt-1 font-semibold">Marché n° {m.numero}</p>
            <p>{m.objet}</p>
            <p>Titulaire : {m.entreprise || "—"}</p>
            </div>
          </div>
          <div className="text-right">
            <p>Montant du marché : {formatMontant(montantMarche(m))} TTC</p>
            {m.montant_avenants ? <p>dont avenants : {formatMontant(m.montant_avenants)}</p> : null}
            <p>Édité le {formatDate(auj)}</p>
          </div>
        </div>
      </header>

      {doc === "decompte" && !decompteId && <Decompte dossier={dossier} c={c} />}
      {doc === "decompte" && decompteId && <DecompteEnregistre dossier={dossier} id={decompteId} c={c} />}
      {doc === "ecarts" && <Ecarts c={c} />}
      {doc === "fiche" && <Fiche dossier={dossier} c={c} />}
      {doc === "documents" && <Documents dossier={dossier} />}
      {doc === "reserves" && <Reserves dossier={dossier} />}

      <footer className="mt-6 border-t border-slate-300 pt-2 text-[10px] text-slate-600">
        Document de travail établi à partir des données saisies dans l&apos;outil de suivi. Il ne vaut ni décompte officiel ni acceptation des
        quantités ; il doit être vérifié au regard des pièces du marché (CPS, BPDE, attachements contradictoires) avant tout usage contractuel.
      </footer>
    </div>
  );
}

type Calcul = ReturnType<typeof projetCourant>;

function Tableau({ entetes, children, droite = [] }: { entetes: string[]; children: ReactNode; droite?: number[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {entetes.map((e, i) => (
            <th key={e} className={`border border-slate-400 bg-slate-100 px-1.5 py-1 font-semibold ${droite.includes(i) ? "text-right" : "text-left"}`}>
              {e}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="[&_td]:border [&_td]:border-slate-300 [&_td]:px-1.5 [&_td]:py-0.5">{children}</tbody>
    </table>
  );
}

function Decompte({ dossier, c }: { dossier: DossierMarche; c: Calcul }) {
  const p = c.projet;
  const m = dossier.marche;
  const lignes: [string, number, boolean?][] = [
    ["Travaux exécutés cumulés HT (quantités × prix du BPDE)", p.cumulExecuteHT],
    [`TVA ${Number(m.taux_tva)} %`, p.cumulExecuteTTC - p.cumulExecuteHT],
    ["Travaux exécutés cumulés TTC", p.cumulExecuteTTC, true],
    [`À déduire : décomptes précédents (${dossier.decomptes.length})`, -p.decomptesPrecedentsTTC],
    ["Travaux de la période TTC", p.travauxPeriodeTTC, true],
    [`Révision des prix de la période TTC (K = ${p.k.k.toFixed(4).replace(".", ",")})`, p.revisionPeriodeTTC],
    [m.retenue_remplacee_par_caution ? "Retenue de garantie (remplacée par caution)" : `Retenue de garantie (${Number(m.taux_retenue)} %, plafond ${Number(m.plafond_retenue)} %)`, -p.retenuePeriode],
    [`Pénalités de retard (${c.penalites.joursPenalisables} j)`, -p.penalitesPeriode],
    ["Remboursement de l'avance", -p.remboursementPeriode],
    ["NET À PAYER TTC", p.netAPayer, true],
  ];
  return (
    <>
      <h2 className="mb-2 text-sm font-bold">Décompte n° {dossier.decomptes.length + 1} (projet)</h2>
      <table className="mb-5 w-full border-collapse">
        <tbody>
          {lignes.map(([l, v, gras]) => (
            <tr key={l} className={gras ? "font-bold" : ""}>
              <td className="border border-slate-300 px-2 py-1">{l}</td>
              <td className="w-40 border border-slate-300 px-2 py-1 text-right tabular-nums">{formatMontant(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="mb-2 text-sm font-bold">Détail des quantités</h2>
      <Tableau entetes={["N°", "Désignation", "U", "Qté cumulée", "PU HT", "Montant HT"]} droite={[3, 4, 5]}>
        {c.physique.lignes
          .filter((l) => l.qteExecutee > 0)
          .map((l) => (
            <tr key={l.ligne.id}>
              <td>{l.ligne.numero}</td>
              <td>{l.ligne.designation}</td>
              <td>{l.ligne.unite}</td>
              <td className="text-right tabular-nums">{formatQte(l.qteExecutee)}</td>
              <td className="text-right tabular-nums">{formatMontant(l.ligne.prix_unitaire)}</td>
              <td className="text-right tabular-nums">{formatMontant(l.montantExecute)}</td>
            </tr>
          ))}
      </Tableau>
      {c.rapprochement.nonRapprochees.length > 0 && (
        <p className="mt-2 font-semibold">⚠ {c.rapprochement.nonRapprochees.length} ligne(s) d&apos;attachement non rapprochée(s) du BPDE, non valorisée(s).</p>
      )}
      <Signatures />
    </>
  );
}

function Signatures() {
  return (
    <div className="mt-8 grid grid-cols-3 gap-4">
      {["Établi par", "Vérifié par", "Accepté par le titulaire"].map((t) => (
        <div key={t} className="h-24 border border-slate-400 p-2">
          <p className="font-semibold">{t}</p>
          <p className="mt-1 text-slate-500">Nom, date et signature</p>
        </div>
      ))}
    </div>
  );
}

/** Décompte déjà enregistré : montants tels que sauvegardés, cumuls recalculés à partir des décomptes antérieurs. */
function DecompteEnregistre({ dossier, id, c }: { dossier: DossierMarche; id: string; c: Calcul }) {
  const tries = [...dossier.decomptes].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.numero.localeCompare(b.numero, "fr", { numeric: true }));
  const i = tries.findIndex((d) => d.id === id);
  if (i < 0) return <p>Décompte introuvable.</p>;
  const d = tries[i];
  const avant = tries.slice(0, i);
  const somme = (l: typeof tries, f: (x: (typeof tries)[number]) => number) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const travauxAvant = somme(avant, (x) => x.montant_travaux);
  const revisionAvant = somme(avant, (x) => x.montant_revision);
  const dernier = i === tries.length - 1;
  const lignes: [string, number | null, boolean?][] = [
    ["Travaux cumulés TTC à la date du décompte", travauxAvant + Number(d.montant_travaux), true],
    [`À déduire : décomptes précédents (${avant.length})`, -travauxAvant],
    ["Travaux de la période TTC", Number(d.montant_travaux), true],
    [`Révision des prix de la période TTC${d.coefficient_k ? ` (K = ${Number(d.coefficient_k).toFixed(4).replace(".", ",")})` : ""}`, Number(d.montant_revision)],
    ["Retenue de garantie de la période", d.retenue_garantie === null ? null : -Number(d.retenue_garantie)],
    ["Pénalités de retard de la période", -Number(d.montant_penalites)],
    ["Remboursement de l'avance", -Number(d.remboursement_avance)],
    ["NET À PAYER TTC", d.net_a_payer === null ? null : Number(d.net_a_payer), true],
    ["Cumul travaux + révision après ce décompte", travauxAvant + revisionAvant + Number(d.montant_travaux) + Number(d.montant_revision)],
  ];
  return (
    <>
      <h2 className="mb-2 text-sm font-bold">
        Décompte n° {d.numero} du {formatDate(d.date)}
      </h2>
      <table className="mb-3 w-full border-collapse">
        <tbody>
          {lignes.map(([l, v, gras]) => (
            <tr key={l} className={gras ? "font-bold" : ""}>
              <td className="border border-slate-300 px-2 py-1">{l}</td>
              <td className="w-40 border border-slate-300 px-2 py-1 text-right tabular-nums">{v === null ? "non renseigné" : formatMontant(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.observations && <p className="mb-4">Observations : {d.observations}</p>}
      {dernier && (
        <>
          <h2 className="mb-2 text-sm font-bold">Quantités cumulées à la date d&apos;édition</h2>
          <Tableau entetes={["N°", "Désignation", "U", "Qté cumulée", "PU HT", "Montant HT"]} droite={[3, 4, 5]}>
            {c.physique.lignes
              .filter((l) => l.qteExecutee > 0)
              .map((l) => (
                <tr key={l.ligne.id}>
                  <td>{l.ligne.numero}</td>
                  <td>{l.ligne.designation}</td>
                  <td>{l.ligne.unite}</td>
                  <td className="text-right tabular-nums">{formatQte(l.qteExecutee)}</td>
                  <td className="text-right tabular-nums">{formatMontant(l.ligne.prix_unitaire)}</td>
                  <td className="text-right tabular-nums">{formatMontant(l.montantExecute)}</td>
                </tr>
              ))}
          </Tableau>
        </>
      )}
      <Signatures />
    </>
  );
}

function Ecarts({ c }: { c: Calcul }) {
  return (
    <>
      <Tableau entetes={["N°", "Désignation", "U", "Qté marché", "Qté exéc.", "Écart", "Écart %", "Montant marché HT", "Montant exéc. HT", "Écart HT"]} droite={[3, 4, 5, 6, 7, 8, 9]}>
        {c.physique.lignes.map((l) => (
          <tr key={l.ligne.id} className={l.depassement ? "font-semibold" : ""}>
            <td>{l.ligne.numero}</td>
            <td>
              {l.ligne.designation}
              {l.depassement && " ▲"}
            </td>
            <td>{l.ligne.unite}</td>
            <td className="text-right tabular-nums">{formatQte(l.qteMarche)}</td>
            <td className="text-right tabular-nums">{formatQte(l.qteExecutee)}</td>
            <td className="text-right tabular-nums">{formatQte(l.ecart)}</td>
            <td className="text-right tabular-nums">{formatPct(l.ecartPct)}</td>
            <td className="text-right tabular-nums">{formatMontant(l.montantMarche)}</td>
            <td className="text-right tabular-nums">{formatMontant(l.montantExecute)}</td>
            <td className="text-right tabular-nums">{formatMontant(l.ecartMontant)}</td>
          </tr>
        ))}
        <tr className="font-bold">
          <td colSpan={7}>Total</td>
          <td className="text-right tabular-nums">{formatMontant(c.physique.montantMarcheHT)}</td>
          <td className="text-right tabular-nums">{formatMontant(c.physique.montantExecuteHT)}</td>
          <td className="text-right tabular-nums">{formatMontant(c.physique.montantExecuteHT - c.physique.montantMarcheHT)}</td>
        </tr>
      </Tableau>
      <p className="mt-2">▲ : quantité exécutée supérieure à la quantité du marché. Avancement physique pondéré : {formatPct(c.physique.avancement)}.</p>
    </>
  );
}

function Fiche({ dossier, c }: { dossier: DossierMarche; c: Calcul }) {
  const d = c.delais;
  const f = c.finances;
  const bloc = (titre: string, lignes: [string, ReactNode][]) => (
    <div className="mb-4">
      <h2 className="mb-1 text-sm font-bold">{titre}</h2>
      <table className="w-full border-collapse">
        <tbody>
          {lignes.map(([l, v]) => (
            <tr key={l}>
              <td className="w-1/2 border border-slate-300 px-2 py-0.5">{l}</td>
              <td className="border border-slate-300 px-2 py-0.5 tabular-nums">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      {bloc("Délais", [
        ["Statut", dossier.marche.statut],
        ["Démarrage", formatDate(d.dateDemarrage)],
        ["Délai contractuel", `${Number(dossier.marche.duree_mois)} mois`],
        ["Arrêts / prolongations", `${d.joursArret} j / ${d.joursProlongation} j`],
        ["Fin prévue", formatDate(d.finPrevue)],
        ["Situation", d.joursRestants === null ? "—" : d.joursRestants < 0 ? `${-d.joursRestants} j de retard` : `${d.joursRestants} j restants`],
        ["Pénalités encourues", c.penalites.parametre ? formatMontant(c.penalites.montant) : "taux non renseigné"],
      ])}
      {bloc("Avancement", [
        ["Délai écoulé", formatPct(d.tempsEcoule)],
        ["Avancement physique", formatPct(c.physique.avancement)],
        ["Avancement financier", formatPct(f.part)],
      ])}
      {bloc("Finances (TTC)", [
        ["Montant atteint (travaux + révision)", formatMontant(f.montantAtteint)],
        ["Retenue de garantie", formatMontant(f.retenue)],
        ["Pénalités imputées", formatMontant(f.cumulPenalites)],
        ["Avance / remboursée", `${formatMontant(f.avance)} / ${formatMontant(f.cumulRemboursement)}`],
        ["Net après déductions", formatMontant(f.netApresDeductions)],
        ["Reste à réaliser", formatMontant(f.reste)],
      ])}
      {dossier.intervenants.length > 0 &&
        bloc(
          "Intervenants",
          dossier.intervenants.map((i) => [i.role, [i.nom, i.organisme, i.telephone, i.email].filter(Boolean).join(" · ")]),
        )}
      <h2 className="mb-1 text-sm font-bold">Points de vigilance</h2>
      {c.vigilance.length === 0 ? (
        <p>Aucun.</p>
      ) : (
        <ul className="list-disc pl-5">
          {c.vigilance.map((v, i) => (
            <li key={i}>{v.message}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function Documents({ dossier }: { dossier: DossierMarche }) {
  const auj = aujourdhuiUtc();
  const docs = [...dossier.documents].sort((a, b) => (a.echeance ?? "9999").localeCompare(b.echeance ?? "9999"));
  return (
    <>
      <Tableau entetes={["Document", "Prestation", "Art. CPS", "Par", "Échéance", "Statut"]}>
        {docs.map((d) => (
          <tr key={d.id} className={documentEnRetard(d, auj) ? "font-semibold" : ""}>
            <td>{d.nom}</td>
            <td>{d.prestation}</td>
            <td>{d.article_cps}</td>
            <td>{d.responsable}</td>
            <td>
              {formatDate(d.echeance)}
              {documentEnRetard(d, auj) && " (en retard)"}
            </td>
            <td>{d.statut}</td>
          </tr>
        ))}
      </Tableau>
      <p className="mt-2">
        {docs.length} document(s), dont {docs.filter((d) => documentEnRetard(d, auj)).length} en retard et {docs.filter((d) => d.statut === "Validé").length}{" "}
        validé(s).
      </p>
    </>
  );
}

function Reserves({ dossier }: { dossier: DossierMarche }) {
  const auj = aujourdhuiUtc();
  const liste = [...dossier.reserves].sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }));
  return (
    <>
      <p className="mb-3">
        Réception provisoire : {formatDate(dossier.marche.date_reception_provisoire)} — {liste.filter((r) => r.statut === "Ouverte").length} réserve(s)
        ouverte(s), {liste.filter((r) => r.statut === "Levée").length} levée(s).
      </p>
      <Tableau entetes={["N°", "Réserve", "Localisation", "Par", "Délai de levée", "Statut", "Levée le"]}>
        {liste.map((r) => (
          <tr key={r.id} className={reserveEnRetard(r, auj) ? "font-semibold" : ""}>
            <td>{r.numero}</td>
            <td>{r.designation}</td>
            <td>{r.localisation}</td>
            <td>{r.responsable}</td>
            <td>
              {formatDate(r.echeance)}
              {reserveEnRetard(r, auj) && " (dépassé)"}
            </td>
            <td>{r.statut}</td>
            <td>{formatDate(r.date_levee)}</td>
          </tr>
        ))}
      </Tableau>
      <div className="mt-8 grid grid-cols-2 gap-4">
        {["Pour le maître d'ouvrage", "Pour le titulaire"].map((t) => (
          <div key={t} className="h-24 border border-slate-400 p-2">
            <p className="font-semibold">{t}</p>
            <p className="mt-1 text-slate-500">Nom, date et signature</p>
          </div>
        ))}
      </div>
    </>
  );
}

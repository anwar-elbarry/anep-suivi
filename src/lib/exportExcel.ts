"use client";
import * as XLSX from "xlsx";
import { aujourdhuiUtc, documentEnRetard, etatExpiration, formatDate, montantLigneHT, versIso } from "./calculs";
import { projetCourant } from "./synthese";
import { TYPES_OS, type DossierMarche } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

function feuille(lignes: (string | number | null)[][], largeurs: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(lignes);
  ws["!cols"] = largeurs.map((wch) => ({ wch }));
  return ws;
}

/** Classeur Excel complet du marché : synthèse, projet de décompte, écarts, BPDE, décomptes, documents, garanties. */
export function exporterExcel(dossier: DossierMarche) {
  const { marche: m } = dossier;
  const auj = aujourdhuiUtc();
  const c = projetCourant(dossier);
  const p = c.projet;
  const wb = XLSX.utils.book_new();
  const entete = [[`Marché n° ${m.numero}`], [m.objet], [`Entreprise : ${m.entreprise}`], [`Édité le ${formatDate(auj)} — document de travail, ne vaut pas décompte officiel`], []];

  XLSX.utils.book_append_sheet(
    wb,
    feuille(
      [
        ...entete,
        ["Montant du marché TTC", Number(m.montant_ttc)],
        ["Statut", m.statut],
        ["Délai (mois)", Number(m.duree_mois)],
        ["Démarrage", formatDate(c.delais.dateDemarrage)],
        ["Fin contractuelle", formatDate(c.delais.finContractuelle)],
        ["Jours d'arrêt", c.delais.joursArret],
        ["Jours de prolongation", c.delais.joursProlongation],
        ["Fin prévue", formatDate(c.delais.finPrevue)],
        ["Jours restants (négatif = retard)", c.delais.joursRestants],
        ["Délai écoulé", r2(c.delais.tempsEcoule)],
        ["Avancement physique", r2(c.physique.avancement)],
        ["Avancement financier", r2(c.finances.part)],
        ["Montant atteint TTC", c.finances.montantAtteint],
        ["Retenue de garantie", c.finances.retenue],
        ["Pénalités imputées", c.finances.cumulPenalites],
        ["Pénalités encourues à ce jour", c.penalites.montant],
        ["Avance", c.finances.avance],
        ["Avance remboursée", c.finances.cumulRemboursement],
        ["Net après déductions", c.finances.netApresDeductions],
        [],
        ["Points de vigilance"],
        ...c.vigilance.map((v) => [v.message]),
      ],
      [36, 60],
    ),
    "Synthèse",
  );

  XLSX.utils.book_append_sheet(
    wb,
    feuille(
      [
        ...entete,
        [`Projet de décompte n° ${dossier.decomptes.length + 1}`],
        ["Travaux exécutés cumulés HT", p.cumulExecuteHT],
        [`TVA ${Number(m.taux_tva)} %`, r2(p.cumulExecuteTTC - p.cumulExecuteHT)],
        ["Travaux exécutés cumulés TTC", p.cumulExecuteTTC],
        ["À déduire : décomptes précédents (travaux)", -p.decomptesPrecedentsTTC],
        ["Travaux de la période TTC", p.travauxPeriodeTTC],
        ["Coefficient K", Number(p.k.k.toFixed(6))],
        ["Révision de la période HT", p.revisionPeriodeHT],
        ["Révision de la période TTC", p.revisionPeriodeTTC],
        ["Retenue de garantie de la période", -p.retenuePeriode],
        ["Pénalités de retard de la période", -p.penalitesPeriode],
        ["Remboursement de l'avance", -p.remboursementPeriode],
        ["Net à payer TTC", p.netAPayer],
      ],
      [44, 18],
    ),
    "Projet de décompte",
  );

  XLSX.utils.book_append_sheet(
    wb,
    feuille(
      [
        ["N°", "Désignation", "Unité", "Qté marché", "Qté exécutée", "Écart", "Écart %", "PU HT", "Montant marché HT", "Montant exécuté HT", "Écart HT"],
        ...c.physique.lignes.map((l) => [
          l.ligne.numero,
          l.ligne.designation,
          l.ligne.unite,
          l.qteMarche,
          l.qteExecutee,
          l.ecart,
          l.ecartPct === null ? null : r2(l.ecartPct),
          l.ligne.prix_unitaire,
          r2(l.montantMarche),
          r2(l.montantExecute),
          r2(l.ecartMontant),
        ]),
        [],
        ["", "Total", "", "", "", "", "", "", r2(c.physique.montantMarcheHT), r2(c.physique.montantExecuteHT), r2(c.physique.montantExecuteHT - c.physique.montantMarcheHT)],
        ...(c.rapprochement.nonRapprochees.length
          ? [[], ["Lignes d'attachement non rapprochées (non valorisées)"], ...c.rapprochement.nonRapprochees.map((l) => [l.numero, l.designation, "", "", l.quantite])]
          : []),
      ],
      [8, 50, 8, 12, 12, 10, 9, 12, 16, 16, 14],
    ),
    "Écarts",
  );

  XLSX.utils.book_append_sheet(
    wb,
    feuille(
      [["N°", "Désignation", "Unité", "Quantité", "PU HT", "Montant HT"], ...dossier.bpde.map((l) => [l.numero, l.designation, l.unite, Number(l.quantite), l.prix_unitaire, r2(montantLigneHT(l))])],
      [8, 60, 8, 12, 12, 16],
    ),
    "BPDE",
  );

  XLSX.utils.book_append_sheet(
    wb,
    feuille(
      [
        ["N°", "Date", "Travaux TTC", "Révision TTC", "K", "Retenue", "Pénalités", "Rembt avance", "Net à payer", "Observations"],
        ...[...dossier.decomptes]
          .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
          .map((d) => [
            d.numero,
            d.date,
            Number(d.montant_travaux),
            Number(d.montant_revision),
            d.coefficient_k === null ? null : Number(d.coefficient_k),
            d.retenue_garantie === null ? null : Number(d.retenue_garantie),
            Number(d.montant_penalites),
            Number(d.remboursement_avance),
            d.net_a_payer === null ? null : Number(d.net_a_payer),
            d.observations,
          ]),
      ],
      [6, 12, 14, 14, 10, 14, 14, 14, 14, 50],
    ),
    "Décomptes",
  );

  XLSX.utils.book_append_sheet(
    wb,
    feuille(
      [
        ["Document", "Prestation", "Article CPS", "À fournir par", "Échéance", "Statut", "En retard", "Observations"],
        ...dossier.documents.map((d) => [d.nom, d.prestation, d.article_cps, d.responsable, d.echeance, d.statut, documentEnRetard(d, auj) ? "Oui" : "", d.observations]),
      ],
      [44, 20, 12, 16, 12, 12, 10, 50],
    ),
    "Documents",
  );

  XLSX.utils.book_append_sheet(
    wb,
    feuille(
      [
        ["Type", "Organisme", "Référence", "Montant", "Émission", "Expiration", "Statut", "Alerte"],
        ...dossier.garanties.map((g) => {
          const e = etatExpiration(g, auj);
          return [g.type, g.organisme, g.reference, g.montant, g.date_emission, g.date_expiration, g.statut, e === "expiree" ? "Expirée" : e === "proche" ? "Expire sous 30 j" : ""];
        }),
      ],
      [30, 24, 18, 14, 12, 12, 12, 16],
    ),
    "Garanties",
  );

  XLSX.utils.book_append_sheet(
    wb,
    feuille(
      [["Type", "N°", "Date d'effet", "Notification", "Jours supp.", "Objet"], ...dossier.ordres.map((o) => [TYPES_OS[o.type], o.numero, o.date_emission, o.date_notification, o.jours_supplementaires, o.objet])],
      [14, 10, 12, 12, 10, 50],
    ),
    "Ordres de service",
  );

  const nom = `marche-${m.numero.replace(/[^\w-]+/g, "_")}-${versIso(auj)}.xlsx`;
  XLSX.writeFile(wb, nom);
}

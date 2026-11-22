/**
 * Catalogue des données disponibles dans les modèles de documents.
 * Une seule définition sert à la fois à remplir les modèles et à afficher l'aide.
 */
import {
  aujourdhuiUtc,
  calculerReception,
  formatDate,
  formatMontant,
  formatPct,
  formatQte,
  montantLigneHT,
  montantMarche,
} from "../calculs";
import { projetCourant } from "../synthese";
import { BASES_PENALITE, TYPES_OS, type Decompte, type DossierMarche } from "../types";
import { montantEnLettres } from "./lettres";

export interface ContexteModele {
  dossier: DossierMarche;
  /** null = projet de décompte en cours ; sinon id d'un décompte enregistré. */
  decompteId: string | null;
}

type Calcul = ReturnType<typeof calculer>;
type Valeur = string | boolean | number;

function calculer({ dossier, decompteId }: ContexteModele) {
  const c = projetCourant(dossier);
  const auj = aujourdhuiUtc();
  const reception = calculerReception(dossier.marche, dossier.reserves, auj);
  const tries = [...dossier.decomptes].sort(
    (a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.numero.localeCompare(b.numero, "fr", { numeric: true }),
  );
  const somme = (l: Decompte[], f: (d: Decompte) => number) => l.reduce((s, d) => s + (Number(f(d)) || 0), 0);
  const i = decompteId ? tries.findIndex((d) => d.id === decompteId) : -1;
  const p = c.projet;

  // Décompte choisi : projet en cours, ou décompte enregistré avec ses montants sauvegardés.
  const decompte =
    i >= 0
      ? (() => {
          const d = tries[i];
          const avant = tries.slice(0, i);
          const precedents = somme(avant, (x) => x.montant_travaux);
          return {
            projet: false,
            numero: d.numero,
            date: d.date,
            travauxCumulesTTC: precedents + Number(d.montant_travaux),
            precedents,
            travauxPeriode: Number(d.montant_travaux),
            revision: Number(d.montant_revision),
            k: d.coefficient_k === null ? null : Number(d.coefficient_k),
            retenue: d.retenue_garantie === null ? null : Number(d.retenue_garantie),
            penalites: Number(d.montant_penalites),
            remboursement: Number(d.remboursement_avance),
            net: d.net_a_payer === null ? null : Number(d.net_a_payer),
            cumulApres: precedents + somme(avant, (x) => x.montant_revision) + Number(d.montant_travaux) + Number(d.montant_revision),
          };
        })()
      : {
          projet: true,
          numero: String(dossier.decomptes.length + 1),
          date: null as string | null,
          travauxCumulesTTC: p.cumulExecuteTTC,
          precedents: p.decomptesPrecedentsTTC,
          travauxPeriode: p.travauxPeriodeTTC,
          revision: p.revisionPeriodeTTC,
          k: p.k.k,
          retenue: p.retenuePeriode as number | null,
          penalites: p.penalitesPeriode,
          remboursement: p.remboursementPeriode,
          net: p.netAPayer as number | null,
          cumulApres: c.finances.montantAtteint + p.travauxPeriodeTTC + p.revisionPeriodeTTC,
        };
  return { ...c, dossier, auj, reception, decompte };
}

const intervenant = (x: Calcul, role: string) => {
  const i = x.dossier.intervenants.find((v) => v.role === role);
  return i ? i.organisme || i.nom : "";
};
const montant = (n: number | null | undefined) => (n === null || n === undefined ? "" : formatMontant(n));
const lettres = (n: number | null | undefined) => (n === null || n === undefined ? "" : montantEnLettres(n));
const nombre = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const dateLongue = (d: Date | string | null) => {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return x.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

export interface DefChampModele {
  cle: string;
  libelle: string;
  groupe: string;
  valeur: (x: Calcul) => Valeur;
}

export const CHAMPS: DefChampModele[] = [
  // Général
  { groupe: "Général", cle: "date_jour", libelle: "Date du jour (jj/mm/aaaa)", valeur: (x) => formatDate(x.auj) },
  { groupe: "Général", cle: "date_jour_longue", libelle: "Date du jour en toutes lettres (22 novembre 2026)", valeur: (x) => dateLongue(x.auj) },

  // Marché
  { groupe: "Marché", cle: "marche_numero", libelle: "N° du marché", valeur: (x) => x.dossier.marche.numero },
  { groupe: "Marché", cle: "marche_objet", libelle: "Objet du marché", valeur: (x) => x.dossier.marche.objet },
  { groupe: "Marché", cle: "marche_entreprise", libelle: "Entreprise titulaire", valeur: (x) => x.dossier.marche.entreprise },
  { groupe: "Marché", cle: "marche_statut", libelle: "Statut", valeur: (x) => x.dossier.marche.statut },
  { groupe: "Marché", cle: "marche_montant_initial", libelle: "Montant initial TTC", valeur: (x) => montant(Number(x.dossier.marche.montant_ttc)) },
  { groupe: "Marché", cle: "marche_montant_initial_lettres", libelle: "Montant initial TTC en lettres", valeur: (x) => lettres(Number(x.dossier.marche.montant_ttc)) },
  { groupe: "Marché", cle: "marche_montant_avenants", libelle: "Cumul des avenants TTC", valeur: (x) => montant(Number(x.dossier.marche.montant_avenants) || 0) },
  { groupe: "Marché", cle: "marche_montant", libelle: "Montant TTC avec avenants", valeur: (x) => montant(montantMarche(x.dossier.marche)) },
  { groupe: "Marché", cle: "marche_montant_lettres", libelle: "Montant TTC avec avenants, en lettres", valeur: (x) => lettres(montantMarche(x.dossier.marche)) },
  {
    groupe: "Marché",
    cle: "marche_montant_ht",
    libelle: "Montant HT avec avenants",
    valeur: (x) => montant(montantMarche(x.dossier.marche) / (1 + Number(x.dossier.marche.taux_tva) / 100)),
  },
  { groupe: "Marché", cle: "marche_delai_mois", libelle: "Délai d'exécution (mois)", valeur: (x) => nombre(Number(x.dossier.marche.duree_mois)) },
  { groupe: "Marché", cle: "marche_taux_tva", libelle: "Taux de TVA (%)", valeur: (x) => nombre(Number(x.dossier.marche.taux_tva)) },
  { groupe: "Marché", cle: "marche_taux_retenue", libelle: "Taux de retenue de garantie (%)", valeur: (x) => nombre(Number(x.dossier.marche.taux_retenue)) },
  { groupe: "Marché", cle: "marche_plafond_retenue", libelle: "Plafond de la retenue (%)", valeur: (x) => nombre(Number(x.dossier.marche.plafond_retenue)) },

  // Intervenants
  { groupe: "Intervenants", cle: "maitre_ouvrage", libelle: "Maître d'ouvrage", valeur: (x) => intervenant(x, "Maître d'ouvrage") },
  { groupe: "Intervenants", cle: "maitre_ouvrage_delegue", libelle: "Maître d'ouvrage délégué", valeur: (x) => intervenant(x, "Maître d'ouvrage délégué") },
  { groupe: "Intervenants", cle: "architecte", libelle: "Architecte", valeur: (x) => intervenant(x, "Architecte") },
  { groupe: "Intervenants", cle: "bet", libelle: "Bureau d'études", valeur: (x) => intervenant(x, "BET") },
  { groupe: "Intervenants", cle: "controle_technique", libelle: "Contrôle technique", valeur: (x) => intervenant(x, "Contrôle technique") },
  { groupe: "Intervenants", cle: "laboratoire", libelle: "Laboratoire", valeur: (x) => intervenant(x, "Laboratoire") },
  {
    groupe: "Intervenants",
    cle: "entreprise_contact",
    libelle: "Contact de l'entreprise (nom)",
    valeur: (x) => x.dossier.intervenants.find((i) => i.role === "Entreprise")?.nom ?? "",
  },
  {
    groupe: "Intervenants",
    cle: "entreprise_telephone",
    libelle: "Téléphone de l'entreprise",
    valeur: (x) => x.dossier.intervenants.find((i) => i.role === "Entreprise")?.telephone ?? "",
  },
  {
    groupe: "Intervenants",
    cle: "entreprise_email",
    libelle: "E-mail de l'entreprise",
    valeur: (x) => x.dossier.intervenants.find((i) => i.role === "Entreprise")?.email ?? "",
  },

  // Délais
  { groupe: "Délais", cle: "date_demarrage", libelle: "Date de démarrage", valeur: (x) => formatDate(x.delais.dateDemarrage) },
  {
    groupe: "Délais",
    cle: "os_demarrage_numero",
    libelle: "N° de l'OS de démarrage",
    valeur: (x) => x.dossier.ordres.find((o) => o.type === "demarrage")?.numero ?? "",
  },
  { groupe: "Délais", cle: "date_fin_contractuelle", libelle: "Fin contractuelle (sans arrêts ni prolongations)", valeur: (x) => formatDate(x.delais.finContractuelle) },
  { groupe: "Délais", cle: "date_fin_prevue", libelle: "Fin prévue", valeur: (x) => formatDate(x.delais.finPrevue) },
  { groupe: "Délais", cle: "jours_arret", libelle: "Jours d'arrêt", valeur: (x) => String(x.delais.joursArret) },
  { groupe: "Délais", cle: "jours_prolongation", libelle: "Jours de prolongation (OS)", valeur: (x) => String(x.delais.joursProlongation) },
  { groupe: "Délais", cle: "jours_avenants", libelle: "Jours accordés par avenant", valeur: (x) => String(x.delais.joursAvenants) },
  { groupe: "Délais", cle: "jours_restants", libelle: "Jours restants (0 si dépassé)", valeur: (x) => String(Math.max(0, x.delais.joursRestants ?? 0)) },
  { groupe: "Délais", cle: "en_retard", libelle: "Condition : délai dépassé", valeur: (x) => x.penalites.joursRetard > 0 },
  { groupe: "Délais", cle: "arret_en_cours", libelle: "Condition : arrêt en cours", valeur: (x) => x.delais.arretEnCours },

  // Pénalités
  { groupe: "Pénalités", cle: "penalites_jours_retard", libelle: "Jours de retard", valeur: (x) => String(x.penalites.joursRetard) },
  { groupe: "Pénalités", cle: "penalites_jours_exoneres", libelle: "Jours exonérés", valeur: (x) => String(x.penalites.joursExoneres) },
  { groupe: "Pénalités", cle: "penalites_jours", libelle: "Jours pénalisables", valeur: (x) => String(x.penalites.joursPenalisables) },
  { groupe: "Pénalités", cle: "penalites_date_reference", libelle: "Date d'arrêt du retard", valeur: (x) => formatDate(x.penalites.dateReference) },
  { groupe: "Pénalités", cle: "penalites_taux", libelle: "Taux (‰ par jour)", valeur: (x) => nombre(x.dossier.marche.penalite_taux_millieme) },
  {
    groupe: "Pénalités",
    cle: "penalites_base_libelle",
    libelle: "Base de calcul (libellé)",
    valeur: (x) => BASES_PENALITE[x.dossier.marche.penalite_base]?.toLowerCase() ?? "",
  },
  { groupe: "Pénalités", cle: "penalites_base", libelle: "Montant de base", valeur: (x) => montant(x.penalites.base) },
  { groupe: "Pénalités", cle: "penalites_par_jour", libelle: "Pénalité par jour", valeur: (x) => montant(x.penalites.parJour) },
  { groupe: "Pénalités", cle: "penalites_plafond", libelle: "Plafond (montant)", valeur: (x) => montant(x.penalites.plafond) },
  { groupe: "Pénalités", cle: "penalites_plafond_pct", libelle: "Plafond (%)", valeur: (x) => nombre(x.dossier.marche.penalite_plafond) },
  { groupe: "Pénalités", cle: "penalites_montant", libelle: "Pénalités encourues", valeur: (x) => montant(x.penalites.montant) },
  { groupe: "Pénalités", cle: "penalites_montant_lettres", libelle: "Pénalités encourues en lettres", valeur: (x) => lettres(x.penalites.montant) },
  { groupe: "Pénalités", cle: "penalites_plafond_atteint", libelle: "Condition : plafond atteint", valeur: (x) => x.penalites.plafonne },

  // Décompte
  { groupe: "Décompte", cle: "decompte_numero", libelle: "N° du décompte", valeur: (x) => x.decompte.numero },
  { groupe: "Décompte", cle: "decompte_date", libelle: "Date du décompte", valeur: (x) => (x.decompte.date ? formatDate(x.decompte.date) : formatDate(x.auj)) },
  { groupe: "Décompte", cle: "decompte_est_projet", libelle: "Condition : décompte en projet", valeur: (x) => x.decompte.projet },
  { groupe: "Décompte", cle: "decompte_travaux_cumules", libelle: "Travaux cumulés TTC", valeur: (x) => montant(x.decompte.travauxCumulesTTC) },
  { groupe: "Décompte", cle: "decompte_precedents", libelle: "Décomptes précédents (travaux TTC)", valeur: (x) => montant(x.decompte.precedents) },
  { groupe: "Décompte", cle: "decompte_travaux_periode", libelle: "Travaux de la période TTC", valeur: (x) => montant(x.decompte.travauxPeriode) },
  { groupe: "Décompte", cle: "decompte_revision", libelle: "Révision des prix TTC", valeur: (x) => montant(x.decompte.revision) },
  { groupe: "Décompte", cle: "decompte_k", libelle: "Coefficient K", valeur: (x) => (x.decompte.k === null ? "" : x.decompte.k.toFixed(4).replace(".", ",")) },
  { groupe: "Décompte", cle: "decompte_retenue", libelle: "Retenue de garantie de la période", valeur: (x) => montant(x.decompte.retenue) },
  { groupe: "Décompte", cle: "decompte_penalites", libelle: "Pénalités de la période", valeur: (x) => montant(x.decompte.penalites) },
  { groupe: "Décompte", cle: "decompte_remboursement_avance", libelle: "Remboursement de l'avance", valeur: (x) => montant(x.decompte.remboursement) },
  { groupe: "Décompte", cle: "decompte_net_a_payer", libelle: "Net à payer TTC", valeur: (x) => montant(x.decompte.net) },
  { groupe: "Décompte", cle: "decompte_net_a_payer_lettres", libelle: "Net à payer en lettres", valeur: (x) => lettres(x.decompte.net) },
  { groupe: "Décompte", cle: "decompte_cumul_apres", libelle: "Cumul travaux + révision après ce décompte", valeur: (x) => montant(x.decompte.cumulApres) },

  // Situation financière
  { groupe: "Finances", cle: "montant_atteint", libelle: "Montant atteint TTC (décomptes)", valeur: (x) => montant(x.finances.montantAtteint) },
  { groupe: "Finances", cle: "retenue_cumulee", libelle: "Retenue de garantie cumulée", valeur: (x) => montant(x.finances.retenue) },
  { groupe: "Finances", cle: "penalites_imputees", libelle: "Pénalités imputées (décomptes)", valeur: (x) => montant(x.finances.cumulPenalites) },
  { groupe: "Finances", cle: "avance_montant", libelle: "Avance", valeur: (x) => montant(x.finances.avance) },
  { groupe: "Finances", cle: "avance_remboursee", libelle: "Avance remboursée", valeur: (x) => montant(x.finances.cumulRemboursement) },
  { groupe: "Finances", cle: "avance_restante", libelle: "Avance restant à rembourser", valeur: (x) => montant(x.finances.avanceRestante) },
  { groupe: "Finances", cle: "reste_a_realiser", libelle: "Reste à réaliser", valeur: (x) => montant(x.finances.reste) },
  { groupe: "Finances", cle: "avancement_physique", libelle: "Avancement physique (%)", valeur: (x) => formatPct(x.physique.avancement) },
  { groupe: "Finances", cle: "avancement_financier", libelle: "Avancement financier (%)", valeur: (x) => formatPct(x.finances.part) },
  { groupe: "Finances", cle: "delai_ecoule", libelle: "Délai écoulé (%)", valeur: (x) => formatPct(x.delais.tempsEcoule) },

  // Réception
  { groupe: "Réception", cle: "date_reception_provisoire", libelle: "Date de réception provisoire", valeur: (x) => formatDate(x.reception.dateProvisoire) },
  { groupe: "Réception", cle: "date_reception_definitive", libelle: "Date de réception définitive (prononcée ou prévue)", valeur: (x) => formatDate(x.reception.dateDefinitive) },
  { groupe: "Réception", cle: "delai_garantie_mois", libelle: "Délai de garantie (mois)", valeur: (x) => nombre(x.dossier.marche.delai_garantie_mois) },
  { groupe: "Réception", cle: "reserves_ouvertes", libelle: "Nombre de réserves ouvertes", valeur: (x) => String(x.reception.ouvertes) },
  { groupe: "Réception", cle: "reserves_levees", libelle: "Nombre de réserves levées", valeur: (x) => String(x.reception.levees) },
];

export interface DefBoucle {
  cle: string;
  libelle: string;
  champs: { cle: string; libelle: string }[];
  lignes: (x: Calcul) => Record<string, Valeur>[];
}

const avecRang = (l: Record<string, Valeur>[]) => l.map((v, i) => ({ rang: String(i + 1), ...v }));

export const BOUCLES: DefBoucle[] = [
  {
    cle: "lignes_decompte",
    libelle: "Prix exécutés (quantités cumulées)",
    champs: [
      { cle: "numero", libelle: "N° de prix" },
      { cle: "designation", libelle: "Désignation" },
      { cle: "unite", libelle: "Unité" },
      { cle: "quantite", libelle: "Quantité cumulée" },
      { cle: "prix_unitaire", libelle: "Prix unitaire HT" },
      { cle: "montant", libelle: "Montant HT" },
    ],
    lignes: (x) =>
      avecRang(
        x.physique.lignes
          .filter((l) => l.qteExecutee > 0)
          .map((l) => ({
            numero: l.ligne.numero,
            designation: l.ligne.designation,
            unite: l.ligne.unite,
            quantite: formatQte(l.qteExecutee),
            prix_unitaire: montant(l.ligne.prix_unitaire),
            montant: montant(l.montantExecute),
          })),
      ),
  },
  {
    cle: "bpde",
    libelle: "Lignes du BPDE",
    champs: [
      { cle: "numero", libelle: "N° de prix" },
      { cle: "designation", libelle: "Désignation" },
      { cle: "unite", libelle: "Unité" },
      { cle: "quantite", libelle: "Quantité" },
      { cle: "prix_unitaire", libelle: "Prix unitaire HT" },
      { cle: "montant", libelle: "Montant HT" },
    ],
    lignes: (x) =>
      avecRang(
        x.dossier.bpde.map((l) => ({
          numero: l.numero,
          designation: l.designation,
          unite: l.unite,
          quantite: formatQte(Number(l.quantite)),
          prix_unitaire: montant(l.prix_unitaire),
          montant: montant(montantLigneHT(l)),
        })),
      ),
  },
  {
    cle: "ecarts",
    libelle: "Écarts marché / exécuté",
    champs: [
      { cle: "numero", libelle: "N° de prix" },
      { cle: "designation", libelle: "Désignation" },
      { cle: "unite", libelle: "Unité" },
      { cle: "qte_marche", libelle: "Quantité du marché" },
      { cle: "qte_executee", libelle: "Quantité exécutée" },
      { cle: "ecart", libelle: "Écart" },
      { cle: "ecart_pct", libelle: "Écart %" },
      { cle: "montant_marche", libelle: "Montant marché HT" },
      { cle: "montant_execute", libelle: "Montant exécuté HT" },
      { cle: "ecart_montant", libelle: "Écart HT" },
    ],
    lignes: (x) =>
      avecRang(
        x.physique.lignes.map((l) => ({
          numero: l.ligne.numero,
          designation: l.ligne.designation,
          unite: l.ligne.unite,
          qte_marche: formatQte(l.qteMarche),
          qte_executee: formatQte(l.qteExecutee),
          ecart: formatQte(l.ecart),
          ecart_pct: formatPct(l.ecartPct),
          montant_marche: montant(l.montantMarche),
          montant_execute: montant(l.montantExecute),
          ecart_montant: montant(l.ecartMontant),
        })),
      ),
  },
  {
    cle: "decomptes",
    libelle: "Décomptes enregistrés",
    champs: [
      { cle: "numero", libelle: "N°" },
      { cle: "date", libelle: "Date" },
      { cle: "travaux", libelle: "Travaux TTC" },
      { cle: "revision", libelle: "Révision TTC" },
      { cle: "penalites", libelle: "Pénalités" },
      { cle: "remboursement", libelle: "Remboursement d'avance" },
      { cle: "net", libelle: "Net à payer" },
    ],
    lignes: (x) =>
      avecRang(
        [...x.dossier.decomptes]
          .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
          .map((d) => ({
            numero: d.numero,
            date: formatDate(d.date),
            travaux: montant(Number(d.montant_travaux)),
            revision: montant(Number(d.montant_revision)),
            penalites: montant(Number(d.montant_penalites)),
            remboursement: montant(Number(d.remboursement_avance)),
            net: montant(d.net_a_payer === null ? null : Number(d.net_a_payer)),
          })),
      ),
  },
  {
    cle: "ordres_service",
    libelle: "Ordres de service",
    champs: [
      { cle: "type", libelle: "Type" },
      { cle: "numero", libelle: "N°" },
      { cle: "date", libelle: "Date d'effet" },
      { cle: "notification", libelle: "Date de notification" },
      { cle: "jours", libelle: "Jours supplémentaires" },
      { cle: "objet", libelle: "Objet" },
    ],
    lignes: (x) =>
      avecRang(
        [...x.dossier.ordres]
          .sort((a, b) => (a.date_emission ?? "").localeCompare(b.date_emission ?? ""))
          .map((o) => ({
            type: TYPES_OS[o.type],
            numero: o.numero,
            date: formatDate(o.date_emission),
            notification: formatDate(o.date_notification),
            jours: o.jours_supplementaires ? String(o.jours_supplementaires) : "",
            objet: o.objet,
          })),
      ),
  },
  {
    cle: "avenants",
    libelle: "Avenants",
    champs: [
      { cle: "numero", libelle: "N°" },
      { cle: "date", libelle: "Date" },
      { cle: "objet", libelle: "Objet" },
      { cle: "montant", libelle: "Variation TTC" },
      { cle: "jours", libelle: "Variation du délai (j)" },
    ],
    lignes: (x) =>
      avecRang(
        x.dossier.avenants.map((a) => ({
          numero: a.numero,
          date: formatDate(a.date),
          objet: a.objet,
          montant: montant(Number(a.montant_ttc)),
          jours: String(a.jours_supplementaires),
        })),
      ),
  },
  {
    cle: "documents",
    libelle: "Documents à fournir",
    champs: [
      { cle: "nom", libelle: "Document" },
      { cle: "prestation", libelle: "Prestation" },
      { cle: "article_cps", libelle: "Article du CPS" },
      { cle: "responsable", libelle: "À fournir par" },
      { cle: "echeance", libelle: "Échéance" },
      { cle: "statut", libelle: "Statut" },
    ],
    lignes: (x) =>
      avecRang(
        x.dossier.documents.map((d) => ({
          nom: d.nom,
          prestation: d.prestation,
          article_cps: d.article_cps,
          responsable: d.responsable,
          echeance: formatDate(d.echeance),
          statut: d.statut,
        })),
      ),
  },
  {
    cle: "reserves",
    libelle: "Réserves",
    champs: [
      { cle: "numero", libelle: "N°" },
      { cle: "designation", libelle: "Réserve" },
      { cle: "localisation", libelle: "Localisation" },
      { cle: "responsable", libelle: "À lever par" },
      { cle: "echeance", libelle: "Délai de levée" },
      { cle: "statut", libelle: "Statut" },
      { cle: "date_levee", libelle: "Levée le" },
    ],
    lignes: (x) =>
      avecRang(
        [...x.dossier.reserves]
          .sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }))
          .map((r) => ({
            numero: r.numero,
            designation: r.designation,
            localisation: r.localisation,
            responsable: r.responsable,
            echeance: formatDate(r.echeance),
            statut: r.statut,
            date_levee: formatDate(r.date_levee),
          })),
      ),
  },
  {
    cle: "garanties",
    libelle: "Cautions et assurances",
    champs: [
      { cle: "type", libelle: "Type" },
      { cle: "organisme", libelle: "Organisme" },
      { cle: "reference", libelle: "Référence" },
      { cle: "montant", libelle: "Montant" },
      { cle: "date_expiration", libelle: "Expiration" },
      { cle: "statut", libelle: "Statut" },
    ],
    lignes: (x) =>
      avecRang(
        x.dossier.garanties.map((g) => ({
          type: g.type,
          organisme: g.organisme,
          reference: g.reference,
          montant: montant(g.montant),
          date_expiration: formatDate(g.date_expiration),
          statut: g.statut,
        })),
      ),
  },
  {
    cle: "intervenants",
    libelle: "Intervenants",
    champs: [
      { cle: "role", libelle: "Rôle" },
      { cle: "nom", libelle: "Nom" },
      { cle: "organisme", libelle: "Organisme" },
      { cle: "telephone", libelle: "Téléphone" },
      { cle: "email", libelle: "E-mail" },
    ],
    lignes: (x) =>
      avecRang(x.dossier.intervenants.map((i) => ({ role: i.role, nom: i.nom, organisme: i.organisme, telephone: i.telephone, email: i.email }))),
  },
];

/** Toutes les clés connues (champs et boucles). */
export const CLES_CONNUES = new Set([...CHAMPS.map((c) => c.cle), ...BOUCLES.map((b) => b.cle)]);

/** Données complètes d'un marché pour remplir un modèle. */
export function construireDonnees(ctx: ContexteModele): Record<string, unknown> {
  const x = calculer(ctx);
  const donnees: Record<string, unknown> = {};
  for (const c of CHAMPS) donnees[c.cle] = c.valeur(x);
  for (const b of BOUCLES) donnees[b.cle] = b.lignes(x);
  return donnees;
}

/** Valeurs d'exemple pour l'aide (premier élément des boucles). */
export function apercuValeurs(ctx: ContexteModele): Record<string, string> {
  const d = construireDonnees(ctx);
  const res: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (Array.isArray(v)) res[k] = `${v.length} ligne(s)`;
    else res[k] = typeof v === "boolean" ? (v ? "vrai" : "faux") : String(v);
  }
  return res;
}

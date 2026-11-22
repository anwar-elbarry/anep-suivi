/**
 * Moteur de calcul du suivi des travaux.
 * Fonctions pures : la date du jour est toujours passée en paramètre pour rester testable.
 */
import type {
  Attachement,
  Garantie,
  BpdeLigne,
  Decompte,
  DocumentAFournir,
  IndiceRevision,
  Reserve,
  Marche,
  OrdreService,
} from "./types";

const JOUR_MS = 86_400_000;

/** Montant du marché modifié par les avenants (TTC). */
export const montantMarche = (m: Marche) => (Number(m.montant_ttc) || 0) + (Number(m.montant_avenants) || 0);

export const arrondi2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "2026-03-15" -> Date à minuit UTC (évite les décalages de fuseau). */
export function versDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !j) return null;
  return new Date(Date.UTC(a, m - 1, j));
}

export function versIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Date du jour à minuit UTC. */
export function aujourdhuiUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function ajouterJours(d: Date, n: number): Date {
  return new Date(d.getTime() + Math.round(n) * JOUR_MS);
}

export function ecartJours(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / JOUR_MS);
}

/** Ajoute une durée en mois (la partie décimale est convertie à raison de 30 jours par mois). */
export function ajouterMois(d: Date, mois: number): Date {
  const entiers = Math.trunc(mois);
  const res = new Date(d.getTime());
  const jour = res.getUTCDate();
  res.setUTCDate(1);
  res.setUTCMonth(res.getUTCMonth() + entiers);
  const dernierJour = new Date(Date.UTC(res.getUTCFullYear(), res.getUTCMonth() + 1, 0)).getUTCDate();
  res.setUTCDate(Math.min(jour, dernierJour));
  return ajouterJours(res, (mois - entiers) * 30);
}

/** Date d'effet d'un OS : date d'émission, à défaut date de notification. */
export function dateEffetOS(os: OrdreService): Date | null {
  return versDate(os.date_emission) ?? versDate(os.date_notification);
}

// ---------------------------------------------------------------------------
// Délais
// ---------------------------------------------------------------------------

export interface PeriodeArret {
  debut: Date;
  fin: Date | null; // null = arrêt en cours
  jours: number;
}

export interface Delais {
  dateDemarrage: Date | null;
  sourceDemarrage: "os" | "marche" | null;
  finContractuelle: Date | null; // démarrage + durée, sans arrêts ni prolongations
  arrets: PeriodeArret[];
  joursArret: number;
  arretEnCours: boolean;
  joursProlongation: number;
  joursAvenants: number;
  finPrevue: Date | null;
  /** > 0 : jours restants ; < 0 : jours de retard. */
  joursRestants: number | null;
  /** Part du délai écoulée (0 à 1), hors périodes d'arrêt. */
  tempsEcoule: number;
  anomalies: string[];
}

export function calculerDelais(marche: Marche, ordres: OrdreService[], aujourdhui: Date): Delais {
  const anomalies: string[] = [];
  const tries = [...ordres]
    .filter((o) => dateEffetOS(o))
    .sort((a, b) => dateEffetOS(a)!.getTime() - dateEffetOS(b)!.getTime());

  const osDemarrage = tries.find((o) => o.type === "demarrage");
  let dateDemarrage: Date | null = null;
  let sourceDemarrage: Delais["sourceDemarrage"] = null;
  if (osDemarrage) {
    dateDemarrage = dateEffetOS(osDemarrage);
    sourceDemarrage = "os";
  } else if (marche.date_debut) {
    dateDemarrage = versDate(marche.date_debut);
    sourceDemarrage = "marche";
  }

  // Arrêts : d'un OS d'arrêt à l'OS de reprise suivant ; un arrêt non repris court jusqu'à aujourd'hui.
  const arrets: PeriodeArret[] = [];
  let ouvert: Date | null = null;
  for (const os of tries) {
    const d = dateEffetOS(os)!;
    if (os.type === "arret") {
      if (ouvert) anomalies.push(`OS d'arrêt ${os.numero || ""} émis alors qu'un arrêt est déjà en cours`.trim());
      else ouvert = d;
    } else if (os.type === "reprise") {
      if (!ouvert) {
        anomalies.push(`OS de reprise ${os.numero || ""} sans arrêt préalable`.trim());
      } else {
        arrets.push({ debut: ouvert, fin: d, jours: Math.max(0, ecartJours(ouvert, d)) });
        ouvert = null;
      }
    }
  }
  if (ouvert) {
    arrets.push({ debut: ouvert, fin: null, jours: Math.max(0, ecartJours(ouvert, aujourdhui)) });
  }

  const joursArret = arrets.reduce((s, a) => s + a.jours, 0);
  const joursProlongation = ordres.reduce((s, o) => s + (Number(o.jours_supplementaires) || 0), 0);
  const joursAvenants = Number(marche.jours_avenants) || 0;

  if (!dateDemarrage) {
    return {
      dateDemarrage: null,
      sourceDemarrage: null,
      finContractuelle: null,
      arrets,
      joursArret,
      arretEnCours: ouvert !== null,
      joursProlongation,
      joursAvenants,
      finPrevue: null,
      joursRestants: null,
      tempsEcoule: 0,
      anomalies,
    };
  }

  if (osDemarrage && marche.date_debut && versIso(dateDemarrage) !== marche.date_debut) {
    anomalies.push("La date de début saisie sur le marché diffère de l'OS de démarrage (l'OS fait foi)");
  }

  const finContractuelle = ajouterMois(dateDemarrage, Number(marche.duree_mois) || 0);
  const finPrevue = ajouterJours(finContractuelle, joursArret + joursProlongation + joursAvenants);
  const joursRestants = ecartJours(aujourdhui, finPrevue);

  const delaiTotal = ecartJours(dateDemarrage, finPrevue) - joursArret;
  const ecouleBrut = ecartJours(dateDemarrage, aujourdhui) - joursArret;
  const tempsEcoule = delaiTotal > 0 ? Math.min(1, Math.max(0, ecouleBrut / delaiTotal)) : 0;

  return {
    dateDemarrage,
    sourceDemarrage,
    finContractuelle,
    arrets,
    joursArret,
    arretEnCours: ouvert !== null,
    joursProlongation,
    joursAvenants,
    finPrevue,
    joursRestants,
    tempsEcoule,
    anomalies,
  };
}

// ---------------------------------------------------------------------------
// BPDE
// ---------------------------------------------------------------------------

/** Normalise un libellé pour le rapprochement : minuscules, sans accents ni ponctuation. */
export function normaliser(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normaliserNumero(s: string | null | undefined): string {
  return normaliser(s).replace(/\s+/g, "").replace(/^0+(?=\d)/, "");
}

export const montantLigneHT = (l: Pick<BpdeLigne, "quantite" | "prix_unitaire">) =>
  (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0);

export function totalBpdeHT(bpde: BpdeLigne[]): number {
  return bpde.reduce((s, l) => s + montantLigneHT(l), 0);
}

export interface AlerteBpde {
  ligneId: string | null; // null = alerte globale
  niveau: "erreur" | "attention";
  message: string;
}

export function verifierBpde(bpde: BpdeLigne[], marche: Marche): AlerteBpde[] {
  const alertes: AlerteBpde[] = [];
  const parNumero = new Map<string, number>();
  const parDesignation = new Map<string, number>();
  for (const l of bpde) {
    const n = normaliserNumero(l.numero);
    const d = normaliser(l.designation);
    if (n) parNumero.set(n, (parNumero.get(n) ?? 0) + 1);
    if (d) parDesignation.set(d, (parDesignation.get(d) ?? 0) + 1);
  }

  for (const l of bpde) {
    if (l.prix_unitaire === null || l.prix_unitaire === undefined || Number(l.prix_unitaire) <= 0) {
      alertes.push({ ligneId: l.id, niveau: "erreur", message: "Prix unitaire manquant ou nul" });
    }
    if (!Number(l.quantite)) {
      alertes.push({ ligneId: l.id, niveau: "attention", message: "Quantité nulle" });
    }
    if (!normaliser(l.designation)) {
      alertes.push({ ligneId: l.id, niveau: "erreur", message: "Désignation vide" });
    }
    const n = normaliserNumero(l.numero);
    if (n && (parNumero.get(n) ?? 0) > 1) {
      alertes.push({ ligneId: l.id, niveau: "erreur", message: `N° de prix ${l.numero} en double` });
    }
    const d = normaliser(l.designation);
    if (d && (parDesignation.get(d) ?? 0) > 1) {
      alertes.push({ ligneId: l.id, niveau: "attention", message: "Désignation en double : le rapprochement par libellé sera ambigu" });
    }
    if (l.montant_importe !== null && l.montant_importe !== undefined && l.prix_unitaire !== null) {
      const calcule = montantLigneHT(l);
      if (Math.abs(calcule - Number(l.montant_importe)) > 1) {
        alertes.push({
          ligneId: l.id,
          niveau: "erreur",
          message: `Montant importé (${formatMontant(Number(l.montant_importe))}) ≠ quantité × prix (${formatMontant(calcule)})`,
        });
      }
    }
  }

  const montant = montantMarche(marche);
  if (bpde.length && montant > 0) {
    const ttc = totalBpdeHT(bpde) * (1 + Number(marche.taux_tva) / 100);
    const ecart = ttc - montant;
    if (Math.abs(ecart) > Math.max(1, montant * 0.001)) {
      alertes.push({
        ligneId: null,
        niveau: "attention",
        message: `Total BPDE TTC (${formatMontant(ttc)}) différent du montant du marché${marche.montant_avenants ? " avec avenants" : ""} (${formatMontant(montant)}) : écart ${formatMontant(ecart)}`,
      });
    }
  }
  return alertes;
}

// ---------------------------------------------------------------------------
// Rapprochement attachements / BPDE et état physique
// ---------------------------------------------------------------------------

export interface Rapprochement {
  /** Quantité exécutée par id de ligne BPDE. */
  quantites: Map<string, number>;
  nonRapprochees: { attachement: string; numero: string; designation: string; quantite: number }[];
  attachementsPris: string[];
}

/** Cherche la ligne BPDE d'une ligne d'attachement : d'abord par n° de prix, puis par désignation. */
export function trouverLigneBpde(
  ligne: { numero: string; designation: string },
  bpde: BpdeLigne[],
): BpdeLigne | null {
  const n = normaliserNumero(ligne.numero);
  if (n) {
    const parNumero = bpde.filter((b) => normaliserNumero(b.numero) === n);
    if (parNumero.length === 1) return parNumero[0];
  }
  const d = normaliser(ligne.designation);
  if (d) {
    const parLibelle = bpde.filter((b) => normaliser(b.designation) === d);
    if (parLibelle.length === 1) return parLibelle[0];
  }
  return null;
}

function trierAttachements(atts: Attachement[]): Attachement[] {
  return [...atts].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return da < db ? -1 : 1;
    return (Number(a.numero) || 0) - (Number(b.numero) || 0);
  });
}

/**
 * Quantités exécutées : somme des attachements (non rejetés), ou dernier attachement
 * si les attachements sont cumulatifs.
 */
export function rapprocher(attachements: Attachement[], bpde: BpdeLigne[], cumulatifs: boolean): Rapprochement {
  const retenus = trierAttachements(attachements.filter((a) => a.statut !== "Rejeté"));
  const pris = cumulatifs ? retenus.slice(-1) : retenus;
  const quantites = new Map<string, number>();
  const nonRapprochees: Rapprochement["nonRapprochees"] = [];
  for (const att of pris) {
    for (const l of att.attachement_lignes ?? []) {
      const b = trouverLigneBpde(l, bpde);
      const q = Number(l.quantite) || 0;
      if (b) quantites.set(b.id, (quantites.get(b.id) ?? 0) + q);
      else nonRapprochees.push({ attachement: att.numero, numero: l.numero, designation: l.designation, quantite: q });
    }
  }
  return { quantites, nonRapprochees, attachementsPris: pris.map((a) => a.id) };
}

export interface LigneEcart {
  ligne: BpdeLigne;
  qteMarche: number;
  qteExecutee: number;
  taux: number; // plafonné à 1
  ecart: number; // exécuté - marché
  ecartPct: number | null;
  montantMarche: number; // HT
  montantExecute: number; // HT
  ecartMontant: number; // HT
  depassement: boolean;
}

export interface EtatPhysique {
  lignes: LigneEcart[];
  avancement: number; // 0..1, pondéré par la valeur des lignes
  montantMarcheHT: number;
  montantExecuteHT: number;
}

export function etatPhysique(bpde: BpdeLigne[], quantites: Map<string, number>): EtatPhysique {
  let poidsTotal = 0;
  let poidsRealise = 0;
  let montantMarcheHT = 0;
  let montantExecuteHT = 0;
  const lignes = bpde.map((l) => {
    const qteMarche = Number(l.quantite) || 0;
    const pu = Number(l.prix_unitaire) || 0;
    const qteExecutee = quantites.get(l.id) ?? 0;
    const taux = qteMarche > 0 ? Math.min(1, qteExecutee / qteMarche) : qteExecutee > 0 ? 1 : 0;
    const montantMarche = qteMarche * pu;
    const montantExecute = qteExecutee * pu;
    poidsTotal += montantMarche;
    poidsRealise += montantMarche * taux;
    montantMarcheHT += montantMarche;
    montantExecuteHT += montantExecute;
    const ecart = qteExecutee - qteMarche;
    return {
      ligne: l,
      qteMarche,
      qteExecutee,
      taux,
      ecart,
      ecartPct: qteMarche > 0 ? ecart / qteMarche : null,
      montantMarche,
      montantExecute,
      ecartMontant: montantExecute - montantMarche,
      depassement: qteExecutee > qteMarche + 1e-9,
    };
  });
  return {
    lignes,
    avancement: poidsTotal > 0 ? poidsRealise / poidsTotal : 0,
    montantMarcheHT,
    montantExecuteHT,
  };
}

// ---------------------------------------------------------------------------
// Finances
// ---------------------------------------------------------------------------

export function retenueGarantie(cumulPaye: number, marche: Marche): number {
  if (marche.retenue_remplacee_par_caution) return 0;
  const brute = (Number(marche.taux_retenue) / 100) * Math.max(0, cumulPaye);
  const plafond = (Number(marche.plafond_retenue) / 100) * montantMarche(marche);
  return arrondi2(Math.min(brute, plafond));
}

// ---------------------------------------------------------------------------
// Pénalités de retard
// ---------------------------------------------------------------------------

export interface Penalites {
  /** Taux renseigné sur le marché. */
  parametre: boolean;
  /** Date à laquelle le retard est arrêté : réception provisoire, à défaut aujourd'hui. */
  dateReference: Date;
  arreteeALaReception: boolean;
  joursRetard: number;
  joursExoneres: number;
  joursPenalisables: number;
  base: number; // selon marche.penalite_base
  parJour: number;
  plafond: number | null;
  montant: number;
  plafonne: boolean;
}

/** Base des pénalités selon le choix du marché (montant initial ou avec avenants, TTC ou HT). */
export function basePenalites(marche: Marche): number {
  const choix = marche.penalite_base ?? "initial_ttc";
  const ttc = choix.startsWith("actuel") ? montantMarche(marche) : Number(marche.montant_ttc) || 0;
  return choix.endsWith("_ht") ? ttc / (1 + Number(marche.taux_tva) / 100) : ttc;
}

/**
 * Pénalités = taux (‰ par jour) × montant du marché × jours de retard non exonérés, limitées au plafond (% du marché).
 * Taux, plafond et base sont à reprendre du CPS.
 */
export function calculerPenalites(marche: Marche, delais: Delais, aujourdhui: Date): Penalites {
  const reception = versDate(marche.date_reception_provisoire);
  const dateReference = reception ?? aujourdhui;
  const joursRetard = delais.finPrevue ? Math.max(0, ecartJours(delais.finPrevue, dateReference)) : 0;
  const joursExoneres = Math.min(joursRetard, Math.max(0, Number(marche.penalite_jours_exoneres) || 0));
  const joursPenalisables = joursRetard - joursExoneres;
  const taux = Number(marche.penalite_taux_millieme) || 0;
  const parametre = taux > 0;
  const base = basePenalites(marche);
  const parJour = parametre ? (base * taux) / 1000 : 0;
  const brut = parJour * joursPenalisables;
  const plafond =
    marche.penalite_plafond !== null && marche.penalite_plafond !== undefined && Number(marche.penalite_plafond) > 0
      ? (base * Number(marche.penalite_plafond)) / 100
      : null;
  const montant = plafond !== null ? Math.min(brut, plafond) : brut;
  return {
    parametre,
    dateReference,
    arreteeALaReception: reception !== null,
    joursRetard,
    joursExoneres,
    joursPenalisables,
    base,
    parJour: arrondi2(parJour),
    plafond: plafond === null ? null : arrondi2(plafond),
    montant: arrondi2(montant),
    plafonne: plafond !== null && brut > plafond,
  };
}

// ---------------------------------------------------------------------------
// Avance
// ---------------------------------------------------------------------------

/**
 * Remboursement cumulé de l'avance : linéaire entre deux seuils d'avancement des travaux
 * (cumul des travaux TTC / montant du marché). Seuils 0 % et 100 % = remboursement au prorata.
 */
export function remboursementAvanceCumule(marche: Marche, cumulTravauxTTC: number): number {
  const avance = Number(marche.avance_montant) || 0;
  const montant = montantMarche(marche);
  if (avance <= 0 || montant <= 0) return 0;
  const debut = Number(marche.avance_debut_remboursement) || 0;
  const fin = Number(marche.avance_fin_remboursement) || 100;
  if (fin <= debut) return 0;
  const pct = (Math.max(0, cumulTravauxTTC) / montant) * 100;
  const part = Math.min(1, Math.max(0, (pct - debut) / (fin - debut)));
  return arrondi2(avance * part);
}

// ---------------------------------------------------------------------------
// Situation financière
// ---------------------------------------------------------------------------

export interface SituationFinanciere {
  montantAtteint: number; // TTC, travaux + révision
  cumulTravaux: number;
  cumulRevision: number;
  part: number; // montant atteint / montant du marché
  retenue: number;
  cumulPenalites: number;
  avance: number;
  cumulRemboursement: number;
  avanceRestante: number;
  netApresRetenue: number;
  /** Montant atteint − retenue − pénalités − remboursements d'avance. */
  netApresDeductions: number;
  reste: number; // montant du marché - montant atteint
}

export function situationFinanciere(marche: Marche, decomptes: Decompte[]): SituationFinanciere {
  const somme = (f: (d: Decompte) => number) => decomptes.reduce((s, d) => s + (Number(f(d)) || 0), 0);
  const cumulTravaux = somme((d) => d.montant_travaux);
  const cumulRevision = somme((d) => d.montant_revision);
  const cumulPenalites = somme((d) => d.montant_penalites);
  const cumulRemboursement = somme((d) => d.remboursement_avance);
  const montantAtteint = cumulTravaux + cumulRevision;
  const retenue = retenueGarantie(montantAtteint, marche);
  const montant = montantMarche(marche);
  const avance = Number(marche.avance_montant) || 0;
  return {
    montantAtteint: arrondi2(montantAtteint),
    cumulTravaux: arrondi2(cumulTravaux),
    cumulRevision: arrondi2(cumulRevision),
    part: montant > 0 ? montantAtteint / montant : 0,
    retenue,
    cumulPenalites: arrondi2(cumulPenalites),
    avance: arrondi2(avance),
    cumulRemboursement: arrondi2(cumulRemboursement),
    avanceRestante: arrondi2(avance - cumulRemboursement),
    netApresRetenue: arrondi2(montantAtteint - retenue),
    netApresDeductions: arrondi2(montantAtteint - retenue - cumulPenalites - cumulRemboursement),
    reste: arrondi2(montant - montantAtteint),
  };
}

export interface CoefficientK {
  partieFixe: number;
  k: number;
  valide: boolean;
  anomalies: string[];
}

/** K = partie fixe + Σ (part × indice actuel / indice de base). La partie fixe = 1 - Σ parts. */
export function coefficientK(indices: IndiceRevision[]): CoefficientK {
  const anomalies: string[] = [];
  const utiles = indices.filter((i) => Number(i.part) > 0);
  if (!utiles.length) return { partieFixe: 1, k: 1, valide: true, anomalies };
  if (utiles.length > 3) anomalies.push("Plus de trois indices : vérifiez la formule du CPS");
  const sommeParts = utiles.reduce((s, i) => s + Number(i.part), 0);
  if (sommeParts > 1 + 1e-9) anomalies.push("La somme des parts dépasse 1");
  let k = Math.max(0, 1 - sommeParts);
  for (const i of utiles) {
    if (!(Number(i.base) > 0) || !(Number(i.actuel) > 0)) {
      anomalies.push(`Indice ${i.nom || "sans nom"} : valeur de base ou actuelle manquante`);
      continue;
    }
    k += Number(i.part) * (Number(i.actuel) / Number(i.base));
  }
  return { partieFixe: Math.max(0, 1 - sommeParts), k, valide: anomalies.length === 0, anomalies };
}

export interface ProjetDecompte {
  cumulExecuteHT: number;
  cumulExecuteTTC: number;
  decomptesPrecedentsTTC: number; // travaux seuls
  travauxPeriodeTTC: number;
  travauxPeriodeHT: number;
  k: CoefficientK;
  revisionPeriodeHT: number;
  revisionPeriodeTTC: number;
  retenuePrecedente: number;
  retenueCumulee: number;
  retenuePeriode: number;
  penalitesCumulees: number;
  penalitesPrecedentes: number;
  penalitesPeriode: number;
  remboursementCumule: number;
  remboursementPrecedent: number;
  remboursementPeriode: number;
  netAPayer: number;
}

export function projetDecompte(
  marche: Marche,
  physique: EtatPhysique,
  decomptes: Decompte[],
  penalites: Penalites | null = null,
  appliquerPenalites = true,
): ProjetDecompte {
  const tva = Number(marche.taux_tva) / 100;
  const somme = (f: (d: Decompte) => number) => decomptes.reduce((s, d) => s + (Number(f(d)) || 0), 0);
  const cumulExecuteHT = physique.montantExecuteHT;
  const cumulExecuteTTC = cumulExecuteHT * (1 + tva);
  const decomptesPrecedentsTTC = somme((d) => d.montant_travaux);
  const travauxPeriodeTTC = cumulExecuteTTC - decomptesPrecedentsTTC;
  const travauxPeriodeHT = travauxPeriodeTTC / (1 + tva);
  const k = coefficientK(marche.indices_revision ?? []);
  const revisionPeriodeHT = travauxPeriodeHT * (k.k - 1);
  const revisionPeriodeTTC = revisionPeriodeHT * (1 + tva);

  const cumulPrecedent = decomptesPrecedentsTTC + somme((d) => d.montant_revision);
  const retenuePrecedente = retenueGarantie(cumulPrecedent, marche);
  const retenueCumulee = retenueGarantie(cumulPrecedent + travauxPeriodeTTC + revisionPeriodeTTC, marche);
  const retenuePeriode = retenueCumulee - retenuePrecedente;

  const penalitesPrecedentes = somme((d) => d.montant_penalites);
  const penalitesCumulees = appliquerPenalites && penalites ? penalites.montant : penalitesPrecedentes;
  const penalitesPeriode = penalitesCumulees - penalitesPrecedentes;

  const remboursementPrecedent = somme((d) => d.remboursement_avance);
  const remboursementCumule = Math.max(remboursementPrecedent, remboursementAvanceCumule(marche, cumulExecuteTTC));
  const remboursementPeriode = remboursementCumule - remboursementPrecedent;

  return {
    cumulExecuteHT: arrondi2(cumulExecuteHT),
    cumulExecuteTTC: arrondi2(cumulExecuteTTC),
    decomptesPrecedentsTTC: arrondi2(decomptesPrecedentsTTC),
    travauxPeriodeTTC: arrondi2(travauxPeriodeTTC),
    travauxPeriodeHT: arrondi2(travauxPeriodeHT),
    k,
    revisionPeriodeHT: arrondi2(revisionPeriodeHT),
    revisionPeriodeTTC: arrondi2(revisionPeriodeTTC),
    retenuePrecedente,
    retenueCumulee,
    retenuePeriode: arrondi2(retenuePeriode),
    penalitesCumulees: arrondi2(penalitesCumulees),
    penalitesPrecedentes: arrondi2(penalitesPrecedentes),
    penalitesPeriode: arrondi2(penalitesPeriode),
    remboursementCumule: arrondi2(remboursementCumule),
    remboursementPrecedent: arrondi2(remboursementPrecedent),
    remboursementPeriode: arrondi2(remboursementPeriode),
    netAPayer: arrondi2(
      travauxPeriodeTTC + revisionPeriodeTTC - retenuePeriode - penalitesPeriode - remboursementPeriode,
    ),
  };
}

// ---------------------------------------------------------------------------
// Réception et réserves
// ---------------------------------------------------------------------------

export function reserveEnRetard(r: Reserve, aujourdhui: Date): boolean {
  if (r.statut !== "Ouverte") return false;
  const e = versDate(r.echeance);
  return e !== null && e.getTime() < aujourdhui.getTime();
}

export interface Reception {
  dateProvisoire: Date | null;
  /** Date de réception définitive : saisie, à défaut prévue = provisoire + délai de garantie. */
  dateDefinitive: Date | null;
  definitivePrononcee: boolean;
  joursAvantDefinitive: number | null;
  ouvertes: number;
  levees: number;
  enRetard: number;
}

export function calculerReception(marche: Marche, reserves: Reserve[], aujourdhui: Date): Reception {
  const dateProvisoire = versDate(marche.date_reception_provisoire);
  const saisie = versDate(marche.date_reception_definitive);
  const garantie = Number(marche.delai_garantie_mois);
  const prevue = dateProvisoire && garantie > 0 ? ajouterMois(dateProvisoire, garantie) : null;
  const dateDefinitive = saisie ?? prevue;
  return {
    dateProvisoire,
    dateDefinitive,
    definitivePrononcee: saisie !== null,
    joursAvantDefinitive: dateDefinitive && !saisie ? ecartJours(aujourdhui, dateDefinitive) : null,
    ouvertes: reserves.filter((r) => r.statut === "Ouverte").length,
    levees: reserves.filter((r) => r.statut === "Levée").length,
    enRetard: reserves.filter((r) => reserveEnRetard(r, aujourdhui)).length,
  };
}

// ---------------------------------------------------------------------------
// Garanties et assurances
// ---------------------------------------------------------------------------

/** "expiree" si en vigueur et échue, "proche" si elle expire dans les 30 jours. */
export function etatExpiration(g: Garantie, aujourdhui: Date): "expiree" | "proche" | null {
  if (g.statut !== "En vigueur") return null;
  const e = versDate(g.date_expiration);
  if (!e) return null;
  const j = ecartJours(aujourdhui, e);
  if (j < 0) return "expiree";
  if (j <= 30) return "proche";
  return null;
}

// ---------------------------------------------------------------------------
// Documents et points de vigilance
// ---------------------------------------------------------------------------

export function documentEnRetard(doc: DocumentAFournir, aujourdhui: Date): boolean {
  if (doc.statut === "Fourni" || doc.statut === "Validé") return false;
  const e = versDate(doc.echeance);
  return e !== null && e.getTime() < aujourdhui.getTime();
}

export interface PointVigilance {
  niveau: "erreur" | "attention";
  message: string;
  onglet: string;
}

export function pointsDeVigilance(
  delais: Delais,
  documents: DocumentAFournir[],
  attachements: Attachement[],
  aujourdhui: Date,
  statut: Marche["statut"],
  extra: { garanties?: Garantie[]; penalites?: Penalites; marche?: Marche; reserves?: Reserve[] } = {},
): PointVigilance[] {
  const points: PointVigilance[] = [];
  const { garanties = [], penalites, marche, reserves = [] } = extra;
  if (statut === "Non démarré" && delais.sourceDemarrage === "os") {
    points.push({ niveau: "attention", message: "OS de démarrage enregistré : le statut du marché est encore « Non démarré »", onglet: "apercu" });
  }
  const termine = statut === "Réception provisoire" || statut === "Réception définitive" || statut === "Résilié";
  if (!termine && delais.joursRestants !== null && delais.joursRestants < 0) {
    points.push({ niveau: "erreur", message: `Délai dépassé de ${-delais.joursRestants} jour(s)`, onglet: "delais" });
  } else if (!termine && delais.joursRestants !== null && delais.joursRestants <= 30) {
    points.push({ niveau: "attention", message: `Fin des travaux dans ${delais.joursRestants} jour(s)`, onglet: "delais" });
  }
  if (delais.arretEnCours) {
    const a = delais.arrets[delais.arrets.length - 1];
    points.push({ niveau: "attention", message: `Arrêt en cours depuis ${a.jours} jour(s)`, onglet: "delais" });
  }
  for (const an of delais.anomalies) points.push({ niveau: "attention", message: an, onglet: "delais" });
  const retards = documents.filter((d) => documentEnRetard(d, aujourdhui));
  if (retards.length) {
    points.push({
      niveau: "erreur",
      message: `${retards.length} document(s) en retard : ${retards.slice(0, 3).map((d) => d.nom).join(", ")}${retards.length > 3 ? "…" : ""}`,
      onglet: "documents",
    });
  }
  const aReprendre = documents.filter((d) => d.statut === "À reprendre").length;
  if (aReprendre) points.push({ niveau: "attention", message: `${aReprendre} document(s) à reprendre`, onglet: "documents" });
  if (penalites && penalites.joursPenalisables > 0) {
    if (!penalites.parametre) {
      points.push({ niveau: "attention", message: `Retard de ${penalites.joursRetard} j : taux de pénalité non renseigné`, onglet: "delais" });
    } else {
      points.push({
        niveau: penalites.plafonne ? "erreur" : "attention",
        message: penalites.plafonne
          ? `Plafond des pénalités atteint (${formatMontant(penalites.montant)}) : vérifiez les suites prévues au CPS`
          : `Pénalités encourues : ${formatMontant(penalites.montant)} (${penalites.joursPenalisables} j)`,
        onglet: "delais",
      });
    }
  }
  for (const g of garanties) {
    const e = etatExpiration(g, aujourdhui);
    if (e === "expiree") points.push({ niveau: "erreur", message: `${g.type} expirée le ${formatDate(g.date_expiration)}`, onglet: "garanties" });
    else if (e === "proche") points.push({ niveau: "attention", message: `${g.type} expire le ${formatDate(g.date_expiration)}`, onglet: "garanties" });
  }
  if (marche) {
    const enVigueur = (type: string) => garanties.some((g) => g.type === type && g.statut === "En vigueur");
    if (Number(marche.avance_montant) > 0 && !enVigueur("Caution de restitution d'avance")) {
      points.push({ niveau: "attention", message: "Avance enregistrée sans caution de restitution d'avance en vigueur", onglet: "garanties" });
    }
    const seuil = Number(marche.seuil_avenants);
    const initial = Number(marche.montant_ttc);
    const varAvenants = Number(marche.montant_avenants) || 0;
    if (seuil > 0 && initial > 0 && Math.abs(varAvenants) / initial > seuil / 100) {
      points.push({
        niveau: "erreur",
        message: `Avenants cumulés : ${formatPct(varAvenants / initial)} du montant initial, au-delà du seuil de ${seuil} %`,
        onglet: "avenants",
      });
    }
    const rec = calculerReception(marche, reserves, aujourdhui);
    if (rec.enRetard) points.push({ niveau: "erreur", message: `${rec.enRetard} réserve(s) non levée(s) dans le délai`, onglet: "reception" });
    else if (rec.ouvertes) points.push({ niveau: "attention", message: `${rec.ouvertes} réserve(s) ouverte(s)`, onglet: "reception" });
    if (rec.joursAvantDefinitive !== null && rec.joursAvantDefinitive <= 60) {
      points.push({
        niveau: "attention",
        message:
          rec.joursAvantDefinitive < 0
            ? `Réception définitive prévue le ${formatDate(rec.dateDefinitive)} non prononcée`
            : `Réception définitive prévue le ${formatDate(rec.dateDefinitive)} : préparer la levée des réserves et la mainlevée des garanties`,
        onglet: "reception",
      });
    }
    if (marche.retenue_remplacee_par_caution && !enVigueur("Caution de retenue de garantie")) {
      points.push({ niveau: "attention", message: "Retenue remplacée par une caution, mais aucune caution de retenue en vigueur", onglet: "garanties" });
    }
  }
  const enAttente = attachements.filter((a) => a.statut === "En attente").length;
  if (enAttente) points.push({ niveau: "attention", message: `${enAttente} attachement(s) en attente de validation`, onglet: "attachements" });
  return points;
}

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

const fmtMontant = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQte = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const fmtPct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

export const formatMontant = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : fmtMontant.format(Math.abs(n) < 0.005 ? 0 : n);
export const formatQte = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtQte.format(n));
export const formatPct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtPct.format(n));
export function formatDate(d: Date | string | null | undefined): string {
  const x = typeof d === "string" ? versDate(d) : d;
  if (!x) return "—";
  return x.toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

export const STATUTS_MARCHE = [
  "Non démarré",
  "En cours",
  "Arrêté",
  "Réception provisoire",
  "Réception définitive",
  "Résilié",
] as const;
export type StatutMarche = (typeof STATUTS_MARCHE)[number];

export const STATUTS_DOCUMENT = ["À fournir", "Fourni", "Validé", "À reprendre"] as const;
export type StatutDocument = (typeof STATUTS_DOCUMENT)[number];

export const STATUTS_ATTACHEMENT = ["En attente", "Validé", "Rejeté"] as const;
export type StatutAttachement = (typeof STATUTS_ATTACHEMENT)[number];

export const TYPES_OS = {
  demarrage: "Démarrage",
  arret: "Arrêt",
  reprise: "Reprise",
  prolongation: "Prolongation",
  autre: "Autre",
} as const;
export type TypeOS = keyof typeof TYPES_OS;

export const ROLES_INTERVENANT = [
  "Maître d'ouvrage",
  "Maître d'ouvrage délégué",
  "Architecte",
  "BET",
  "Entreprise",
  "Contrôle technique",
  "Laboratoire",
  "Coordinateur sécurité",
  "Conducteur de travaux",
  "Autre",
] as const;

export interface IndiceRevision {
  nom: string;
  part: number; // part dans la formule, entre 0 et 1
  base: number; // indice de base (mois zéro)
  actuel: number; // indice du mois considéré
}

export interface Marche {
  id: string;
  user_id: string;
  numero: string;
  objet: string;
  entreprise: string;
  montant_ttc: number;
  date_debut: string | null;
  duree_mois: number;
  statut: StatutMarche;
  taux_tva: number;
  taux_retenue: number;
  plafond_retenue: number;
  indices_revision: IndiceRevision[];
  attachements_cumulatifs: boolean;
  penalite_taux_millieme: number | null;
  penalite_plafond: number | null;
  penalite_jours_exoneres: number;
  date_reception_provisoire: string | null;
  avance_montant: number;
  avance_date: string | null;
  avance_debut_remboursement: number;
  avance_fin_remboursement: number;
  retenue_remplacee_par_caution: boolean;
  penalite_base: BasePenalite;
  seuil_avenants: number | null;
  delai_garantie_mois: number | null;
  date_reception_definitive: string | null;
  created_at: string;
  updated_at: string;
  /** Calculé au chargement (non stocké) : somme des variations de montant des avenants. */
  montant_avenants?: number;
  /** Calculé au chargement (non stocké) : somme des jours accordés par avenant. */
  jours_avenants?: number;
}

export const BASES_PENALITE = {
  initial_ttc: "Montant initial TTC",
  actuel_ttc: "Montant modifié par avenants TTC",
  initial_ht: "Montant initial HT",
  actuel_ht: "Montant modifié par avenants HT",
} as const;
export type BasePenalite = keyof typeof BASES_PENALITE;

export interface Avenant {
  id: string;
  marche_id: string;
  numero: string;
  date: string | null;
  objet: string;
  montant_ttc: number;
  jours_supplementaires: number;
  observations: string;
  scan_path: string | null;
}

export const STATUTS_RESERVE = ["Ouverte", "Levée"] as const;
export type StatutReserve = (typeof STATUTS_RESERVE)[number];

export interface Reserve {
  id: string;
  marche_id: string;
  numero: string;
  designation: string;
  localisation: string;
  responsable: string;
  date_constat: string | null;
  echeance: string | null;
  statut: StatutReserve;
  date_levee: string | null;
  observations: string;
  scan_path: string | null;
}

export interface Intervenant {
  id: string;
  marche_id: string;
  role: string;
  nom: string;
  organisme: string;
  telephone: string;
  email: string;
}

export interface OrdreService {
  id: string;
  marche_id: string;
  type: TypeOS;
  numero: string;
  date_emission: string | null;
  date_notification: string | null;
  jours_supplementaires: number;
  objet: string;
  /** Absent tant que la migration « scans_os » n'est pas appliquée. */
  scan_path?: string | null;
}

export interface PvReunion {
  id: string;
  marche_id: string;
  numero: string;
  date: string | null;
  participants: string;
  decisions: string;
  actions: string;
  scan_path: string | null;
}

export interface BpdeLigne {
  id: string;
  marche_id: string;
  ordre: number;
  numero: string;
  designation: string;
  unite: string;
  quantite: number;
  prix_unitaire: number | null;
  montant_importe: number | null;
  avenant_id: string | null;
}

export interface AttachementLigne {
  id: string;
  attachement_id: string;
  ordre: number;
  numero: string;
  designation: string;
  unite: string;
  quantite: number;
}

export interface Attachement {
  id: string;
  marche_id: string;
  numero: string;
  periode: string;
  date: string | null;
  montant: number | null;
  statut: StatutAttachement;
  observations: string;
  attachement_lignes?: AttachementLigne[];
}

export interface DocumentAFournir {
  id: string;
  marche_id: string;
  nom: string;
  responsable: string;
  echeance: string | null;
  statut: StatutDocument;
  source: "manuel" | "cps" | "attachement";
  prestation: string;
  article_cps: string;
  observations: string;
  scan_path: string | null;
}

export interface Decompte {
  id: string;
  marche_id: string;
  numero: string;
  date: string | null;
  montant_travaux: number;
  montant_revision: number;
  coefficient_k: number | null;
  montant_penalites: number;
  remboursement_avance: number;
  retenue_garantie: number | null;
  net_a_payer: number | null;
  observations: string;
}

export const TYPES_GARANTIE = [
  "Caution provisoire",
  "Caution définitive",
  "Caution de retenue de garantie",
  "Caution de restitution d'avance",
  "Assurance RC",
  "Assurance TRC",
  "Assurance décennale",
  "Autre",
] as const;

export const STATUTS_GARANTIE = ["En vigueur", "Mainlevée", "Restituée"] as const;
export type StatutGarantie = (typeof STATUTS_GARANTIE)[number];

export interface Garantie {
  id: string;
  marche_id: string;
  type: string;
  organisme: string;
  reference: string;
  montant: number | null;
  date_emission: string | null;
  date_expiration: string | null;
  statut: StatutGarantie;
  observations: string;
  scan_path: string | null;
}

export interface Activite {
  id: number;
  marche_id: string;
  message: string;
  created_at: string;
}

/** Toutes les données d'un marché, chargées en une fois pour la fiche. */
export interface DossierMarche {
  marche: Marche;
  intervenants: Intervenant[];
  ordres: OrdreService[];
  pvs: PvReunion[];
  bpde: BpdeLigne[];
  attachements: Attachement[];
  documents: DocumentAFournir[];
  decomptes: Decompte[];
  garanties: Garantie[];
  avenants: Avenant[];
  reserves: Reserve[];
  activites: Activite[];
}

/** Proposition de document renvoyée par Claude. */
export interface PropositionDocument {
  nom: string;
  prestation: string;
  article_cps: string | null;
  justification: string;
}

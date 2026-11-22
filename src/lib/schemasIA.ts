import { z } from "zod";

/** Schémas de sortie structurée des appels à Claude (partagés, sans dépendance serveur). */

export const SchemaPropositions = z.object({
  documents: z.array(
    z.object({
      nom: z.string().describe("Intitulé court du document à fournir"),
      prestation: z.string().describe("Prestation ou lot concerné"),
      article_cps: z.string().nullable().describe("Article du CPS si identifiable, sinon null"),
      justification: z.string().describe("Exigence ou motif, en une phrase"),
    }),
  ),
});

const Valeur = z.object({
  valeur: z.number().nullable().describe("Valeur numérique dans l'unité demandée, null si le CPS ne la fixe pas"),
  article: z.string().nullable().describe("Article du CPS, null si non identifiable"),
  extrait: z.string().nullable().describe("Citation exacte et courte du CPS qui fonde la valeur"),
});

export const SchemaParametres = z.object({
  delai_mois: Valeur.describe("Délai d'exécution, en mois (convertir les jours à raison de 30 jours par mois)"),
  taux_tva: Valeur.describe("Taux de TVA en %"),
  taux_retenue: Valeur.describe("Taux de la retenue de garantie en % de chaque acompte"),
  plafond_retenue: Valeur.describe("Plafond de la retenue de garantie en % du montant du marché"),
  penalite_taux_millieme: Valeur.describe("Pénalité de retard en millièmes (‰) du montant par jour : 1/1000 → 1 ; 1/2000 → 0,5"),
  penalite_plafond: Valeur.describe("Plafond des pénalités en % du montant du marché"),
  penalite_base: z
    .object({
      valeur: z.enum(["initial_ttc", "actuel_ttc", "initial_ht", "actuel_ht"]).nullable(),
      article: z.string().nullable(),
      extrait: z.string().nullable(),
    })
    .describe("Montant servant de base aux pénalités : initial ou modifié par avenants, TTC ou HT"),
  avance_pourcentage: Valeur.describe("Avance en % du montant du marché"),
  avance_debut_remboursement: Valeur.describe("Avancement (% du montant) à partir duquel l'avance est remboursée"),
  avance_fin_remboursement: Valeur.describe("Avancement (% du montant) auquel l'avance doit être totalement remboursée"),
  delai_garantie_mois: Valeur.describe("Délai de garantie en mois"),
  revision: z.object({
    applicable: z.boolean().nullable().describe("true si les prix sont révisables, false s'ils sont fermes, null si non précisé"),
    formule: z.string().nullable().describe("Formule de révision recopiée du CPS"),
    indices: z.array(z.object({ nom: z.string(), part: z.number().describe("Coefficient de l'indice, entre 0 et 1") })),
    article: z.string().nullable(),
  }),
  remarques: z.array(z.string()).describe("Points d'attention : ambiguïtés, renvois au CCAG, valeurs contradictoires"),
});
export type ParametresCps = z.infer<typeof SchemaParametres>;

// ---------------------------------------------------------------------------
// Modèle de document conçu par Claude (structure convertie en .docx côté navigateur)
// ---------------------------------------------------------------------------

export const LISTES_MODELE = [
  "lignes_decompte",
  "bpde",
  "ecarts",
  "decomptes",
  "ordres_service",
  "avenants",
  "documents",
  "reserves",
  "garanties",
  "intervenants",
] as const;

const BlocModele = z.object({
  type: z
    .enum(["titre", "paragraphe", "infos", "tableau", "liste", "signatures", "saut"])
    .describe(
      "titre : intitulé ; paragraphe : texte ; infos : tableau à 2 colonnes libellé / valeur ; tableau : liste répétée d'une donnée ; liste : puces ; signatures : cadres de signature ; saut : ligne vide",
    ),
  texte: z.string().nullable().describe("Texte (titre, paragraphe), balises entre accolades comprises ; null sinon"),
  niveau: z.number().nullable().describe("Titre : 1 (principal) ou 2 (section) ; null sinon"),
  alignement: z.enum(["gauche", "centre", "droite", "justifie"]).nullable(),
  gras: z.boolean().nullable(),
  lignes: z
    .array(z.object({ libelle: z.string(), valeur: z.string() }))
    .nullable()
    .describe("Bloc infos : couples libellé / valeur (la valeur contient en général une balise)"),
  liste: z.enum(LISTES_MODELE).nullable().describe("Bloc tableau : nom de la liste répétée"),
  colonnes: z
    .array(z.object({ entete: z.string(), champ: z.string().describe("Champ de la liste, sans accolades") }))
    .nullable()
    .describe("Bloc tableau : colonnes, chaque colonne affiche un champ de la liste"),
  elements: z.array(z.string()).nullable().describe("Bloc liste : éléments à puces"),
  cadres: z.array(z.string()).nullable().describe("Bloc signatures : intitulés des cadres (ex. « Établi par »)"),
});

export const SchemaModeleIA = z.object({
  nom: z.string().describe("Nom court du modèle"),
  description: z.string().describe("Une phrase : usage du modèle"),
  blocs: z.array(BlocModele),
  remarques: z.array(z.string()).describe("Points à vérifier par l'utilisateur avant usage"),
});
export type ModeleIA = z.infer<typeof SchemaModeleIA>;
export type BlocModeleIA = ModeleIA["blocs"][number];

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

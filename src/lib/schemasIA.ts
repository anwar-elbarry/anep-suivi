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

// ---------------------------------------------------------------------------
// Paramètres du marché lus dans le CPS
//
// L'API limite à 16 le nombre de propriétés « nullable » (unions) d'un schéma de sortie : les paramètres sont donc
// demandés sous forme de liste (un élément par valeur trouvée), puis remis en forme par versParametresCps().
// ---------------------------------------------------------------------------

export const PARAMETRES_CPS = {
  delai_mois: "Délai d'exécution, en mois (convertir les jours à raison de 30 jours par mois)",
  taux_tva: "Taux de TVA, en %",
  taux_retenue: "Taux de la retenue de garantie, en % de chaque acompte",
  plafond_retenue: "Plafond de la retenue de garantie, en % du montant du marché",
  penalite_taux_millieme: "Pénalité de retard, en millièmes (‰) du montant par jour : 1/1000 → 1 ; 1/2000 → 0,5",
  penalite_plafond: "Plafond des pénalités, en % du montant du marché",
  avance_pourcentage: "Avance, en % du montant du marché",
  avance_debut_remboursement: "Avancement (% du montant) à partir duquel l'avance est remboursée",
  avance_fin_remboursement: "Avancement (% du montant) auquel l'avance doit être totalement remboursée",
  delai_garantie_mois: "Délai de garantie, en mois",
} as const;
export type CleParametre = keyof typeof PARAMETRES_CPS;
const CLES_PARAMETRES = Object.keys(PARAMETRES_CPS) as [CleParametre, ...CleParametre[]];

const BASES = ["initial_ttc", "actuel_ttc", "initial_ht", "actuel_ht"] as const;

export const SchemaParametresIA = z.object({
  valeurs: z
    .array(
      z.object({
        parametre: z.enum(CLES_PARAMETRES),
        valeur: z.number().describe("Valeur numérique dans l'unité demandée pour ce paramètre"),
        article: z.string().describe("Article du CPS ; chaîne vide s'il n'est pas identifiable"),
        extrait: z.string().describe("Citation exacte et courte du CPS qui fonde la valeur"),
      }),
    )
    .describe("Un élément par paramètre que le CPS fixe explicitement ; un paramètre non fixé par le CPS n'apparaît pas"),
  penalite_base: z
    .object({
      valeur: z.enum([...BASES, "non_precise"]),
      article: z.string().describe("Chaîne vide si non identifiable"),
      extrait: z.string().describe("Chaîne vide si non précisé"),
    })
    .describe("Montant servant de base aux pénalités : initial ou modifié par avenants, TTC ou HT ; non_precise si le CPS ne le dit pas"),
  revision: z.object({
    applicable: z.enum(["oui", "non", "non_precise"]).describe("oui : prix révisables ; non : prix fermes ; non_precise : le CPS ne le dit pas"),
    formule: z.string().describe("Formule de révision recopiée du CPS ; chaîne vide s'il n'y en a pas"),
    indices: z.array(z.object({ nom: z.string(), part: z.number().describe("Coefficient de l'indice, entre 0 et 1") })),
    article: z.string().describe("Chaîne vide si non identifiable"),
  }),
  remarques: z.array(z.string()).describe("Points d'attention : ambiguïtés, renvois au CCAG, valeurs contradictoires"),
});
export type ParametresIA = z.infer<typeof SchemaParametresIA>;

interface ValeurCps {
  valeur: number | null;
  article: string | null;
  extrait: string | null;
}

/** Paramètres du CPS tels que les consomme l'interface : une entrée par paramètre, valeur null si le CPS ne la fixe pas. */
export type ParametresCps = Record<CleParametre, ValeurCps> & {
  penalite_base: { valeur: (typeof BASES)[number] | null; article: string | null; extrait: string | null };
  revision: { applicable: boolean | null; formule: string | null; indices: { nom: string; part: number }[]; article: string | null };
  remarques: string[];
};

const ouNull = (s: string) => s.trim() || null;

/**
 * Met en forme la sortie de Claude. Un CPS long est lu en plusieurs lots de pages : les lots sont fusionnés
 * (première valeur trouvée retenue, divergence signalée dans les remarques).
 */
export function versParametresCps(lots: ParametresIA[]): ParametresCps {
  const vide = (): ValeurCps => ({ valeur: null, article: null, extrait: null });
  const p = Object.fromEntries(CLES_PARAMETRES.map((c) => [c, vide()])) as Record<CleParametre, ValeurCps>;
  const remarques: string[] = [];
  const noter = (r: string) => {
    if (r.trim() && !remarques.includes(r.trim())) remarques.push(r.trim());
  };
  const res: ParametresCps = {
    ...p,
    penalite_base: { valeur: null, article: null, extrait: null },
    revision: { applicable: null, formule: null, indices: [], article: null },
    remarques,
  };

  for (const lot of lots) {
    for (const v of lot.valeurs) {
      const actuel = res[v.parametre];
      if (actuel.valeur === null) {
        res[v.parametre] = { valeur: v.valeur, article: ouNull(v.article), extrait: ouNull(v.extrait) };
      } else if (actuel.valeur !== v.valeur) {
        noter(
          `${PARAMETRES_CPS[v.parametre].split(",")[0]} : le CPS donne aussi ${String(v.valeur).replace(".", ",")}${v.article.trim() ? ` (${v.article.trim()})` : ""} ; valeur proposée ${String(actuel.valeur).replace(".", ",")}${actuel.article ? ` (${actuel.article})` : ""}. À vérifier.`,
        );
      }
    }
    if (res.penalite_base.valeur === null && lot.penalite_base.valeur !== "non_precise") {
      res.penalite_base = { valeur: lot.penalite_base.valeur, article: ouNull(lot.penalite_base.article), extrait: ouNull(lot.penalite_base.extrait) };
    }
    const r = lot.revision;
    if (r.applicable === "oui") res.revision.applicable = true;
    else if (r.applicable === "non" && res.revision.applicable === null) res.revision.applicable = false;
    if (!res.revision.indices.length && (r.indices.length || r.formule.trim())) {
      res.revision.formule = ouNull(r.formule);
      res.revision.indices = r.indices;
      res.revision.article = ouNull(r.article);
    }
    lot.remarques.forEach(noter);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Bordereau des prix (BPDE) lu dans un PDF, un scan ou une photo
// ---------------------------------------------------------------------------

export const SchemaBpdeIA = z.object({
  lignes: z
    .array(
      z.object({
        numero: z.string().describe("N° du prix tel qu'écrit ; chaîne vide s'il n'y en a pas"),
        designation: z.string().describe("Désignation de la prestation, recopiée sans la reformuler"),
        unite: z.string().describe("Unité (m², ml, U, F, kg…) ; chaîne vide si absente"),
        quantite: z.number().nullable().describe("Quantité ; null si absente ou illisible"),
        prix_unitaire: z.number().nullable().describe("Prix unitaire hors taxes en chiffres ; null si absent ou illisible"),
        montant: z.number().nullable().describe("Prix total de la ligne tel qu'écrit dans le document ; null si absent ou illisible"),
      }),
    )
    .describe("Les lignes de prix, dans l'ordre du document"),
  remarques: z.array(z.string()).describe("Valeurs illisibles ou douteuses, pages manquantes, totaux incohérents"),
});
export type BpdeIA = z.infer<typeof SchemaBpdeIA>;

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

// Aucune propriété « nullable » : l'API plafonne leur nombre et chacune alourdit la compilation du schéma.
// Une propriété sans objet pour le type de bloc reçoit une valeur neutre (chaîne vide, liste vide, 0, « defaut », « aucune »).
const BlocModele = z.object({
  type: z
    .enum(["titre", "paragraphe", "infos", "tableau", "liste", "signatures", "saut"])
    .describe(
      "titre : intitulé ; paragraphe : texte ; infos : tableau à 2 colonnes libellé / valeur ; tableau : liste répétée d'une donnée ; liste : puces ; signatures : cadres de signature ; saut : ligne vide",
    ),
  texte: z.string().describe("Texte (titre, paragraphe), balises entre accolades comprises ; chaîne vide pour les autres blocs"),
  niveau: z.number().describe("Titre : 1 (principal) ou 2 (section) ; 0 pour les autres blocs"),
  alignement: z.enum(["defaut", "gauche", "centre", "droite", "justifie"]),
  gras: z.boolean(),
  lignes: z
    .array(z.object({ libelle: z.string(), valeur: z.string() }))
    .describe("Bloc infos : couples libellé / valeur (la valeur contient en général une balise) ; liste vide sinon"),
  liste: z.enum([...LISTES_MODELE, "aucune"]).describe("Bloc tableau : nom de la liste répétée ; « aucune » sinon"),
  colonnes: z
    .array(z.object({ entete: z.string(), champ: z.string().describe("Champ de la liste, sans accolades") }))
    .describe("Bloc tableau : colonnes, chaque colonne affiche un champ de la liste ; liste vide sinon"),
  elements: z.array(z.string()).describe("Bloc liste : éléments à puces ; liste vide sinon"),
  cadres: z.array(z.string()).describe("Bloc signatures : intitulés des cadres (ex. « Établi par ») ; liste vide sinon"),
});

export const SchemaModeleIA = z.object({
  nom: z.string().describe("Nom court du modèle"),
  description: z.string().describe("Une phrase : usage du modèle"),
  blocs: z.array(BlocModele),
  remarques: z.array(z.string()).describe("Points à vérifier par l'utilisateur avant usage"),
});
export type ModeleIA = z.infer<typeof SchemaModeleIA>;
export type BlocModeleIA = ModeleIA["blocs"][number];

/**
 * Prompt de création de modèles de documents par un agent IA.
 * Le même texte sert à l'appel interne (Claude) et au bouton « Copier le prompt » pour un agent externe.
 */
import { BOUCLES, CHAMPS } from "./catalogue";

export interface DemandeModele {
  categorie: string;
  description: string;
  entete?: string;
}

/** Catalogue des balises au format texte. */
export function catalogueTexte(): string {
  const groupes = new Map<string, string[]>();
  for (const c of CHAMPS) groupes.set(c.groupe, [...(groupes.get(c.groupe) ?? []), `{${c.cle}} : ${c.libelle}`]);
  const champs = [...groupes.entries()].map(([g, l]) => `${g}\n${l.map((x) => `  - ${x}`).join("\n")}`).join("\n");
  const listes = BOUCLES.map(
    (b) => `  - {#${b.cle}} … {/${b.cle}} : ${b.libelle}. Champs : ${["rang", ...b.champs.map((c) => c.cle)].map((c) => `{${c}}`).join(", ")}`,
  ).join("\n");
  return `DONNÉES DISPONIBLES (remplies automatiquement)\n${champs}\n\nLISTES (lignes de tableau répétées)\n${listes}`;
}

export const REGLES_MODELE = `RÈGLES DE SYNTAXE DES BALISES
1. Une donnée s'écrit entre accolades simples, sans espace : {marche_numero}. N'utilise jamais {{double}} accolades.
2. Un tableau répété : une ligne d'en-tête, puis UNE ligne modèle dont la première cellule commence par {#nom_liste}
   et la dernière cellule finit par {/nom_liste}. Exemple : | {#lignes_decompte}{numero} | {designation} | {montant}{/lignes_decompte} |
3. Un texte conditionnel : {#en_retard}texte affiché seulement si le délai est dépassé{/en_retard}.
   Conditions disponibles : en_retard, arret_en_cours, penalites_plafond_atteint, decompte_est_projet.
4. Toute information absente du catalogue (destinataire, objet d'un envoi, références, nom du signataire, ville…) devient
   un champ à saisir : invente une balise claire en minuscules avec des tirets bas, ex. {destinataire}, {objet_envoi}.
5. Les montants des données sont déjà formatés (« 538 800,00 ») ; les versions « _lettres » donnent le montant en lettres.

RÈGLES DE RÉDACTION
- Français administratif sobre et précis, adapté aux marchés publics de travaux.
- N'invente aucune référence juridique, aucun numéro d'article, de décret ou de norme : prévois un champ à saisir
  ({visas}, {references_cps}, {article_cps_penalites}…) que l'utilisateur complétera.
- Une décision, une mise en demeure ou une note engageant l'administration porte la mention « PROJET — À VALIDER ».
- Prévois les cadres de signature utiles et un en-tête {organisme} / {service} sauf si un en-tête est fourni.`;

export function promptExterne(d: DemandeModele): string {
  return `Tu es un assistant de rédaction administrative pour le suivi de marchés publics de travaux.

OBJECTIF
Crée un modèle de document Word (.docx) de type « ${d.categorie} ».
Besoin : ${d.description.trim() || "(à préciser)"}
${d.entete?.trim() ? `En-tête à reproduire : ${d.entete.trim()}\n` : ""}
Le modèle sera déposé dans une application de suivi des travaux qui remplace automatiquement les balises entre accolades
par les données du marché. Respecte strictement les règles ci-dessous.

${REGLES_MODELE}

${catalogueTexte()}

LIVRABLE
- Un fichier .docx prêt à déposer dans l'application. Si tu ne peux pas produire de fichier, donne le contenu complet,
  structuré (titres, paragraphes, tableaux avec leurs colonnes), à coller dans Word sans modification des balises.
- À la fin, liste les champs à saisir que tu as créés et les points que l'utilisateur doit vérifier.`;
}

export function promptInterne(d: DemandeModele): string {
  return `Conçois un modèle de document de type « ${d.categorie} ».
Besoin : ${d.description.trim()}
${d.entete?.trim() ? `En-tête à reproduire en haut du document : ${d.entete.trim()}\n` : ""}
Décris le document sous forme de blocs (titre, paragraphe, infos, tableau, liste, signatures, saut), dans l'ordre d'affichage.
Pour un bloc « tableau », donne la liste répétée et ses colonnes (champ de la liste, sans accolades) : l'application
construit elle-même les balises de répétition. Dans les autres blocs, écris les balises entre accolades dans le texte.

${REGLES_MODELE}

${catalogueTexte()}`;
}

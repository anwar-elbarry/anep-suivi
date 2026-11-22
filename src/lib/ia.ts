import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { PropositionDocument } from "./types";
import { SchemaParametres, SchemaPropositions, type ParametresCps } from "./schemasIA";

export type { ParametresCps };

const MODELE = "claude-opus-5-5";

const SYSTEME = `Tu assistes un chargé de suivi des travaux d'un marché public de travaux de bâtiment.
Ta tâche : proposer la liste des documents que l'entreprise titulaire doit fournir (fiches techniques, notes de calcul,
plans d'exécution, méthodologies de mise en œuvre, procès-verbaux d'essais ou de contrôle, agréments et avis techniques,
garanties, échantillons, PV de réception de supports, etc.).

Règles :
- Ne propose que des documents justifiés par le texte fourni ou par la nature de la prestation. N'invente jamais une norme,
  un article ou une exigence ; si l'article du CPS n'est pas identifiable, mets article_cps à null.
- Un document par exigence concrète ; pas de doublon ; intitulés courts et précis, en français.
- Regroupe par prestation (ex. « Étanchéité », « Béton armé », « Plomberie »).
- Ce sont des suggestions qui seront relues par le chargé de suivi : reste factuel.`;

export class ErreurIA extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export type ContenuSource =
  | { type: "pdf"; base64: string; titre: string }
  | { type: "texte"; texte: string; titre: string };

/** Appel générique à Claude avec un document et une sortie structurée validée par Zod. */
async function appelerClaude<S extends z.ZodType>(
  source: ContenuSource,
  systeme: string,
  consigne: string,
  schema: S,
  effort: "medium" | "high",
): Promise<z.infer<S>> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new ErreurIA("Clé ANTHROPIC_API_KEY non configurée sur le serveur", 500);
  }
  const client = new Anthropic();

  const bloc: Anthropic.Beta.BetaContentBlockParam =
    source.type === "pdf"
      ? {
          type: "document",
          title: source.titre,
          source: { type: "base64", media_type: "application/pdf", data: source.base64 },
        }
      : {
          type: "document",
          title: source.titre,
          source: { type: "text", media_type: "text/plain", data: source.texte },
        };

  let reponse;
  try {
    reponse = await client.beta.messages.parse({
      model: MODELE,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: systeme,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content: [bloc, { type: "text", text: consigne }] }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new ErreurIA("Service Claude saturé, réessayez dans un instant", 429);
    if (e instanceof Anthropic.AuthenticationError) throw new ErreurIA("Clé API Anthropic invalide", 500);
    if (e instanceof Anthropic.BadRequestError) throw new ErreurIA(`Requête refusée par l'API : ${e.message}`, 400);
    if (e instanceof Anthropic.APIError) throw new ErreurIA(`Erreur de l'API Claude (${e.status ?? "?"})`, 502);
    throw e;
  }

  if (reponse.stop_reason === "refusal") throw new ErreurIA("Claude a décliné la demande", 422);
  if (reponse.stop_reason === "max_tokens") throw new ErreurIA("Réponse tronquée : document trop long, découpez-le", 422);
  const sortie = reponse.parsed_output;
  if (!sortie) throw new ErreurIA("Réponse illisible, réessayez", 502);
  return sortie as z.infer<S>;
}

export async function proposerDocuments(
  source: ContenuSource,
  consigne: string,
  effort: "medium" | "high" = "medium",
): Promise<PropositionDocument[]> {
  const sortie = await appelerClaude(source, SYSTEME, consigne, SchemaPropositions, effort);
  return sortie.documents.map((d) => ({
    nom: d.nom.trim(),
    prestation: d.prestation.trim(),
    article_cps: d.article_cps?.trim() || null,
    justification: d.justification.trim(),
  }));
}

// ---------------------------------------------------------------------------
// Paramètres du marché lus dans le CPS
// ---------------------------------------------------------------------------



const SYSTEME_PARAMETRES = `Tu lis le CPS (cahier des prescriptions spéciales) d'un marché public de travaux pour en extraire des paramètres
financiers et de délai. Règles strictes :
- Ne renseigne une valeur que si le CPS la fixe explicitement ; sinon valeur = null. Ne déduis jamais une valeur d'un texte
  réglementaire que le CPS se contente de citer (ex. « conformément au CCAG ») : signale-le dans remarques.
- Pour chaque valeur, donne l'article et une citation exacte et courte du CPS.
- Convertis dans l'unité demandée et signale toute conversion ou ambiguïté dans remarques.
- Pour la révision des prix, recopie la formule et liste les indices avec leur coefficient ; la partie fixe n'est pas un indice.`;

export async function extraireParametres(source: ContenuSource, contexte: string): Promise<ParametresCps> {
  return appelerClaude(
    source,
    SYSTEME_PARAMETRES,
    `${contexte}\nExtrais les paramètres du marché à partir de ce CPS.`,
    SchemaParametres,
    "high",
  );
}

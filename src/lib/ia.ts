import "server-only";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { PropositionDocument } from "./types";
import { decouperPdf, PAGES_PAR_LOT } from "./pdf";
import {
  PARAMETRES_CPS,
  SchemaBpdeIA,
  SchemaModeleIA,
  SchemaParametresIA,
  SchemaPropositions,
  versParametresCps,
  type BpdeIA,
  type ModeleIA,
  type ParametresCps,
} from "./schemasIA";
import { promptInterne, type DemandeModele } from "./modeles/prompt";

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

export const iaConfiguree = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export type ContenuSource =
  | { type: "pdf"; octets: Uint8Array; titre: string }
  | { type: "image"; base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp"; titre: string }
  | { type: "texte"; texte: string; titre: string };

/** Au-delà de cette taille, le PDF passe par l'API Files (référence par identifiant) plutôt que dans le corps de la requête. */
const SEUIL_API_FILES = 20 * 1024 * 1024;
/** Un PDF long est lu par lots de 100 pages, en parallèle ; au-delà de 6 lots, l'analyse ne tient plus dans la durée d'une requête. */
const LOTS_MAX = 6;

/** Convertit une erreur du SDK en erreur affichable (à relancer par l'appelant). */
function traduireErreur(e: unknown): unknown {
  if (e instanceof ErreurIA) return e;
  if (e instanceof Anthropic.RateLimitError) return new ErreurIA("Service Claude saturé ou quota atteint, réessayez dans un instant", 429);
  if (e instanceof Anthropic.AuthenticationError) return new ErreurIA("Clé API Anthropic invalide", 500);
  if (e instanceof Anthropic.PermissionDeniedError) return new ErreurIA("Clé API Anthropic sans accès à ce modèle ou à cette fonction", 500);
  if (e instanceof Anthropic.BadRequestError) return new ErreurIA(`Requête refusée par l'API Claude : ${e.message}`, 400);
  if (e instanceof Anthropic.APIConnectionError) return new ErreurIA("Connexion à l'API Claude interrompue, réessayez", 504);
  if (e instanceof Anthropic.APIError) {
    if (e.status === 413) return new ErreurIA("Document trop volumineux pour l'API Claude : réduisez la résolution du scan ou découpez-le", 413);
    return new ErreurIA(`Erreur de l'API Claude (${e.status ?? "?"})`, 502);
  }
  return e;
}

/** Appel générique à Claude avec un document (facultatif) et une sortie structurée validée par Zod. */
async function appelerClaude<S extends z.ZodType>(
  source: ContenuSource | null,
  systeme: string,
  consigne: string,
  schema: S,
  effort: "medium" | "high",
): Promise<z.infer<S>> {
  if (!iaConfiguree()) throw new ErreurIA("Clé ANTHROPIC_API_KEY non configurée sur le serveur", 500);
  const client = new Anthropic();
  let fichierId: string | null = null;

  try {
    let bloc: Anthropic.Beta.BetaContentBlockParam | null = null;
    if (source?.type === "pdf") {
      if (source.octets.byteLength > SEUIL_API_FILES) {
        const depose = await client.files.upload({ file: await toFile(source.octets, "document.pdf", { type: "application/pdf" }) });
        fichierId = depose.id;
        bloc = { type: "document", title: source.titre, source: { type: "file", file_id: depose.id } };
      } else {
        bloc = {
          type: "document",
          title: source.titre,
          source: { type: "base64", media_type: "application/pdf", data: Buffer.from(source.octets).toString("base64") },
        };
      }
    } else if (source?.type === "image") {
      bloc = { type: "image", source: { type: "base64", media_type: source.mediaType, data: source.base64 } };
    } else if (source?.type === "texte") {
      bloc = { type: "document", title: source.titre, source: { type: "text", media_type: "text/plain", data: source.texte } };
    }

    // Flux : une analyse longue ne bute pas sur un délai HTTP ; finalMessage() renvoie la réponse complète.
    const reponse = await client.beta.messages
      .stream({
        model: MODELE,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: systeme,
        output_config: { effort, format: betaZodOutputFormat(schema) },
        messages: [{ role: "user", content: bloc ? [bloc, { type: "text", text: consigne }] : [{ type: "text", text: consigne }] }],
      })
      .finalMessage();

    if (reponse.stop_reason === "refusal") throw new ErreurIA("Claude a décliné la demande", 422);
    if (reponse.stop_reason === "max_tokens") throw new ErreurIA("Réponse tronquée : document trop long, découpez-le", 422);
    const sortie = reponse.parsed_output;
    if (!sortie) throw new ErreurIA("Réponse illisible, réessayez", 502);
    return sortie as z.infer<S>;
  } catch (e) {
    throw traduireErreur(e);
  } finally {
    if (fichierId) await client.files.delete(fichierId).catch(() => undefined);
  }
}

/**
 * Applique un appel à la source, lot par lot si c'est un PDF long (voir decouperPdf).
 * `repere` précise à Claude quelles pages il a sous les yeux.
 */
async function parLots<T>(source: ContenuSource, appel: (source: ContenuSource, repere: string) => Promise<T>): Promise<T[]> {
  if (source.type !== "pdf") return [await appel(source, "")];
  const { pages, lots } = await decouperPdf(source.octets);
  if (lots.length === 1) return [await appel(source, "")];
  if (lots.length > LOTS_MAX) {
    throw new ErreurIA(`Document de ${pages} pages : au-delà de ${LOTS_MAX * PAGES_PAR_LOT} pages, découpez-le en plusieurs fichiers.`, 413);
  }
  return Promise.all(
    lots.map((lot) =>
      appel(
        { type: "pdf", octets: lot.octets, titre: `${source.titre} (pages ${lot.debut} à ${lot.fin})` },
        `\nCe fichier contient les pages ${lot.debut} à ${lot.fin} d'un document de ${pages} pages, lu en plusieurs parties : ne traite que ce qui figure dans ces pages.`,
      ),
    ),
  );
}

export async function proposerDocuments(
  source: ContenuSource,
  consigne: string,
  effort: "medium" | "high" = "medium",
): Promise<PropositionDocument[]> {
  const lots = await parLots(source, (s, repere) => appelerClaude(s, SYSTEME, consigne + repere, SchemaPropositions, effort));
  const vus = new Set<string>();
  return lots
    .flatMap((l) => l.documents)
    .map((d) => ({
      nom: d.nom.trim(),
      prestation: d.prestation.trim(),
      article_cps: d.article_cps?.trim() || null,
      justification: d.justification.trim(),
    }))
    .filter((d) => {
      const cle = `${d.nom}|${d.prestation}`.toLowerCase();
      if (!d.nom || vus.has(cle)) return false;
      vus.add(cle);
      return true;
    });
}

// ---------------------------------------------------------------------------
// Paramètres du marché lus dans le CPS
// ---------------------------------------------------------------------------

const SYSTEME_PARAMETRES = `Tu lis le CPS (cahier des prescriptions spéciales) d'un marché public de travaux pour en extraire des paramètres
financiers et de délai. Règles strictes :
- Ne renseigne une valeur que si le CPS la fixe explicitement ; sinon ne la mentionne pas. Ne déduis jamais une valeur d'un texte
  réglementaire que le CPS se contente de citer (ex. « conformément au CCAG ») : signale-le dans remarques.
- Pour chaque valeur, donne l'article et une citation exacte et courte du CPS.
- Convertis dans l'unité demandée et signale toute conversion ou ambiguïté dans remarques.
- Pour la révision des prix, recopie la formule et liste les indices avec leur coefficient ; la partie fixe n'est pas un indice.

Paramètres recherchés et unités :
${Object.entries(PARAMETRES_CPS)
  .map(([cle, libelle]) => `- ${cle} : ${libelle}`)
  .join("\n")}`;

export async function extraireParametres(source: ContenuSource, contexte: string): Promise<ParametresCps> {
  const lots = await parLots(source, (s, repere) =>
    appelerClaude(s, SYSTEME_PARAMETRES, `${contexte}\nExtrais les paramètres du marché à partir de ce CPS.${repere}`, SchemaParametresIA, "high"),
  );
  return versParametresCps(lots);
}

// ---------------------------------------------------------------------------
// Bordereau des prix lu dans un PDF, un scan, une photo ou un tableau mal structuré
// ---------------------------------------------------------------------------

const SYSTEME_BPDE = `Tu transcris le bordereau des prix - détail estimatif (BPDE) d'un marché public de travaux en lignes de données.
Règles strictes :
- Une ligne par prix : numéro, désignation, unité, quantité, prix unitaire hors taxes, prix total. Respecte l'ordre du document.
- Recopie les chiffres tels qu'ils sont écrits, convertis en nombres décimaux (« 1 234,50 » → 1234.5). Ne calcule, n'arrondis et ne
  corrige aucune valeur, même si quantité × prix unitaire ne donne pas le prix total : signale l'écart dans remarques.
- Une valeur absente ou illisible vaut null et est signalée dans remarques (numéro de prix concerné). Ne devine jamais un chiffre.
- Ignore les titres de chapitre, sous-totaux, reports, totaux, TVA et montants en lettres.
- Si le document n'est pas un bordereau des prix, renvoie une liste vide et dis-le dans remarques.`;

export async function lireBpde(source: ContenuSource, contexte: string): Promise<BpdeIA> {
  const lots = await parLots(source, (s, repere) =>
    appelerClaude(s, SYSTEME_BPDE, `${contexte}\nTranscris les lignes de prix de ce bordereau.${repere}`, SchemaBpdeIA, "medium"),
  );
  return {
    lignes: lots.flatMap((l) => l.lignes).filter((l) => l.designation.trim()),
    remarques: [...new Set(lots.flatMap((l) => l.remarques.map((r) => r.trim())).filter(Boolean))],
  };
}

// ---------------------------------------------------------------------------
// Conception d'un modèle de document
// ---------------------------------------------------------------------------

const SYSTEME_MODELE = `Tu conçois des modèles de documents administratifs (décomptes, bordereaux d'envoi, notes et décisions,
courriers, procès-verbaux) pour le suivi de marchés publics de travaux. Les modèles sont remplis automatiquement par une
application à partir de balises entre accolades. Tu respectes strictement la syntaxe et le catalogue fournis, tu n'inventes
aucune référence juridique et tu restes sobre : le document doit pouvoir être signé tel quel après relecture.`;

export async function concevoirModele(d: DemandeModele): Promise<ModeleIA> {
  return appelerClaude(null, SYSTEME_MODELE, promptInterne(d), SchemaModeleIA, "medium");
}

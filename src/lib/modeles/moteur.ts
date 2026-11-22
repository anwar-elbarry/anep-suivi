/**
 * Moteur de modèles : lecture des balises et remplissage.
 * - Word (.docx) : champs {cle}, boucles {#liste}…{/liste} (une ligne de tableau est répétée), conditions {#cond}…{/cond}.
 * - Excel (.xlsx) : champs simples {cle} dans les cellules (pas de boucles).
 */
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { BOUCLES, CLES_CONNUES } from "./catalogue";

export type FormatModele = "docx" | "xlsx";

export interface Analyse {
  format: FormatModele;
  /** Champs et boucles reconnus du catalogue. */
  connus: string[];
  /** Champs inconnus du catalogue : saisis à la main lors de la génération. */
  libres: string[];
  /** Champs inconnus utilisés dans une boucle connue (resteront vides). */
  avertissements: string[];
  /** Erreurs bloquantes (balise mal fermée, boucle inconnue…). */
  erreurs: string[];
}

export function formatDuFichier(nom: string): FormatModele | null {
  const ext = nom.toLowerCase().split(".").pop();
  return ext === "docx" ? "docx" : ext === "xlsx" ? "xlsx" : null;
}

interface ErreurDocx {
  properties?: { errors?: { properties?: { explanation?: string; id?: string; xtag?: string } }[]; explanation?: string; id?: string };
  message?: string;
}

function messagesErreur(e: unknown): string[] {
  const err = e as ErreurDocx;
  const liste = err.properties?.errors?.map((x) => traduire(x.properties?.id, x.properties?.explanation ?? "", x.properties?.xtag)) ?? [];
  if (liste.length) return [...new Set(liste)];
  return [traduire(err.properties?.id, err.properties?.explanation ?? err.message ?? String(e))];
}

/** Messages de docxtemplater en français, d'après le code d'erreur. */
function traduire(id: string | undefined, msg: string, tag?: string): string {
  const t = tag ? ` « ${tag} »` : "";
  switch (id) {
    case "unclosed_tag":
      return `Balise non fermée${t} : il manque une accolade fermante « } ».`;
    case "unopened_tag":
      return `Accolade fermante sans ouverture${t}.`;
    case "duplicate_open_tag":
      return `Accolade ouvrante en double${t} : écrivez « {` + `champ} » et non « {` + `{champ} ».`;
    case "duplicate_close_tag":
      return `Accolade fermante en double${t}.`;
    case "unclosed_loop":
      return `Liste ou condition non fermée${t} : ajoutez {/${tag ?? "…"}}.`;
    case "unopened_loop":
      return `Fin de liste sans début${t}.`;
    case "closing_tag_does_not_match_opening_tag":
      return `Les balises d'ouverture et de fermeture ne correspondent pas${t}.`;
    case "unbalanced_loop_tags":
      return `Liste mal imbriquée${t} : le début et la fin doivent être dans la même ligne de tableau ou le même paragraphe.`;
    default:
      return msg || "Modèle illisible";
  }
}

function classer(tags: Record<string, unknown>, format: FormatModele): Analyse {
  const res: Analyse = { format, connus: [], libres: [], avertissements: [], erreurs: [] };
  for (const [cle, contenu] of Object.entries(tags)) {
    const estBoucle = contenu && typeof contenu === "object" && Object.keys(contenu as object).length > 0;
    if (CLES_CONNUES.has(cle)) {
      res.connus.push(cle);
      if (estBoucle) {
        const boucle = BOUCLES.find((b) => b.cle === cle);
        const champs = new Set(["rang", ...(boucle?.champs.map((c) => c.cle) ?? [])]);
        for (const sous of Object.keys(contenu as object)) {
          if (!champs.has(sous)) res.avertissements.push(`« ${sous} » n'existe pas dans la boucle « ${cle} » : il restera vide.`);
        }
      }
    } else if (estBoucle) {
      res.erreurs.push(`Boucle inconnue « ${cle} » : utilisez une des listes du catalogue (lignes_decompte, reserves…).`);
    } else {
      res.libres.push(cle);
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

function docx(buffer: ArrayBuffer) {
  return new Docxtemplater(new PizZip(buffer), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
}

interface PartieCompilee {
  type: string;
  value: string;
  module?: string;
  subparsed?: PartieCompilee[];
}

/** Balises d'un modèle Word compilé (corps, en-têtes, pieds de page) : { champ: {}, boucle: { sous_champ: {} } }. */
function balisesDocx(doc: Docxtemplater): Record<string, unknown> {
  const compiles = (doc as unknown as { compiled: Record<string, { postparsed: PartieCompilee[] }> }).compiled;
  const parcourir = (parties: PartieCompilee[], cible: Record<string, Record<string, unknown>>) => {
    for (const p of parties) {
      if (p.type !== "placeholder") continue;
      const v = p.value.trim();
      cible[v] ??= {};
      if (p.subparsed) parcourir(p.subparsed, cible[v] as Record<string, Record<string, unknown>>);
    }
  };
  const tags: Record<string, Record<string, unknown>> = {};
  for (const f of Object.values(compiles)) parcourir(f.postparsed, tags);
  return tags;
}

// ---------------------------------------------------------------------------
// Excel : remplacement des balises dans les chaînes partagées et les chaînes en ligne
// ---------------------------------------------------------------------------

const RE_BALISE = /\{([^{}]+)\}/g;
const decoder = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
const encoder = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Applique `f` au texte de chaque chaîne (<si> partagée ou <is> en ligne) contenant une balise. */
function parcourirXlsx(zip: PizZip, f: (texte: string) => string | null) {
  const fichiers = Object.keys(zip.files).filter((n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  for (const nom of fichiers) {
    const xml = zip.file(nom)!.asText();
    const nouveau = xml.replace(/<(si|is)>([\s\S]*?)<\/\1>/g, (bloc, balise: string, contenu: string) => {
      const texte = decoder([...contenu.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
      if (!texte.includes("{")) return bloc;
      const remplace = f(texte);
      if (remplace === null) return bloc;
      return `<${balise}><t xml:space="preserve">${encoder(remplace)}</t></${balise}>`;
    });
    if (nouveau !== xml) zip.file(nom, nouveau);
  }
}

function tagsXlsx(buffer: ArrayBuffer): { tags: Record<string, unknown>; erreurs: string[] } {
  const zip = new PizZip(buffer);
  const tags: Record<string, unknown> = {};
  const erreurs: string[] = [];
  parcourirXlsx(zip, (texte) => {
    for (const m of texte.matchAll(RE_BALISE)) {
      const cle = m[1].trim();
      if (/^[#/^]/.test(cle)) erreurs.push(`Boucles et conditions non prises en charge dans Excel (« {${cle}} ») : utilisez un modèle Word.`);
      else tags[cle] = {};
    }
    return null;
  });
  return { tags, erreurs: [...new Set(erreurs)] };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function analyserModele(buffer: ArrayBuffer, format: FormatModele): Analyse {
  if (format === "xlsx") {
    try {
      const { tags, erreurs } = tagsXlsx(buffer);
      const a = classer(tags, format);
      a.erreurs.push(...erreurs);
      return a;
    } catch {
      return { format, connus: [], libres: [], avertissements: [], erreurs: ["Fichier Excel illisible (.xlsx attendu)."] };
    }
  }
  let doc: Docxtemplater;
  try {
    doc = docx(buffer);
  } catch (e) {
    return { format, connus: [], libres: [], avertissements: [], erreurs: messagesErreur(e) };
  }
  return classer(balisesDocx(doc), format);
}

const MIME: Record<FormatModele, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function genererDocument(buffer: ArrayBuffer, format: FormatModele, donnees: Record<string, unknown>): Blob {
  if (format === "xlsx") {
    const zip = new PizZip(buffer);
    parcourirXlsx(zip, (texte) =>
      texte.replace(RE_BALISE, (tout, cle: string) => {
        const v = donnees[cle.trim()];
        if (v === undefined || v === null || Array.isArray(v)) return "";
        return typeof v === "boolean" ? (v ? "oui" : "non") : String(v);
      }),
    );
    return zip.generate({ type: "blob", mimeType: MIME.xlsx, compression: "DEFLATE" });
  }
  const doc = docx(buffer);
  try {
    doc.render(donnees);
  } catch (e) {
    throw new Error(messagesErreur(e).join(" "));
  }
  return doc.getZip().generate({ type: "blob", mimeType: MIME.docx, compression: "DEFLATE" });
}

export function telecharger(blob: Blob, nom: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

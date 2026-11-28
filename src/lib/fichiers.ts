/** Règles communes aux fichiers déposés (scans, CPS, bordereaux, modèles) : taille, type, messages d'erreur. */

const configuree = Number(process.env.NEXT_PUBLIC_TAILLE_MAX_MO);

/** Taille maximale d'un fichier, en Mo. Doit rester ≤ à la limite du bucket « scans » et à la limite globale du projet Supabase. */
export const TAILLE_MAX_MO = Number.isFinite(configuree) && configuree > 0 ? configuree : 50;
export const TAILLE_MAX = TAILLE_MAX_MO * 1024 * 1024;

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

export function extensionDe(nom: string): string {
  const i = nom.lastIndexOf(".");
  return i < 0 ? "" : nom.slice(i + 1).toLowerCase();
}

/**
 * Type MIME d'un fichier d'après son extension, à défaut celui déclaré par le navigateur.
 * Le navigateur laisse souvent le type vide (.docx sans Word installé, .heic, fichier produit par l'application) :
 * le stockage reçoit alors « application/octet-stream » et refuse le fichier.
 */
export function typeMime(nom: string, declare = ""): string {
  return TYPES[extensionDe(nom)] ?? declare;
}

/** Renvoie le fichier avec un type MIME fiable (le stockage se fie au type porté par le fichier). */
export function avecTypeMime(fichier: Blob, nom: string): Blob {
  const type = typeMime(nom, fichier.type);
  return type && type !== fichier.type ? new Blob([fichier], { type }) : fichier;
}

/** Traduit les refus du stockage Supabase en message exploitable. */
export function messageStockage(message: string): string {
  if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(message)) {
    return `Fichier refusé par le stockage : taille supérieure à la limite du projet Supabase (bucket « scans » ou limite globale du projet, à porter à ${TAILLE_MAX_MO} Mo).`;
  }
  if (/mime type .* is not supported|invalid mime type/i.test(message)) {
    return "Format de fichier non accepté par le stockage : PDF, image (JPEG, PNG, WebP, HEIC), Word (.docx), Excel (.xlsx) ou texte.";
  }
  if (/row-level security|unauthorized|jwt/i.test(message)) return "Dépôt refusé : session expirée ou droits insuffisants, reconnectez-vous.";
  if (/bucket not found/i.test(message)) return "Stockage non initialisé : appliquez les fichiers de supabase/migrations/ (voir README).";
  return message;
}

/** Traduit les erreurs de base de données dues à un schéma non à jour. */
export function messageBase(erreur: { message: string; code?: string }): string {
  if (["PGRST204", "PGRST205", "42P01", "42703"].includes(erreur.code ?? "") || /schema cache/i.test(erreur.message)) {
    return `Base de données à mettre à jour : appliquez les derniers fichiers de supabase/migrations/ (voir README). Détail : ${erreur.message}`;
  }
  return erreur.message;
}

export function verifierTaille(fichier: { size: number; name?: string }) {
  if (fichier.size > TAILLE_MAX) {
    const mo = (fichier.size / 1024 / 1024).toFixed(1).replace(".", ",");
    throw new Error(`${fichier.name ? `« ${fichier.name} » : ` : ""}fichier trop volumineux (${mo} Mo, maximum ${TAILLE_MAX_MO} Mo)`);
  }
}

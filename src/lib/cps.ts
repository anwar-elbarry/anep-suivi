import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ErreurIA, type ContenuSource } from "./ia";

const IMAGES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/**
 * Télécharge un fichier déposé par l'utilisateur (CPS, bordereau) et le prépare pour Claude :
 * PDF natif (y compris scanné), Word ou texte ; photos acceptées si `images` est vrai.
 */
export async function lireSource(
  supabase: SupabaseClient,
  userId: string,
  marcheId: string,
  chemin: string,
  { images = false }: { images?: boolean } = {},
): Promise<ContenuSource> {
  if (!chemin.startsWith(`${userId}/${marcheId}/`) || chemin.includes("..")) throw new ErreurIA("Chemin non autorisé", 403);
  const { data: fichier, error } = await supabase.storage.from("scans").download(chemin);
  if (error || !fichier) throw new ErreurIA("Fichier introuvable dans le stockage", 404);

  const nom = chemin.split("/").pop() ?? "document";
  const extension = nom.toLowerCase().split(".").pop() ?? "";
  const octets = Buffer.from(await fichier.arrayBuffer());

  let source: ContenuSource;
  try {
    if (extension === "pdf") {
      source = { type: "pdf", octets, titre: nom };
    } else if (extension === "docx") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: octets });
      source = { type: "texte", texte: value, titre: nom };
    } else if (extension === "txt") {
      source = { type: "texte", texte: octets.toString("utf8"), titre: nom };
    } else if (images && extension in IMAGES) {
      source = { type: "image", base64: octets.toString("base64"), mediaType: IMAGES[extension as keyof typeof IMAGES], titre: nom };
    } else {
      throw new ErreurIA(
        images ? "Format non pris en charge : PDF, photo (JPEG, PNG, WebP), Word (.docx) ou texte" : "Format non pris en charge : PDF, Word (.docx) ou texte",
        415,
      );
    }
  } catch (e) {
    if (e instanceof ErreurIA) throw e;
    throw new ErreurIA("Lecture du fichier impossible", 422);
  }
  if (source.type === "texte" && source.texte.trim().length < 50) {
    throw new ErreurIA("Le document ne contient pas de texte exploitable", 422);
  }
  return source;
}

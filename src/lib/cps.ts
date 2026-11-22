import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ErreurIA, type ContenuSource } from "./ia";

/** Télécharge le CPS déposé par l'utilisateur et le prépare pour Claude (PDF natif, Word ou texte). */
export async function lireCps(supabase: SupabaseClient, userId: string, marcheId: string, chemin: string): Promise<ContenuSource> {
  if (!chemin.startsWith(`${userId}/${marcheId}/`)) throw new ErreurIA("Chemin non autorisé", 403);
  const { data: fichier, error } = await supabase.storage.from("scans").download(chemin);
  if (error || !fichier) throw new ErreurIA("CPS introuvable dans le stockage", 404);

  const nom = chemin.split("/").pop() ?? "CPS";
  const extension = nom.toLowerCase().split(".").pop();
  const octets = Buffer.from(await fichier.arrayBuffer());

  let source: ContenuSource;
  try {
    if (extension === "pdf") {
      source = { type: "pdf", base64: octets.toString("base64"), titre: nom };
    } else if (extension === "docx") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: octets });
      source = { type: "texte", texte: value, titre: nom };
    } else if (extension === "txt") {
      source = { type: "texte", texte: octets.toString("utf8"), titre: nom };
    } else {
      throw new ErreurIA("Format non pris en charge : PDF, Word (.docx) ou texte", 415);
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

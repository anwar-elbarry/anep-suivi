import { NextResponse } from "next/server";
import { z } from "zod";
import { ErreurIA, proposerDocuments, type ContenuSource } from "@/lib/ia";
import { supabaseServeur } from "@/lib/supabase/server";

export const maxDuration = 300;

const Corps = z.object({
  marcheId: z.string().uuid(),
  chemin: z.string().min(1),
});

export async function POST(req: Request) {
  const supabase = await supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ erreur: "Non connecté" }, { status: 401 });

  const corps = Corps.safeParse(await req.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ erreur: "Requête invalide" }, { status: 400 });
  const { marcheId, chemin } = corps.data;

  // Le fichier doit être rangé sous <user_id>/<marche_id>/ (la RLS du stockage le garantit aussi).
  if (!chemin.startsWith(`${auth.user.id}/${marcheId}/`)) {
    return NextResponse.json({ erreur: "Chemin non autorisé" }, { status: 403 });
  }

  const { data: marche } = await supabase.from("marches").select("numero, objet").eq("id", marcheId).maybeSingle();
  if (!marche) return NextResponse.json({ erreur: "Marché introuvable" }, { status: 404 });

  const { data: fichier, error } = await supabase.storage.from("scans").download(chemin);
  if (error || !fichier) return NextResponse.json({ erreur: "CPS introuvable dans le stockage" }, { status: 404 });

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
      return NextResponse.json({ erreur: "Format non pris en charge : PDF, Word (.docx) ou texte" }, { status: 415 });
    }
  } catch {
    return NextResponse.json({ erreur: "Lecture du fichier impossible" }, { status: 422 });
  }

  if (source.type === "texte" && source.texte.trim().length < 50) {
    return NextResponse.json({ erreur: "Le document ne contient pas de texte exploitable" }, { status: 422 });
  }

  try {
    const documents = await proposerDocuments(
      source,
      `Marché ${marche.numero} : ${marche.objet}.
Ce document est le CPS (cahier des prescriptions spéciales) du marché. Lis ses parties techniques et propose un document
à fournir par l'entreprise pour chaque exigence concrète (ex. « fournir la fiche technique », « soumettre à l'agrément »,
« PV d'essai », « note de calcul », « plans d'exécution »). Indique l'article du CPS quand il est identifiable.
Ignore les clauses purement administratives (pénalités, paiement, cautionnement) sauf si elles exigent un document technique.`,
      "high",
    );
    return NextResponse.json({ documents });
  } catch (e) {
    const err = e instanceof ErreurIA ? e : new ErreurIA("Erreur inattendue", 500);
    return NextResponse.json({ erreur: err.message }, { status: err.status });
  }
}

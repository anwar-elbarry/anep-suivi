import { NextResponse } from "next/server";
import { z } from "zod";
import { ErreurIA, proposerDocuments } from "@/lib/ia";
import { supabaseServeur } from "@/lib/supabase/server";

export const maxDuration = 300;

const Corps = z.object({
  marcheId: z.string().uuid(),
  prestations: z
    .array(z.object({ designation: z.string(), unite: z.string().optional() }))
    .min(1)
    .max(2000),
});

export async function POST(req: Request) {
  const supabase = await supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ erreur: "Non connecté" }, { status: 401 });

  const corps = Corps.safeParse(await req.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ erreur: "Requête invalide" }, { status: 400 });

  const { data: marche } = await supabase
    .from("marches")
    .select("numero, objet")
    .eq("id", corps.data.marcheId)
    .maybeSingle();
  if (!marche) return NextResponse.json({ erreur: "Marché introuvable" }, { status: 404 });

  const liste = corps.data.prestations
    .map((p) => `- ${p.designation}${p.unite ? ` (${p.unite})` : ""}`)
    .join("\n");

  try {
    const documents = await proposerDocuments(
      { type: "texte", titre: "Prestations de l'attachement", texte: liste },
      `Marché ${marche.numero} : ${marche.objet}.
Voici les prestations d'un attachement. Pour chaque type de prestation, propose les documents que l'entreprise doit
fournir (fiche technique, méthode de mise en œuvre, rapports d'essais ou de contrôle, agréments, garanties…).
Exemple pour l'étanchéité : fiche technique, méthode de mise en œuvre, PV du contrôle technique validant l'essai d'eau.
Il n'y a pas de CPS ici : article_cps vaut null.`,
      "medium",
    );
    return NextResponse.json({ documents });
  } catch (e) {
    const err = e instanceof ErreurIA ? e : new ErreurIA("Erreur inattendue", 500);
    return NextResponse.json({ erreur: err.message }, { status: err.status });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { lireCps } from "@/lib/cps";
import { ErreurIA, proposerDocuments } from "@/lib/ia";
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

  const { data: marche } = await supabase.from("marches").select("numero, objet").eq("id", marcheId).maybeSingle();
  if (!marche) return NextResponse.json({ erreur: "Marché introuvable" }, { status: 404 });

  try {
    const source = await lireCps(supabase, auth.user.id, marcheId, chemin);
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

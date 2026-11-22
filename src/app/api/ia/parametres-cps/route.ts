import { NextResponse } from "next/server";
import { z } from "zod";
import { lireCps } from "@/lib/cps";
import { ErreurIA, extraireParametres } from "@/lib/ia";
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
    const parametres = await extraireParametres(source, `Marché ${marche.numero} : ${marche.objet}.`);
    return NextResponse.json({ parametres });
  } catch (e) {
    const err = e instanceof ErreurIA ? e : new ErreurIA("Erreur inattendue", 500);
    return NextResponse.json({ erreur: err.message }, { status: err.status });
  }
}

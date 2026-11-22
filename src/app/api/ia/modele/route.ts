import { NextResponse } from "next/server";
import { z } from "zod";
import { concevoirModele, ErreurIA } from "@/lib/ia";
import { supabaseServeur } from "@/lib/supabase/server";

export const maxDuration = 300;

const Corps = z.object({
  categorie: z.string().min(1).max(80),
  description: z.string().min(10, "Décrivez le document en quelques phrases").max(4000),
  entete: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const supabase = await supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ erreur: "Non connecté" }, { status: 401 });

  const corps = Corps.safeParse(await req.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ erreur: corps.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });

  try {
    const modele = await concevoirModele(corps.data);
    return NextResponse.json({ modele });
  } catch (e) {
    const err = e instanceof ErreurIA ? e : new ErreurIA("Erreur inattendue", 500);
    return NextResponse.json({ erreur: err.message }, { status: err.status });
  }
}

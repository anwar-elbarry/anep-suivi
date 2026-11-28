import { NextResponse } from "next/server";
import { z } from "zod";
import { lireSource } from "@/lib/cps";
import { ErreurIA, lireBpde, type ContenuSource } from "@/lib/ia";
import { supabaseServeur } from "@/lib/supabase/server";

export const maxDuration = 300;

/** Bordereau déposé dans le stockage (PDF, scan, photo) ou contenu d'un classeur transmis en texte. */
const Corps = z.union([
  z.object({ marcheId: z.string().uuid(), chemin: z.string().min(1) }),
  z.object({ marcheId: z.string().uuid(), texte: z.string().min(20).max(600_000), nom: z.string().max(200).optional() }),
]);

export async function POST(req: Request) {
  const supabase = await supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ erreur: "Non connecté" }, { status: 401 });

  const corps = Corps.safeParse(await req.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ erreur: "Requête invalide" }, { status: 400 });
  const { marcheId } = corps.data;

  const { data: marche } = await supabase.from("marches").select("numero, objet").eq("id", marcheId).maybeSingle();
  if (!marche) return NextResponse.json({ erreur: "Marché introuvable" }, { status: 404 });

  try {
    const source: ContenuSource =
      "chemin" in corps.data
        ? await lireSource(supabase, auth.user.id, marcheId, corps.data.chemin, { images: true })
        : { type: "texte", texte: corps.data.texte, titre: corps.data.nom ?? "Bordereau (tableau)" };
    const bpde = await lireBpde(source, `Marché ${marche.numero} : ${marche.objet}.`);
    return NextResponse.json(bpde);
  } catch (e) {
    const err = e instanceof ErreurIA ? e : new ErreurIA("Erreur inattendue", 500);
    return NextResponse.json({ erreur: err.message }, { status: err.status });
  }
}

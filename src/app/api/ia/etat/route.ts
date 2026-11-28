import { NextResponse } from "next/server";
import { iaConfiguree } from "@/lib/ia";
import { supabaseServeur } from "@/lib/supabase/server";

/** Indique à l'interface si les fonctions Claude sont activées (clé API renseignée côté serveur). */
export async function GET() {
  const supabase = await supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ erreur: "Non connecté" }, { status: 401 });
  return NextResponse.json({ configuree: iaConfiguree() });
}

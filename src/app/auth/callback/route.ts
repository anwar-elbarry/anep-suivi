import { NextResponse } from "next/server";
import { supabaseServeur } from "@/lib/supabase/server";

/** Retour du lien de confirmation d'e-mail : échange le code contre une session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServeur();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/", url.origin));
}

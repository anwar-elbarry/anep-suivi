import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_CONFIGURE, SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

const PAGES_PUBLIQUES = ["/connexion", "/auth"];

/** Rafraîchit la session Supabase et redirige vers /connexion si l'utilisateur n'est pas connecté. */
export async function proxy(request: NextRequest) {
  if (!SUPABASE_CONFIGURE) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (aEcrire) => {
        aEcrire.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        aEcrire.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const connecte = Boolean(data?.claims);
  const chemin = request.nextUrl.pathname;
  const publique = PAGES_PUBLIQUES.some((p) => chemin.startsWith(p));

  if (!connecte && !publique && !chemin.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

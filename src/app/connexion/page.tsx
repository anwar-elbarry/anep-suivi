"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import logoAnep from "@/assets/logo-anep.png";
import { Erreur } from "@/components/ui";
import { supabaseNavigateur } from "@/lib/supabase/client";
import { SUPABASE_CONFIGURE } from "@/lib/supabase/env";

export default function Connexion() {
  const router = useRouter();
  const [mode, setMode] = useState<"connexion" | "inscription">("connexion");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    setEnvoi(true);
    const sb = supabaseNavigateur();
    try {
      if (mode === "connexion") {
        const { error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else {
        const { data, error } = await sb.auth.signUp({
          email,
          password: motDePasse,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setInfo("Compte créé. Confirmez votre adresse à l'aide du lien reçu par e-mail, puis connectez-vous.");
          setMode("connexion");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErreur(msg === "Invalid login credentials" ? "E-mail ou mot de passe incorrect" : msg);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="carte w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src={logoAnep} alt="ANEP" height={64} priority />
          <h1 className="text-lg font-semibold">Suivi des travaux</h1>
        </div>
        {!SUPABASE_CONFIGURE && (
          <Erreur message="Supabase n'est pas configuré : renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (voir README)." />
        )}
        <Erreur message={erreur} />
        {info && <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{info}</div>}
        <form onSubmit={soumettre} className="space-y-3">
          <label className="block">
            <span className="etiquette">E-mail</span>
            <input className="champ" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="etiquette">Mot de passe</span>
            <input
              className="champ"
              type="password"
              autoComplete={mode === "connexion" ? "current-password" : "new-password"}
              minLength={8}
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </label>
          <button className="btn-primaire w-full" disabled={envoi || !SUPABASE_CONFIGURE}>
            {envoi ? "Patientez…" : mode === "connexion" ? "Se connecter" : "Créer le compte"}
          </button>
        </form>
        <button
          className="mt-4 w-full text-center text-sm text-marque-700 hover:underline"
          onClick={() => setMode(mode === "connexion" ? "inscription" : "connexion")}
        >
          {mode === "connexion" ? "Pas encore de compte ? Créer un compte" : "Déjà inscrit ? Se connecter"}
        </button>
      </div>
    </main>
  );
}

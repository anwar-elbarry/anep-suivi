"use client";
import { Download, FileStack, LayoutGrid, LogOut, MoreHorizontal, Upload } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import logoAnep from "@/assets/logo-anep.png";
import { exporterTout, restaurer } from "@/lib/sauvegarde";
import { supabaseNavigateur } from "@/lib/supabase/client";

const LIENS = [
  { href: "/", label: "Marchés", icone: LayoutGrid, actif: (p: string) => p === "/" || p.startsWith("/marches") },
  { href: "/modeles", label: "Modèles de documents", court: "Modèles", icone: FileStack, actif: (p: string) => p.startsWith("/modeles") },
];

/**
 * En-tête de l'application.
 * - Écran large : logo, navigation en pilules, boutons ronds (sauvegarde, restauration, déconnexion), initiales.
 * - Mobile : en-tête compact et barre de navigation fixée en bas de l'écran.
 */
export function EnTete() {
  const router = useRouter();
  const chemin = usePathname();
  const entree = useRef<HTMLInputElement>(null);
  const [occupe, setOccupe] = useState(false);
  const [menu, setMenu] = useState(false);
  const [initiales, setInitiales] = useState("");

  useEffect(() => {
    supabaseNavigateur()
      .auth.getUser()
      .then(({ data }) => {
        const e = data.user?.email ?? "";
        setInitiales(e ? e.slice(0, 2).toUpperCase() : "");
      });
  }, []);

  async function sauvegarder() {
    setMenu(false);
    setOccupe(true);
    try {
      const contenu = await exporterTout();
      const blob = new Blob([JSON.stringify(contenu, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `suivi-travaux-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(`Sauvegarde impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setOccupe(false);
    }
  }

  async function charger(f: File) {
    if (!confirm("Restaurer cette sauvegarde ? Les lignes de même identifiant seront remplacées.")) return;
    setOccupe(true);
    try {
      const n = await restaurer(JSON.parse(await f.text()));
      alert(`${n} ligne(s) restaurée(s).`);
      window.location.reload();
    } catch (e) {
      alert(`Restauration impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setOccupe(false);
    }
  }

  async function deconnexion() {
    await supabaseNavigateur().auth.signOut();
    router.replace("/connexion");
    router.refresh();
  }

  const restaurerClic = () => {
    setMenu(false);
    entree.current?.click();
  };

  return (
    <>
      <header className="no-print sticky top-0 z-40 px-3 pt-3 sm:px-4">
        <div className="carte mx-auto flex max-w-7xl items-center gap-2 rounded-full py-2 pl-3 pr-2 sm:gap-3 sm:pl-4">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Accueil — marchés">
            <Image src={logoAnep} alt="ANEP" height={30} priority />
            <span className="text-[15px] font-semibold tracking-tight md:hidden lg:inline">Suivi des travaux</span>
          </Link>

          <nav className="mx-auto hidden items-center gap-1 rounded-full bg-slate-100/70 p-1 md:flex" aria-label="Navigation principale">
            {LIENS.map((l) => {
              const actif = l.actif(chemin);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={actif ? "page" : undefined}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    actif ? "bg-encre text-white shadow" : "text-slate-600 hover:bg-white hover:text-encre"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <span className="flex-1 md:hidden" />

          <div className="hidden items-center gap-1.5 md:flex">
            <button className="btn-rond" onClick={sauvegarder} disabled={occupe} title="Sauvegarde : télécharger toutes vos données (JSON)" aria-label="Sauvegarde">
              <Download size={17} />
            </button>
            <button className="btn-rond" onClick={restaurerClic} disabled={occupe} title="Restaurer une sauvegarde JSON" aria-label="Restaurer">
              <Upload size={17} />
            </button>
            <button className="btn-rond" onClick={deconnexion} title="Se déconnecter" aria-label="Se déconnecter">
              <LogOut size={17} />
            </button>
          </div>
          {initiales && (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bleu text-sm font-semibold text-white"
              title="Compte connecté"
              aria-hidden
            >
              {initiales}
            </span>
          )}
        </div>
      </header>

      {/* Navigation mobile, fixée en bas */}
      <nav
        className="no-print fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden"
        aria-label="Navigation principale (mobile)"
      >
        <div className="carte relative flex items-center justify-around rounded-full bg-white/95 px-2 py-1.5 shadow-[0_12px_40px_-8px_rgba(16,20,26,0.25)]">
          {LIENS.map((l) => {
            const actif = l.actif(chemin);
            const Icone = l.icone;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={actif ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium ${
                  actif ? "bg-encre text-white" : "text-slate-500"
                }`}
              >
                <Icone size={19} />
                {l.court ?? l.label}
              </Link>
            );
          })}
          <button
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium ${menu ? "bg-slate-100 text-encre" : "text-slate-500"}`}
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            aria-haspopup="menu"
          >
            <MoreHorizontal size={19} />
            Plus
          </button>
          {menu && (
            <div role="menu" className="carte absolute bottom-full right-0 mb-2 w-60 overflow-hidden rounded-3xl bg-white py-1 text-sm">
              <button role="menuitem" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={sauvegarder} disabled={occupe}>
                <Download size={17} /> Sauvegarde (JSON)
              </button>
              <button role="menuitem" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={restaurerClic} disabled={occupe}>
                <Upload size={17} /> Restaurer une sauvegarde
              </button>
              <button role="menuitem" className="flex w-full items-center gap-3 px-4 py-3 text-left text-rouge-fonce hover:bg-rouge-pale" onClick={deconnexion}>
                <LogOut size={17} /> Se déconnecter
              </button>
            </div>
          )}
        </div>
      </nav>

      <input
        ref={entree}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) charger(f);
        }}
      />
    </>
  );
}

/** Conteneur de page : marges adaptées et espace réservé à la barre mobile. */
export const CLASSE_PAGE = "mx-auto w-full max-w-7xl px-3 pb-28 pt-5 sm:px-4 md:pb-10 md:pt-6";

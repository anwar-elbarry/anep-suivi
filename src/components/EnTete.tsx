"use client";
import { Download, HardHat, LogOut, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { exporterTout, restaurer } from "@/lib/sauvegarde";
import { supabaseNavigateur } from "@/lib/supabase/client";

export function EnTete({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const entree = useRef<HTMLInputElement>(null);
  const [occupe, setOccupe] = useState(false);

  async function sauvegarder() {
    setOccupe(true);
    try {
      const contenu = await exporterTout();
      const blob = new Blob([JSON.stringify(contenu, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `suivi-travaux-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
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

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <HardHat size={20} className="text-marque-600" />
          Suivi des travaux
        </Link>
        <div className="min-w-0 flex-1">{children}</div>
        <button className="btn" onClick={sauvegarder} disabled={occupe} title="Télécharger une sauvegarde JSON de toutes vos données">
          <Download size={15} /> <span className="hidden sm:inline">Sauvegarde</span>
        </button>
        <button className="btn" onClick={() => entree.current?.click()} disabled={occupe} title="Restaurer une sauvegarde JSON">
          <Upload size={15} /> <span className="hidden sm:inline">Restaurer</span>
        </button>
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
        <button className="btn-icone" onClick={deconnexion} title="Se déconnecter" aria-label="Se déconnecter">
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}

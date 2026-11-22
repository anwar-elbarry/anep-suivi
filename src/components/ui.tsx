"use client";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { StatutDocument, StatutMarche } from "@/lib/types";

export function Modal({
  titre,
  ouvert,
  onFermer,
  children,
  large,
}: {
  titre: string;
  ouvert: boolean;
  onFermer: () => void;
  children: ReactNode;
  large?: boolean;
}) {
  useEffect(() => {
    if (!ouvert) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", f);
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", f);
      document.body.style.overflow = precedent;
    };
  }, [ouvert, onFermer]);
  if (!ouvert) return null;
  return (
    // Mobile : feuille qui monte du bas ; écran large : fenêtre centrée.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-encre/30 backdrop-blur-sm sm:items-start sm:overflow-y-auto sm:p-4 sm:pt-[6vh]"
      onMouseDown={onFermer}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-[1.75rem] border border-white/70 bg-white shadow-2xl sm:max-h-none sm:rounded-[1.75rem] ${
          large ? "sm:max-w-5xl" : "sm:max-w-xl"
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
          <h2 className="text-lg font-semibold">{titre}</h2>
          <button className="btn-rond" onClick={onFermer} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">{children}</div>
      </div>
    </div>
  );
}

export function Champ({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="etiquette">{label}</span>
      {children}
    </label>
  );
}

/** Jauge linéaire : valeur entre 0 et 1, libellé et pourcentage toujours affichés (jamais la couleur seule). */
export function Barre({ label, valeur, couleur = "bg-bleu-fonce", detail }: { label: string; valeur: number; couleur?: string; detail?: string }) {
  const pct = Math.max(0, Math.min(1, valeur || 0)) * 100;
  return (
    <div>
      {(label || detail) && (
        <div className="mb-1.5 flex justify-between gap-2 text-xs text-slate-500">
          <span>{label}</span>
          <span className="font-medium tabular-nums text-encre">{detail ?? `${pct.toFixed(1).replace(".", ",")} %`}</span>
        </div>
      )}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-slate-200/70"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || detail}
      >
        <div className={`h-full rounded-full ${couleur}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Jauge circulaire (une seule valeur) : le titre et le pourcentage sont écrits en clair au centre et dessous. */
export function Anneau({
  label,
  valeur,
  couleur = "#5b7fc7",
  sous,
  taille = 112,
  horizontal = false,
}: {
  label: string;
  valeur: number;
  couleur?: string;
  sous?: ReactNode;
  taille?: number;
  /** Jauge à gauche, libellé à droite (cartes de synthèse). */
  horizontal?: boolean;
}) {
  const v = Math.max(0, Math.min(1, valeur || 0));
  const epaisseur = 10;
  const r = (taille - epaisseur) / 2;
  const c = 2 * Math.PI * r;
  return (
    <figure className={horizontal ? "flex items-center gap-4 text-left" : "flex flex-col items-center gap-2 text-center"}>
      <div className="relative" style={{ width: taille, height: taille }}>
        <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} role="img" aria-label={`${label} : ${Math.round(v * 100)} %`}>
          <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="#e4e7ec" strokeWidth={epaisseur} />
          <circle
            cx={taille / 2}
            cy={taille / 2}
            r={r}
            fill="none"
            stroke={couleur}
            strokeWidth={epaisseur}
            strokeLinecap="round"
            strokeDasharray={`${c * v} ${c}`}
            transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center font-semibold tabular-nums ${taille < 90 ? "text-base" : "text-xl"}`}>
          {(v * 100).toFixed(0)}
          <span className="ml-0.5 text-sm font-medium text-slate-500">%</span>
        </span>
      </div>
      <figcaption>
        <span className="block text-sm font-medium">{label}</span>
        {sous && <span className="block text-xs text-slate-500">{sous}</span>}
      </figcaption>
    </figure>
  );
}

const COULEURS_STATUT: Record<StatutMarche, string> = {
  "Non démarré": "bg-slate-200/80 text-slate-700",
  "En cours": "bg-bleu text-white",
  Arrêté: "bg-rouge text-white",
  "Réception provisoire": "bg-encre text-white",
  "Réception définitive": "bg-encre/80 text-white",
  Résilié: "bg-rouge-pale text-rouge-fonce",
};

export function BadgeStatut({ statut }: { statut: StatutMarche }) {
  return <span className={`pastille ${COULEURS_STATUT[statut] ?? ""}`}>{statut}</span>;
}

export const COULEURS_DOC: Record<StatutDocument, string> = {
  "À fournir": "bg-slate-200/80 text-slate-700",
  Fourni: "bg-bleu-pale text-bleu-texte",
  Validé: "bg-bleu text-white",
  "À reprendre": "bg-rouge text-white",
};

export function BadgeDoc({ statut }: { statut: StatutDocument }) {
  return <span className={`pastille ${COULEURS_DOC[statut]}`}>{statut}</span>;
}

export function Vide({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-white/40 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Erreur({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="mb-3 rounded-2xl border border-rouge/30 bg-rouge-pale px-4 py-2.5 text-sm text-rouge-fonce">{message}</div>;
}

export function Chiffre({ label, valeur, sous, alerte }: { label: string; valeur: ReactNode; sous?: ReactNode; alerte?: boolean }) {
  return (
    <div className="carte min-w-0 px-4 py-4 sm:px-5">
      <div className="truncate text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold tabular-nums sm:text-2xl ${alerte ? "text-rouge-fonce" : "text-encre"}`}>{valeur}</div>
      {sous && <div className="mt-0.5 text-xs text-slate-500">{sous}</div>}
    </div>
  );
}

export function ChampNombre({
  valeur,
  onChange,
  ...props
}: { valeur: number | null | undefined; onChange: (v: number | null) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <input
      {...props}
      className={props.className ?? "champ"}
      inputMode="decimal"
      defaultValue={valeur === null || valeur === undefined ? "" : String(valeur).replace(".", ",")}
      key={String(valeur ?? "")}
      onBlur={(e) => {
        const s = e.target.value.replace(/\s/g, "").replace(",", ".");
        if (s === "") return onChange(null);
        const n = Number(s);
        onChange(Number.isFinite(n) ? n : null);
      }}
    />
  );
}

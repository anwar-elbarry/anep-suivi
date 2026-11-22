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
    return () => window.removeEventListener("keydown", f);
  }, [ouvert, onFermer]);
  if (!ouvert) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[6vh]" onMouseDown={onFermer}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className={`carte w-full ${large ? "max-w-5xl" : "max-w-xl"} p-0`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">{titre}</h2>
          <button className="btn-icone" onClick={onFermer} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
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

export function Barre({ label, valeur, couleur = "bg-marque-600", detail }: { label: string; valeur: number; couleur?: string; detail?: string }) {
  const pct = Math.max(0, Math.min(1, valeur || 0)) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-slate-800">{detail ?? `${pct.toFixed(1).replace(".", ",")} %`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${couleur}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const COULEURS_STATUT: Record<StatutMarche, string> = {
  "Non démarré": "bg-slate-100 text-slate-700",
  "En cours": "bg-blue-100 text-blue-800",
  Arrêté: "bg-amber-100 text-amber-800",
  "Réception provisoire": "bg-emerald-100 text-emerald-800",
  "Réception définitive": "bg-emerald-200 text-emerald-900",
  Résilié: "bg-red-100 text-red-800",
};

export function BadgeStatut({ statut }: { statut: StatutMarche }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COULEURS_STATUT[statut] ?? ""}`}>{statut}</span>;
}

export const COULEURS_DOC: Record<StatutDocument, string> = {
  "À fournir": "bg-slate-100 text-slate-700",
  Fourni: "bg-blue-100 text-blue-800",
  Validé: "bg-emerald-100 text-emerald-800",
  "À reprendre": "bg-amber-100 text-amber-800",
};

export function BadgeDoc({ statut }: { statut: StatutDocument }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COULEURS_DOC[statut]}`}>{statut}</span>;
}

export function Vide({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Erreur({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</div>;
}

export function Chiffre({ label, valeur, sous, alerte }: { label: string; valeur: ReactNode; sous?: ReactNode; alerte?: boolean }) {
  return (
    <div className="carte p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${alerte ? "text-red-600" : "text-slate-900"}`}>{valeur}</div>
      {sous && <div className="mt-0.5 text-xs text-slate-500">{sous}</div>}
    </div>
  );
}

/** Champ numérique tolérant la virgule décimale. */
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

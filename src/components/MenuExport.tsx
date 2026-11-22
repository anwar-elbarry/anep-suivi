"use client";
import { ChevronDown, FileDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { exporterExcel } from "@/lib/exportExcel";
import type { DossierMarche } from "@/lib/types";

const IMPRESSIONS = [
  { doc: "decompte", label: "Projet de décompte" },
  { doc: "ecarts", label: "Tableau des écarts" },
  { doc: "fiche", label: "Fiche de synthèse" },
  { doc: "documents", label: "Documents à fournir" },
];

export function MenuExport({ dossier }: { dossier: DossierMarche }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOuvert(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [ouvert]);

  return (
    <div className="relative" ref={ref}>
      <button className="btn" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} aria-haspopup="menu">
        <FileDown size={14} /> Exporter <ChevronDown size={13} />
      </button>
      {ouvert && (
        <div role="menu" className="carte absolute right-0 z-30 mt-1 w-60 py-1 text-sm">
          <button
            role="menuitem"
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            onClick={() => {
              setOuvert(false);
              try {
                exporterExcel(dossier);
              } catch (e) {
                alert(`Export impossible : ${e instanceof Error ? e.message : e}`);
              }
            }}
          >
            Classeur Excel complet
          </button>
          <div className="my-1 border-t border-slate-100" />
          <p className="px-3 pt-1 text-xs font-medium uppercase tracking-wide text-slate-400">Imprimer / PDF</p>
          {IMPRESSIONS.map((i) => (
            <a
              key={i.doc}
              role="menuitem"
              href={`/marches/${dossier.marche.id}/imprimer?doc=${i.doc}`}
              target="_blank"
              rel="noopener"
              className="block px-3 py-2 hover:bg-slate-50"
              onClick={() => setOuvert(false)}
            >
              {i.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";
import { Check, Copy, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { BOUCLES, CHAMPS } from "@/lib/modeles/catalogue";

function Copier({ texte }: { texte: string }) {
  const [fait, setFait] = useState(false);
  return (
    <button
      className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 hover:bg-marque-100"
      title="Copier la balise"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
          setFait(true);
          setTimeout(() => setFait(false), 1200);
        } catch {
          // presse-papiers indisponible
        }
      }}
    >
      {texte} {fait ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} className="text-slate-400" />}
    </button>
  );
}

/** Aide : syntaxe des modèles et catalogue des données, avec recherche et copie. */
export function AideChamps({ valeurs }: { valeurs?: Record<string, string> }) {
  const [q, setQ] = useState("");
  const filtre = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const groupes = useMemo(() => {
    const f = filtre(q);
    const m = new Map<string, typeof CHAMPS>();
    for (const c of CHAMPS) {
      if (f && !filtre(`${c.cle} ${c.libelle} ${c.groupe}`).includes(f)) continue;
      m.set(c.groupe, [...(m.get(c.groupe) ?? []), c]);
    }
    return [...m.entries()];
  }, [q]);
  const boucles = BOUCLES.filter((b) => !q || filtre(`${b.cle} ${b.libelle} ${b.champs.map((c) => c.cle).join(" ")}`).includes(filtre(q)));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1 font-semibold">Champ</p>
          <p className="text-slate-600">
            Écrivez la balise entre accolades dans Word ou Excel : <Copier texte="{marche_numero}" />
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1 font-semibold">Tableau (Word)</p>
          <p className="text-slate-600">
            Dans une ligne de tableau : <Copier texte="{#lignes_decompte}" /> dans la 1re cellule, <Copier texte="{/lignes_decompte}" /> dans la dernière.
            La ligne est répétée.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1 font-semibold">Champ à saisir</p>
          <p className="text-slate-600">
            Toute balise hors catalogue, ex. <Copier texte="{destinataire}" />, est demandée au moment de générer. Condition :{" "}
            <Copier texte="{#en_retard}…{/en_retard}" />
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
        <input className="champ pl-9" placeholder="Rechercher une donnée" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {groupes.map(([groupe, champs]) => (
          <div key={groupe}>
            <h3 className="mb-1.5 text-sm font-semibold text-slate-800">{groupe}</h3>
            <table className="w-full text-sm">
              <tbody>
                {champs.map((c) => (
                  <tr key={c.cle} className="border-b border-slate-100 last:border-0">
                    <td className="py-1 pr-2 align-top">
                      <Copier texte={`{${c.cle}}`} />
                    </td>
                    <td className="py-1 text-slate-600">
                      {c.libelle}
                      {valeurs && valeurs[c.cle] !== undefined && valeurs[c.cle] !== "" && (
                        <span className="ml-1 text-xs text-slate-400">= {valeurs[c.cle]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {boucles.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Listes (tableaux Word)</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {boucles.map((b) => (
              <div key={b.cle} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Copier texte={`{#${b.cle}}`} />
                  <span className="text-slate-600">{b.libelle}</span>
                  {valeurs?.[b.cle] && <span className="text-xs text-slate-400">({valeurs[b.cle]})</span>}
                  <Copier texte={`{/${b.cle}}`} />
                </div>
                <div className="flex flex-wrap gap-1">
                  <Copier texte="{rang}" />
                  {b.champs.map((c) => (
                    <span key={c.cle} title={c.libelle}>
                      <Copier texte={`{${c.cle}}`} />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

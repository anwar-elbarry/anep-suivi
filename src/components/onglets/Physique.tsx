"use client";
import { useMemo, useState } from "react";
import { etatPhysique, formatMontant, formatPct, formatQte, rapprocher } from "@/lib/calculs";
import { modifier } from "@/lib/donnees";
import { Barre, Chiffre, Vide } from "../ui";
import type { PropsOnglet } from "./types";

export function OngletPhysique({ dossier, recharger, allerA }: PropsOnglet) {
  const { marche, bpde, attachements } = dossier;
  const [occupe, setOccupe] = useState(false);
  const r = useMemo(() => rapprocher(attachements, bpde, marche.attachements_cumulatifs), [attachements, bpde, marche.attachements_cumulatifs]);
  const p = useMemo(() => etatPhysique(bpde, r.quantites), [bpde, r]);

  async function basculer() {
    setOccupe(true);
    await modifier("marches", marche.id, { attachements_cumulatifs: !marche.attachements_cumulatifs });
    await recharger();
    setOccupe(false);
  }

  if (!bpde.length) {
    return (
      <Vide>
        L&apos;état physique compare les quantités des attachements au BPDE.{" "}
        <button className="text-marque-700 hover:underline" onClick={() => allerA("bpde")}>
          Importez d&apos;abord le BPDE
        </button>
        .
      </Vide>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chiffre label="Avancement physique" valeur={formatPct(p.avancement)} sous="pondéré par la valeur des lignes" />
        <Chiffre label="Exécuté HT" valeur={formatMontant(p.montantExecuteHT)} sous={`sur ${formatMontant(p.montantMarcheHT)}`} />
        <Chiffre label="Lignes en dépassement" valeur={p.lignes.filter((l) => l.depassement).length} alerte={p.lignes.some((l) => l.depassement)} />
        <Chiffre label="Lignes non rapprochées" valeur={r.nonRapprochees.length} alerte={r.nonRapprochees.length > 0} />
      </div>

      <div className="carte flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-60 flex-1">
          <Barre label="Avancement physique global" valeur={p.avancement} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={marche.attachements_cumulatifs} onChange={basculer} disabled={occupe} />
          Attachements cumulatifs (le dernier attachement fait foi)
        </label>
      </div>

      {r.nonRapprochees.length > 0 && (
        <div className="carte border-bleu/30 p-4">
          <h3 className="mb-2 text-sm font-semibold text-bleu-texte">Lignes d&apos;attachement non rapprochées du BPDE (non valorisées)</h3>
          <ul className="space-y-0.5 text-sm text-slate-700">
            {r.nonRapprochees.map((l, i) => (
              <li key={i}>
                Att. {l.attachement} — {l.numero && `n° ${l.numero} — `}
                {l.designation} : {formatQte(l.quantite)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Corrigez le n° de prix ou le libellé dans le BPDE ou dans le fichier d&apos;attachement.</p>
        </div>
      )}

      <div className="carte overflow-x-auto">
        <table className="tableau">
          <thead>
            <tr>
              <th>N°</th>
              <th>Désignation</th>
              <th>U</th>
              <th className="num">Qté marché</th>
              <th className="num">Qté exécutée</th>
              <th className="w-40">Avancement</th>
            </tr>
          </thead>
          <tbody>
            {p.lignes.map((l) => (
              <tr key={l.ligne.id} className={l.depassement ? "bg-rouge-pale/60" : ""}>
                <td>{l.ligne.numero}</td>
                <td>{l.ligne.designation}</td>
                <td>{l.ligne.unite}</td>
                <td className="num">{formatQte(l.qteMarche)}</td>
                <td className={`num ${l.depassement ? "font-semibold text-rouge-fonce" : ""}`}>{formatQte(l.qteExecutee)}</td>
                <td>
                  <Barre label="" valeur={l.taux} couleur={l.depassement ? "bg-rouge" : "bg-bleu-fonce"} detail={`${(l.taux * 100).toFixed(0)} %${l.depassement ? " · dépassement" : ""}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

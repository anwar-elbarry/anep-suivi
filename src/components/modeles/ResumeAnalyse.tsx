"use client";
import { AlertTriangle, CheckCircle2, PenLine, XCircle } from "lucide-react";
import type { Analyse } from "@/lib/modeles/moteur";

/** Résultat de l'analyse d'un modèle : champs reconnus, champs à saisir, erreurs. */
export function ResumeAnalyse({ analyse }: { analyse: Pick<Analyse, "connus" | "libres" | "avertissements"> & { erreurs?: string[] } }) {
  return (
    <div className="space-y-2 text-sm">
      {analyse.erreurs?.map((e) => (
        <p key={e} className="flex gap-2 text-rouge-fonce">
          <XCircle size={16} className="mt-0.5 shrink-0" /> {e}
        </p>
      ))}
      {!analyse.erreurs?.length && (
      <div className="flex gap-2">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-bleu-texte" />
        <div>
          <span className="font-medium">{analyse.connus.length} donnée(s) remplie(s) automatiquement</span>
          {analyse.connus.length > 0 && <p className="text-xs text-slate-500">{analyse.connus.join(", ")}</p>}
        </div>
      </div>
      )}
      {analyse.libres.length > 0 && (
        <div className="flex gap-2">
          <PenLine size={16} className="mt-0.5 shrink-0 text-marque-600" />
          <div>
            <span className="font-medium">{analyse.libres.length} champ(s) à saisir lors de la génération</span>
            <p className="text-xs text-slate-500">{analyse.libres.join(", ")}</p>
          </div>
        </div>
      )}
      {analyse.avertissements.map((a) => (
        <p key={a} className="flex gap-2 text-bleu-texte">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {a}
        </p>
      ))}
      {analyse.connus.length === 0 && analyse.libres.length === 0 && !analyse.erreurs?.length && (
        <p className="text-bleu-texte">Aucune balise trouvée : le document sera produit tel quel. Voir l&apos;aide pour insérer des champs.</p>
      )}
    </div>
  );
}

"use client";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";

/** Zone de glisser-déposer avec bouton, pour des modèles Word / Excel. */
export function ZoneDepot({
  onFichiers,
  multiple = true,
  compacte = false,
  texte = "Déposez vos modèles Word (.docx) ou Excel (.xlsx) ici",
}: {
  onFichiers: (fichiers: File[]) => void;
  multiple?: boolean;
  compacte?: boolean;
  texte?: string;
}) {
  const entree = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={texte}
      onClick={() => entree.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && entree.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvol(false);
        const f = [...e.dataTransfer.files];
        if (f.length) onFichiers(multiple ? f : f.slice(0, 1));
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition ${
        compacte ? "px-4 py-4" : "px-6 py-8"
      } ${survol ? "border-marque-500 bg-marque-50" : "border-slate-300 bg-white hover:border-marque-500 hover:bg-slate-50"}`}
    >
      <Upload size={compacte ? 18 : 26} className="text-marque-600" />
      <p className="text-sm font-medium text-slate-700">{texte}</p>
      <p className="text-xs text-slate-500">
        ou <span className="font-medium text-marque-700 underline">parcourez vos fichiers</span>
      </p>
      <input
        ref={entree}
        type="file"
        hidden
        multiple={multiple}
        accept=".docx,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          const f = [...(e.target.files ?? [])];
          e.target.value = "";
          if (f.length) onFichiers(f);
        }}
      />
    </div>
  );
}

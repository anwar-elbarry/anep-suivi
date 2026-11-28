"use client";
import { Paperclip, Eye, X } from "lucide-react";
import { useRef, useState } from "react";
import { modifier, ouvrirFichier, supprimerFichier, televerser } from "@/lib/donnees";
import { TAILLE_MAX_MO } from "@/lib/fichiers";

/** Joindre / ouvrir / retirer le scan (PDF ou photo) d'une ligne. */
export function BoutonScan({
  table,
  id,
  marcheId,
  chemin,
  onChange,
}: {
  table: "documents" | "pv_reunions" | "garanties" | "avenants" | "reserves" | "ordres_service";
  id: string;
  marcheId: string;
  chemin: string | null;
  onChange: () => void;
}) {
  const entree = useRef<HTMLInputElement>(null);
  const [occupe, setOccupe] = useState(false);

  async function joindre(f: File) {
    setOccupe(true);
    try {
      const nouveau = await televerser(marcheId, "scans", f);
      try {
        await modifier(table, id, { scan_path: nouveau });
      } catch (e) {
        await supprimerFichier(nouveau); // pas de fichier orphelin si l'enregistrement échoue
        throw e;
      }
      await supprimerFichier(chemin);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  }

  async function retirer() {
    if (!chemin || !confirm("Retirer le scan joint ?")) return;
    setOccupe(true);
    try {
      await modifier(table, id, { scan_path: null });
      await supprimerFichier(chemin);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <span className="inline-flex items-center">
      {chemin ? (
        <>
          <button className="btn-icone text-marque-600" title="Ouvrir le scan" aria-label="Ouvrir le scan" onClick={() => ouvrirFichier(chemin).catch((e) => alert(e.message))}>
            <Eye size={16} />
          </button>
          <button className="btn-icone" title="Retirer le scan" aria-label="Retirer le scan" onClick={retirer} disabled={occupe}>
            <X size={14} />
          </button>
        </>
      ) : (
        <button className="btn-icone" title={`Joindre un scan (PDF ou photo, ${TAILLE_MAX_MO} Mo max.)`} aria-label="Joindre un scan" onClick={() => entree.current?.click()} disabled={occupe}>
          <Paperclip size={16} className={occupe ? "animate-pulse" : ""} />
        </button>
      )}
      <input
        ref={entree}
        type="file"
        accept="application/pdf,image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) joindre(f);
        }}
      />
    </span>
  );
}

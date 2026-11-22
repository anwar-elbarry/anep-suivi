"use client";
import { useState } from "react";
import { inserer, modifier } from "@/lib/donnees";
import { STATUTS_MARCHE, type Marche, type StatutMarche } from "@/lib/types";
import { Champ, ChampNombre, Erreur, Modal } from "./ui";

type Valeurs = Pick<Marche, "numero" | "objet" | "entreprise" | "montant_ttc" | "date_debut" | "duree_mois" | "statut">;

const VIDE: Valeurs = {
  numero: "",
  objet: "",
  entreprise: "",
  montant_ttc: 0,
  date_debut: null,
  duree_mois: 0,
  statut: "Non démarré",
};

export function FormulaireMarche({
  ouvert,
  onFermer,
  marche,
  onEnregistre,
}: {
  ouvert: boolean;
  onFermer: () => void;
  marche?: Marche;
  onEnregistre: (id: string) => void;
}) {
  const [v, setV] = useState<Valeurs>(marche ? { ...marche } : VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const maj = (p: Partial<Valeurs>) => setV((x) => ({ ...x, ...p }));

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const valeurs = {
        numero: v.numero.trim(),
        objet: v.objet.trim(),
        entreprise: v.entreprise.trim(),
        montant_ttc: v.montant_ttc ?? 0,
        date_debut: v.date_debut || null,
        duree_mois: v.duree_mois ?? 0,
        statut: v.statut,
      };
      if (marche) {
        await modifier("marches", marche.id, valeurs);
        onEnregistre(marche.id);
      } else {
        const [cree] = (await inserer("marches", valeurs)) as Marche[];
        onEnregistre(cree.id);
      }
      onFermer();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal titre={marche ? "Modifier le marché" : "Nouveau marché"} ouvert={ouvert} onFermer={onFermer}>
      <Erreur message={erreur} />
      <form onSubmit={soumettre} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Champ label="N° du marché *">
          <input className="champ" required value={v.numero} onChange={(e) => maj({ numero: e.target.value })} />
        </Champ>
        <Champ label="Statut">
          <select className="champ" value={v.statut} onChange={(e) => maj({ statut: e.target.value as StatutMarche })}>
            {STATUTS_MARCHE.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Champ>
        <Champ label="Objet des travaux" className="sm:col-span-2">
          <textarea className="champ" rows={2} value={v.objet} onChange={(e) => maj({ objet: e.target.value })} />
        </Champ>
        <Champ label="Entreprise titulaire" className="sm:col-span-2">
          <input className="champ" value={v.entreprise} onChange={(e) => maj({ entreprise: e.target.value })} />
        </Champ>
        <Champ label="Montant TTC">
          <ChampNombre valeur={v.montant_ttc} onChange={(n) => maj({ montant_ttc: n ?? 0 })} />
        </Champ>
        <Champ label="Délai (mois)">
          <ChampNombre valeur={v.duree_mois} onChange={(n) => maj({ duree_mois: n ?? 0 })} />
        </Champ>
        <Champ label="Date de début (à défaut d'OS de démarrage)" className="sm:col-span-2">
          <input className="champ" type="date" value={v.date_debut ?? ""} onChange={(e) => maj({ date_debut: e.target.value || null })} />
        </Champ>
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onFermer}>
            Annuler
          </button>
          <button className="btn-primaire" disabled={envoi}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

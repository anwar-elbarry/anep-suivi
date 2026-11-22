"use client";
import { useEffect, useState } from "react";
import { CATEGORIES_MODELE, enregistrerModele, lireFichier } from "@/lib/modeles/bibliotheque";
import type { Analyse } from "@/lib/modeles/moteur";
import { Champ, Erreur, Modal } from "../ui";
import { ResumeAnalyse } from "./ResumeAnalyse";

/** Devine une catégorie d'après le nom du fichier. */
function categorieProbable(nom: string): string {
  const n = nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (n.includes("decompte")) return "Décompte";
  if (n.includes("envoi")) return "Bordereau d'envoi";
  if (n.includes("penalit") || n.includes("decision")) return "Décision / pénalités";
  if (/\bos\b|ordre.de.service/.test(n)) return "Ordre de service";
  if (n.includes("pv") || n.includes("proces")) return "PV";
  if (n.includes("bordereau")) return "Bordereau";
  if (n.includes("marche")) return "Marché";
  if (n.includes("lettre") || n.includes("courrier")) return "Courrier";
  if (n.endsWith(".xlsx")) return "Tableau Excel";
  return "Autre";
}

/** Ajout d'un ou plusieurs modèles déposés : analyse, nom, catégorie, enregistrement. */
export function AjoutModeles({ fichiers, onFermer, onAjoute }: { fichiers: File[]; onFermer: () => void; onAjoute: () => void }) {
  const [index, setIndex] = useState(0);
  const [lecture, setLecture] = useState<{ analyse: Analyse } | null>(null);
  const [nom, setNom] = useState("");
  const [categorie, setCategorie] = useState("Autre");
  const [description, setDescription] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const fichier = fichiers[index];

  useEffect(() => {
    if (!fichier) return;
    let annule = false;
    lireFichier(fichier).then(
      (r) => {
        if (annule) return;
        setLecture({ analyse: r.analyse });
        setNom(fichier.name.replace(/\.(docx|xlsx)$/i, "").replace(/[-_]+/g, " "));
        setCategorie(categorieProbable(fichier.name));
        setDescription("");
        setErreur(null);
      },
      (e) => {
        if (annule) return;
        setLecture(null);
        setErreur(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      annule = true;
    };
  }, [fichier]);

  function suivant() {
    setLecture(null);
    if (index + 1 < fichiers.length) setIndex(index + 1);
    else onFermer();
  }

  async function enregistrer() {
    if (!lecture) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await enregistrerModele(fichier, fichier.name, { nom: nom.trim() || fichier.name, categorie, description: description.trim() }, lecture.analyse);
      onAjoute();
      suivant();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  }

  if (!fichier) return null;
  const bloquant = !lecture || lecture.analyse.erreurs.length > 0;

  return (
    <Modal titre={`Nouveau modèle${fichiers.length > 1 ? ` (${index + 1} / ${fichiers.length})` : ""} — ${fichier.name}`} ouvert onFermer={onFermer}>
      <Erreur message={erreur} />
      {lecture && (
        <>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <ResumeAnalyse analyse={lecture.analyse} />
          </div>
          {lecture.analyse.erreurs.length > 0 ? (
            <p className="mb-3 text-sm text-slate-600">Corrigez le modèle dans Word ou Excel, puis déposez-le à nouveau.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Nom du modèle" className="col-span-2">
                <input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} />
              </Champ>
              <Champ label="Catégorie">
                <select className="champ" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                  {CATEGORIES_MODELE.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Champ>
              <Champ label="Description (facultatif)" className="col-span-2">
                <textarea className="champ" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Champ>
            </div>
          )}
        </>
      )}
      {!lecture && !erreur && <p className="text-sm text-slate-500">Analyse du modèle…</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={suivant}>
          {fichiers.length > 1 && index + 1 < fichiers.length ? "Ignorer ce fichier" : "Annuler"}
        </button>
        <button className="btn-primaire" onClick={enregistrer} disabled={envoi || bloquant}>
          {envoi ? "Enregistrement…" : "Ajouter à la bibliothèque"}
        </button>
      </div>
    </Modal>
  );
}

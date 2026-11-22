"use client";
import { FileOutput, FileSpreadsheet, FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/calculs";
import {
  chargerFichierModele,
  enregistrerModele,
  lireFichier,
  lireValeursLibres,
  listerModeles,
  memoriserValeursLibres,
  type Modele,
} from "@/lib/modeles/bibliotheque";
import { apercuValeurs, construireDonnees } from "@/lib/modeles/catalogue";
import { analyserModele, genererDocument, telecharger, type Analyse, type FormatModele } from "@/lib/modeles/moteur";
import type { DossierMarche } from "@/lib/types";
import { AideChamps } from "./AideChamps";
import { ResumeAnalyse } from "./ResumeAnalyse";
import { ZoneDepot } from "./ZoneDepot";
import { Champ, Erreur, Modal } from "../ui";

interface Source {
  cle: string; // id du modèle, ou nom du fichier déposé
  nom: string;
  format: FormatModele;
  buffer: ArrayBuffer;
  analyse: Analyse;
  fichier?: File; // modèle déposé ponctuellement
}

/** Nom du fichier produit, sans accents ni caractères interdits (compatibilité messageries et serveurs de fichiers). */
const nomSortie = (nom: string, numero: string, format: FormatModele) =>
  `${nom} - marche ${numero}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w ().,'-]+/g, "-")
    .slice(0, 120) + `.${format}`;

/** Génère un document à partir d'un modèle et des données du marché. */
export function GenererDocument({ dossier }: { dossier: DossierMarche }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOuvert(true)}>
        <FileOutput size={14} /> Générer un document
      </button>
      {ouvert && <Fenetre dossier={dossier} onFermer={() => setOuvert(false)} />}
    </>
  );
}

function Fenetre({ dossier, onFermer }: { dossier: DossierMarche; onFermer: () => void }) {
  const [modeles, setModeles] = useState<Modele[] | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [decompteId, setDecompteId] = useState<string>("");
  const [libres, setLibres] = useState<Record<string, string>>({});
  const [enregistrer, setEnregistrer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [aide, setAide] = useState(false);

  useEffect(() => {
    listerModeles().then(setModeles, (e) => setErreur(e instanceof Error ? e.message : String(e)));
  }, []);

  const utiliseDecompte = source?.analyse.connus.some((c) => c.startsWith("decompte_") || c === "lignes_decompte") ?? false;
  const valeurs = useMemo(() => (aide ? apercuValeurs({ dossier, decompteId: decompteId || null }) : undefined), [aide, dossier, decompteId]);
  const decomptes = [...dossier.decomptes].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  function choisir(s: Source) {
    setSource(s);
    setErreur(null);
    const memo = lireValeursLibres(s.cle);
    setLibres(Object.fromEntries(s.analyse.libres.map((k) => [k, memo[k] ?? ""])));
  }

  async function choisirModele(m: Modele) {
    setOccupe(true);
    try {
      const buffer = await chargerFichierModele(m.chemin);
      choisir({ cle: m.id, nom: m.nom, format: m.format, buffer, analyse: analyserModele(buffer, m.format) });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  }

  async function deposer([f]: File[]) {
    try {
      const r = await lireFichier(f);
      choisir({ cle: `fichier:${f.name}`, nom: f.name.replace(/\.(docx|xlsx)$/i, ""), format: r.format, buffer: r.buffer, analyse: r.analyse, fichier: f });
      setEnregistrer(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  async function generer() {
    if (!source) return;
    setOccupe(true);
    setErreur(null);
    try {
      const donnees = { ...construireDonnees({ dossier, decompteId: decompteId || null }), ...libres };
      const blob = genererDocument(source.buffer, source.format, donnees);
      telecharger(blob, nomSortie(source.nom, dossier.marche.numero, source.format));
      memoriserValeursLibres(source.cle, libres);
      if (source.fichier && enregistrer) {
        await enregistrerModele(source.fichier, source.fichier.name, { nom: source.nom, categorie: "Autre", description: "" }, source.analyse);
        setModeles(await listerModeles());
        setEnregistrer(false);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <Modal titre={`Générer un document — marché ${dossier.marche.numero}`} ouvert onFermer={onFermer} large>
      <Erreur message={erreur} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">1. Choisir un modèle</h3>
          {modeles === null && <p className="text-sm text-slate-500">Chargement…</p>}
          {modeles?.length === 0 && (
            <p className="text-sm text-slate-600">
              Bibliothèque vide.{" "}
              <Link href="/modeles" className="text-marque-700 hover:underline">
                Ajouter des modèles
              </Link>
            </p>
          )}
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {modeles?.map((m) => {
              const Icone = m.format === "xlsx" ? FileSpreadsheet : FileText;
              return (
                <button
                  key={m.id}
                  onClick={() => choisirModele(m)}
                  disabled={occupe}
                  className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    source?.cle === m.id ? "border-marque-500 bg-marque-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <Icone size={16} className="mt-0.5 shrink-0 text-slate-500" />
                  <span>
                    <span className="font-medium">{m.nom}</span>
                    <span className="block text-xs text-slate-500">{m.categorie}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <ZoneDepot compacte multiple={false} texte="Ou déposez un modèle à utiliser" onFichiers={deposer} />
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">2. Compléter et générer</h3>
          {!source ? (
            <p className="text-sm text-slate-500">Sélectionnez un modèle à gauche.</p>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-medium">{source.nom}</p>
                <ResumeAnalyse analyse={source.analyse} />
              </div>
              {source.analyse.erreurs.length === 0 && (
                <>
                  {utiliseDecompte && (
                    <Champ label="Décompte à utiliser">
                      <select className="champ" value={decompteId} onChange={(e) => setDecompteId(e.target.value)}>
                        <option value="">Projet de décompte n° {dossier.decomptes.length + 1} (en cours)</option>
                        {decomptes.map((d) => (
                          <option key={d.id} value={d.id}>
                            Décompte n° {d.numero} du {formatDate(d.date)}
                          </option>
                        ))}
                      </select>
                    </Champ>
                  )}
                  {source.analyse.libres.map((k) => (
                    <Champ key={k} label={k.replace(/_/g, " ")}>
                      <textarea
                        className="champ"
                        rows={/pieces|observations|motif|objet/.test(k) ? 3 : 1}
                        value={libres[k] ?? ""}
                        onChange={(e) => setLibres({ ...libres, [k]: e.target.value })}
                      />
                    </Champ>
                  ))}
                  {source.fichier && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={enregistrer} onChange={(e) => setEnregistrer(e.target.checked)} />
                      Enregistrer aussi ce modèle dans la bibliothèque
                    </label>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button className="text-xs text-marque-700 hover:underline" onClick={() => setAide(!aide)}>
                      {aide ? "Masquer" : "Voir"} les données disponibles pour ce marché
                    </button>
                    <button className="btn-primaire" onClick={generer} disabled={occupe}>
                      <FileOutput size={15} /> {occupe ? "Génération…" : `Générer le ${source.format === "xlsx" ? "classeur" : "document"}`}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Le document produit est un projet à relire : vérifiez les montants et les mentions avant signature et envoi.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {aide && valeurs && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <AideChamps valeurs={valeurs} />
        </div>
      )}
    </Modal>
  );
}

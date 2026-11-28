"use client";
import { Check, ChevronDown, ChevronRight, Copy, Download, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { appelerRouteIA, iaActivee, MESSAGE_IA_INACTIVE } from "@/lib/donnees";
import { CATEGORIES_MODELE, enregistrerModele } from "@/lib/modeles/bibliotheque";
import { construireDocx } from "@/lib/modeles/construireDocx";
import { analyserModele, telecharger, type Analyse } from "@/lib/modeles/moteur";
import { promptExterne } from "@/lib/modeles/prompt";
import type { ModeleIA } from "@/lib/schemasIA";
import { Champ, Erreur, Modal } from "../ui";
import { ResumeAnalyse } from "./ResumeAnalyse";

const IDEES: { categorie: string; description: string }[] = [
  {
    categorie: "Bordereau d'envoi",
    description: "Bordereau d'envoi des attachements et du projet de décompte au bureau d'études pour vérification, avec la liste des pièces jointes.",
  },
  {
    categorie: "Courrier",
    description: "Lettre de relance à l'entreprise pour les documents à fournir en retard, avec le tableau des documents et un délai de réponse à saisir.",
  },
  {
    categorie: "Décision / pénalités",
    description: "Projet de mise en demeure de l'entreprise pour retard d'exécution : rappel des délais, jours de retard, pénalités encourues.",
  },
  {
    categorie: "PV",
    description: "Procès-verbal de réception provisoire avec la liste des réserves, les intervenants présents et les cadres de signature.",
  },
  {
    categorie: "Ordre de service",
    description: "Ordre de service d'arrêt des travaux : motif à saisir, date d'effet, rappel du délai contractuel et de la date de fin prévue.",
  },
];

const nomFichier = (nom: string) =>
  nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w ().,'-]+/g, "-")
    .slice(0, 100) + ".docx";

/** Création d'un modèle par un agent IA : prompt à copier, ou génération directe par Claude. */
export function CreerAvecIA({
  initial,
  onFermer,
  onAjoute,
}: {
  initial?: { categorie?: string; description?: string };
  onFermer: () => void;
  onAjoute: () => void;
}) {
  const [categorie, setCategorie] = useState(initial?.categorie ?? "Courrier");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [entete, setEntete] = useState("");
  const [voirPrompt, setVoirPrompt] = useState(false);
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etat, setEtat] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ modele: ModeleIA; blob: Blob; analyse: Analyse } | null>(null);
  const [nom, setNom] = useState("");
  /** null : état inconnu (vérification en cours) ; false : clé API absente du serveur. */
  const [claudeActif, setClaudeActif] = useState<boolean | null>(null);

  useEffect(() => {
    let actif = true;
    iaActivee().then((ok) => actif && setClaudeActif(ok));
    return () => {
      actif = false;
    };
  }, []);

  const prompt = useMemo(() => promptExterne({ categorie, description, entete }), [categorie, description, entete]);

  async function copier() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      setVoirPrompt(true);
      setErreur("Copie automatique impossible : sélectionnez le texte du prompt et copiez-le.");
    }
  }

  async function generer() {
    setErreur(null);
    setResultat(null);
    if (description.trim().length < 10) {
      setErreur("Décrivez le document souhaité en une ou deux phrases.");
      return;
    }
    setEtat("Claude conçoit le modèle…");
    try {
      const { modele } = await appelerRouteIA<{ modele: ModeleIA }>("modele", { categorie, description, entete: entete || undefined });
      setEtat("Construction du fichier Word…");
      const blob = await construireDocx(modele);
      const analyse = analyserModele(await blob.arrayBuffer(), "docx");
      setResultat({ modele, blob, analyse });
      setNom(modele.nom);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEtat(null);
    }
  }

  async function ajouter() {
    if (!resultat) return;
    setEtat("Enregistrement…");
    try {
      await enregistrerModele(
        resultat.blob,
        nomFichier(nom || resultat.modele.nom),
        { nom: nom.trim() || resultat.modele.nom, categorie, description: resultat.modele.description },
        resultat.analyse,
      );
      onAjoute();
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEtat(null);
    }
  }

  return (
    <Modal titre="Créer un modèle avec l'IA" ouvert onFermer={onFermer} large>
      <Erreur message={erreur} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Décrivez le document. Le prompt contient déjà la syntaxe des balises et la liste complète des données du marché : l&apos;agent IA
            produit un modèle prêt à déposer.
          </p>
          <div>
            <span className="etiquette">Idées</span>
            <div className="flex flex-wrap gap-1.5">
              {IDEES.map((i) => (
                <button
                  key={i.description}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-bleu-pale hover:text-bleu-texte"
                  onClick={() => {
                    setCategorie(i.categorie);
                    setDescription(i.description);
                  }}
                >
                  {i.description.split(/[:,]/)[0]}
                </button>
              ))}
            </div>
          </div>
          <Champ label="Type de document">
            <select className="champ" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              {CATEGORIES_MODELE.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Champ>
          <Champ label="Description du document souhaité">
            <textarea
              className="champ"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex. : lettre de transmission du décompte n° … au maître d'ouvrage, avec le net à payer en lettres et la liste des pièces jointes."
            />
          </Champ>
          <Champ label="En-tête à reproduire (facultatif)">
            <input className="champ" value={entete} onChange={(e) => setEntete(e.target.value)} placeholder="Ex. : Direction régionale — Service des marchés" />
          </Champ>

          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <button className="btn flex-1" onClick={copier}>
              {copie ? <Check size={15} className="text-bleu-texte" /> : <Copy size={15} />} {copie ? "Prompt copié" : "Copier le prompt"}
            </button>
            <button className="btn-primaire flex-1" onClick={generer} disabled={!!etat || claudeActif === false}>
              <Sparkles size={15} className={etat ? "animate-pulse" : ""} /> {etat ?? "Générer avec Claude"}
            </button>
          </div>
          {claudeActif === false && (
            <p className="rounded-2xl border border-bleu/30 bg-bleu-pale px-3 py-2 text-xs text-bleu-texte">
              {MESSAGE_IA_INACTIVE} En attendant, « Copier le prompt » reste utilisable avec l&apos;agent IA de votre choix.
            </p>
          )}
          <button className="inline-flex items-center gap-1 text-xs text-bleu-texte hover:underline" onClick={() => setVoirPrompt(!voirPrompt)}>
            {voirPrompt ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Voir le prompt complet
          </button>
          {voirPrompt && <textarea className="champ font-mono text-xs" rows={12} readOnly value={prompt} onFocus={(e) => e.target.select()} />}
          <p className="text-xs text-slate-500">
            « Copier le prompt » : à coller dans l&apos;agent IA de votre choix (Claude, Copilot dans Word…), puis déposez le fichier .docx obtenu
            dans la bibliothèque. « Générer avec Claude » : le modèle est créé ici, sans quitter l&apos;application.
          </p>
        </div>

        <div className="space-y-3">
          {!resultat ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
              <Sparkles size={22} className="mb-2 text-bleu-fonce" />
              Le modèle généré apparaîtra ici, avec les données remplies automatiquement et les champs à saisir.
            </div>
          ) : (
            <>
              <Champ label="Nom du modèle">
                <input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} />
              </Champ>
              <p className="text-sm text-slate-600">{resultat.modele.description}</p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <ResumeAnalyse analyse={resultat.analyse} />
              </div>
              <ApercuBlocs modele={resultat.modele} />
              {resultat.modele.remarques.length > 0 && (
                <div className="rounded-2xl border border-bleu/30 bg-bleu-pale px-3 py-2 text-sm text-bleu-texte">
                  <p className="font-medium">À vérifier avant usage</p>
                  <ul className="mt-1 list-disc pl-5">
                    {resultat.modele.remarques.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button className="btn flex-1" onClick={() => telecharger(resultat.blob, nomFichier(nom || resultat.modele.nom))}>
                  <Download size={15} /> Télécharger (.docx)
                </button>
                <button className="btn-primaire flex-1" onClick={ajouter} disabled={!!etat || resultat.analyse.erreurs.length > 0}>
                  Ajouter à la bibliothèque
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Modèle conçu par une IA : relisez-le dans Word avant de l&apos;utiliser pour un document signé (formules, mentions, références).
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Aperçu textuel de la structure du modèle (le fichier Word fait foi). */
function ApercuBlocs({ modele }: { modele: ModeleIA }) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed">
      {modele.blocs.map((b, i) => {
        switch (b.type) {
          case "titre":
            return (
              <p key={i} className={`font-semibold ${b.niveau === 2 ? "mt-2" : "text-center text-base"}`}>
                {b.texte}
              </p>
            );
          case "paragraphe":
            return (
              <p key={i} className={`mb-1 whitespace-pre-line ${b.gras ? "font-semibold" : ""}`}>
                {b.texte}
              </p>
            );
          case "infos":
            return (
              <table key={i} className="my-1 w-full border-collapse text-xs">
                <tbody>
                  {b.lignes.map((l, j) => (
                    <tr key={j}>
                      <td className="w-2/5 border border-slate-200 px-2 py-0.5 font-medium">{l.libelle}</td>
                      <td className="border border-slate-200 px-2 py-0.5 text-bleu-texte">{l.valeur}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case "tableau":
            return (
              <table key={i} className="my-1 w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {b.colonnes.map((c, j) => (
                      <th key={j} className="border border-slate-200 bg-slate-50 px-2 py-0.5 text-left">
                        {c.entete}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {b.colonnes.map((c, j) => (
                      <td key={j} className="border border-slate-200 px-2 py-0.5 text-bleu-texte">
                        {`{${c.champ.replace(/[{}]/g, "")}}`}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            );
          case "liste":
            return (
              <ul key={i} className="mb-1 list-disc pl-5">
                {b.elements.map((e, j) => (
                  <li key={j}>{e}</li>
                ))}
              </ul>
            );
          case "signatures":
            return (
              <p key={i} className="mt-2 text-xs text-slate-500">
                Signatures : {b.cadres.join(" · ")}
              </p>
            );
          default:
            return <br key={i} />;
        }
      })}
    </div>
  );
}

"use client";
import { BookOpen, ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText, Library, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CLASSE_PAGE, EnTete } from "@/components/EnTete";
import { CreerAvecIA } from "@/components/modeles/CreerAvecIA";
import { AideChamps } from "@/components/modeles/AideChamps";
import { AjoutModeles } from "@/components/modeles/AjoutModeles";
import { ResumeAnalyse } from "@/components/modeles/ResumeAnalyse";
import { ZoneDepot } from "@/components/modeles/ZoneDepot";
import { Champ, Erreur, Modal, Vide } from "@/components/ui";
import {
  CATEGORIES_MODELE,
  chargerFichierModele,
  importerExemples,
  listerModeles,
  modifierModele,
  supprimerModele,
  type Modele,
} from "@/lib/modeles/bibliotheque";
import { telecharger } from "@/lib/modeles/moteur";

export default function PageModeles() {
  const [modeles, setModeles] = useState<Modele[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [depot, setDepot] = useState<File[] | null>(null);
  const [edite, setEdite] = useState<Modele | null>(null);
  const [aide, setAide] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [ia, setIa] = useState<{ categorie?: string; description?: string } | null>(null);

  const charger = useCallback(async () => {
    try {
      setModeles(await listerModeles());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial depuis Supabase
    charger();
  }, [charger]);

  const parCategorie = useMemo(() => {
    const m = new Map<string, Modele[]>();
    for (const x of modeles ?? []) m.set(x.categorie, [...(m.get(x.categorie) ?? []), x]);
    return [...m.entries()].sort(
      (a, b) => CATEGORIES_MODELE.indexOf(a[0] as never) - CATEGORIES_MODELE.indexOf(b[0] as never),
    );
  }, [modeles]);

  async function exemples() {
    setOccupe(true);
    setErreur(null);
    try {
      const n = await importerExemples(modeles ?? []);
      await charger();
      if (!n) setErreur("Les modèles d'exemple sont déjà dans votre bibliothèque.");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      <EnTete />
      <main className={`${CLASSE_PAGE} space-y-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm text-slate-500">Bibliothèque</p>
            <h1 className="text-3xl font-semibold sm:text-4xl">Modèles de documents</h1>
            <p className="mt-1 text-sm text-slate-600">
              Décomptes, bordereaux d&apos;envoi, notes de pénalités, courriers… Déposez vos modèles Word ou Excel : ils se remplissent avec les
              données de chaque marché depuis sa fiche (« Générer »).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primaire" onClick={() => setIa({})}>
              <Sparkles size={15} /> Créer avec l&apos;IA
            </button>
            <button className="btn" onClick={exemples} disabled={occupe || modeles === null}>
              <Library size={15} /> {occupe ? "Import…" : "Modèles d'exemple"}
            </button>
            <button className="btn" onClick={() => setAide(!aide)} aria-expanded={aide}>
              <BookOpen size={15} /> Données disponibles {aide ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        </div>

        <Erreur message={erreur} />
        {aide && (
          <section className="carte p-4 sm:p-6">
            <AideChamps />
          </section>
        )}

        <ZoneDepot onFichiers={setDepot} />

        {modeles === null && !erreur && <p className="py-6 text-center text-sm text-slate-500">Chargement…</p>}
        {modeles?.length === 0 && (
          <Vide>
            Aucun modèle. Déposez vos fichiers ci-dessus, ajoutez les modèles d&apos;exemple, ou créez-en un avec l&apos;IA.
          </Vide>
        )}

        {parCategorie.map(([categorie, liste]) => (
          <section key={categorie}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {categorie} ({liste.length})
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {liste.map((m) => (
                <CarteModele
                  key={m.id}
                  modele={m}
                  onModifier={() => setEdite(m)}
                  onChange={charger}
                  onErreur={setErreur}
                  onPrompt={() =>
                    setIa({
                      categorie: m.categorie,
                      description: `Modèle de même nature que « ${m.nom} »${m.description ? ` (${m.description})` : ""}, à adapter : `,
                    })
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {depot && <AjoutModeles fichiers={depot} onFermer={() => setDepot(null)} onAjoute={charger} />}
      {edite && <EditionModele modele={edite} onFermer={() => setEdite(null)} onEnregistre={charger} />}
      {ia && <CreerAvecIA initial={ia} onFermer={() => setIa(null)} onAjoute={charger} />}
    </>
  );
}

function CarteModele({
  modele: m,
  onModifier,
  onChange,
  onErreur,
  onPrompt,
}: {
  modele: Modele;
  onModifier: () => void;
  onChange: () => void;
  onErreur: (e: string) => void;
  onPrompt: () => void;
}) {
  const [details, setDetails] = useState(false);
  const Icone = m.format === "xlsx" ? FileSpreadsheet : FileText;
  return (
    <div className="carte flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${m.format === "xlsx" ? "bg-bleu-pale text-bleu-texte" : "bg-encre text-white"}`}>
          <Icone size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{m.nom}</p>
          {m.description && <p className="text-sm text-slate-600">{m.description}</p>}
          <p className="mt-1 text-xs text-slate-500">
            {m.format.toUpperCase()} · {m.champs.connus?.length ?? 0} donnée(s) · {m.champs.libres?.length ?? 0} à saisir ·{" "}
            {new Date(m.updated_at).toLocaleDateString("fr-FR")}
          </p>
        </div>
      </div>
      {details && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <ResumeAnalyse analyse={{ connus: m.champs.connus ?? [], libres: m.champs.libres ?? [], avertissements: m.champs.avertissements ?? [] }} />
        </div>
      )}
      <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2">
        <button className="text-xs text-marque-700 hover:underline" onClick={() => setDetails(!details)}>
          {details ? "Masquer les champs" : "Voir les champs"}
        </button>
        <span className="flex-1" />
        <button className="btn-icone" title="Créer une variante avec l'IA (prompt)" aria-label="Créer une variante avec l'IA" onClick={onPrompt}>
          <Sparkles size={15} />
        </button>
        <button
          className="btn-icone"
          title="Télécharger le modèle (pour le modifier dans Word / Excel)"
          aria-label="Télécharger le modèle"
          onClick={async () => {
            try {
              const buf = await chargerFichierModele(m.chemin);
              telecharger(new Blob([buf]), m.nom_fichier || `${m.nom}.${m.format}`);
            } catch (e) {
              onErreur(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          <Download size={15} />
        </button>
        <button className="btn-icone" aria-label="Modifier" title="Renommer, changer de catégorie" onClick={onModifier}>
          <Pencil size={15} />
        </button>
        <button
          className="btn-icone hover:text-rouge-fonce"
          aria-label="Supprimer"
          onClick={async () => {
            if (!confirm(`Supprimer le modèle « ${m.nom} » ?`)) return;
            try {
              await supprimerModele(m);
              onChange();
            } catch (e) {
              onErreur(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function EditionModele({ modele, onFermer, onEnregistre }: { modele: Modele; onFermer: () => void; onEnregistre: () => void }) {
  const [nom, setNom] = useState(modele.nom);
  const [categorie, setCategorie] = useState(modele.categorie);
  const [description, setDescription] = useState(modele.description);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <Modal titre="Modifier le modèle" ouvert onFermer={onFermer}>
      <Erreur message={erreur} />
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await modifierModele(modele.id, { nom: nom.trim() || modele.nom, categorie, description: description.trim() });
            onEnregistre();
            onFermer();
          } catch (err) {
            setErreur(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <Champ label="Nom" className="sm:col-span-2">
          <input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} />
        </Champ>
        <Champ label="Catégorie">
          <select className="champ" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            {CATEGORIES_MODELE.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Champ>
        <Champ label="Description" className="sm:col-span-2">
          <textarea className="champ" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Champ>
        <p className="sm:col-span-2 text-xs text-slate-500">
          Pour changer le contenu : téléchargez le modèle, modifiez-le dans Word ou Excel, puis déposez la nouvelle version.
        </p>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onFermer}>
            Annuler
          </button>
          <button className="btn-primaire">Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}

"use client";
import { CalendarClock, FileText, Plus, Search, Wallet, Ruler } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EnTete } from "@/components/EnTete";
import { FormulaireMarche } from "@/components/FormulaireMarche";
import { BadgeStatut, Barre, Chiffre, Erreur, Vide } from "@/components/ui";
import { formatDate, formatMontant, formatPct } from "@/lib/calculs";
import { chargerPortefeuille } from "@/lib/donnees";
import { syntheseMarche } from "@/lib/synthese";
import { STATUTS_MARCHE, type Marche } from "@/lib/types";

type Portefeuille = Awaited<ReturnType<typeof chargerPortefeuille>>;

export default function Accueil() {
  const router = useRouter();
  const [donnees, setDonnees] = useState<Portefeuille | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<string>("");
  const [creation, setCreation] = useState(false);

  const charger = useCallback(async () => {
    try {
      setDonnees(await chargerPortefeuille());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial depuis Supabase
    charger();
  }, [charger]);

  const cartes = useMemo(() => {
    if (!donnees) return [];
    const par = <T extends { marche_id: string }>(l: T[], id: string) => l.filter((x) => x.marche_id === id);
    return donnees.marches.map((m) => ({
      marche: m,
      s: syntheseMarche(
        m,
        par(donnees.ordres, m.id),
        par(donnees.bpde, m.id),
        par(donnees.attachements, m.id),
        par(donnees.decomptes, m.id),
        par(donnees.documents, m.id),
        par(donnees.garanties, m.id),
      ),
    }));
  }, [donnees]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return cartes.filter(
      ({ marche: m }) =>
        (!filtre || m.statut === filtre) &&
        (!q || [m.numero, m.objet, m.entreprise].some((x) => x.toLowerCase().includes(q))),
    );
  }, [cartes, recherche, filtre]);

  const resume = useMemo(() => {
    const ouverts = cartes.filter((c) => c.s.enCours);
    return {
      ouverts: ouverts.length,
      retard: cartes.filter((c) => c.s.enRetard).length,
      total: cartes.reduce((s, c) => s + Number(c.marche.montant_ttc), 0),
      physique: ouverts.length ? ouverts.reduce((s, c) => s + c.s.physique.avancement, 0) / ouverts.length : 0,
    };
  }, [cartes]);

  return (
    <>
      <EnTete />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Erreur message={erreur} />
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Chiffre label="Marchés ouverts" valeur={resume.ouverts} sous={`${cartes.length} au total`} />
          <Chiffre label="En retard" valeur={resume.retard} alerte={resume.retard > 0} />
          <Chiffre label="Montant total TTC" valeur={formatMontant(resume.total)} />
          <Chiffre label="Avancement physique moyen" valeur={formatPct(resume.physique)} sous="marchés ouverts" />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
            <input
              className="champ pl-9"
              placeholder="Rechercher par n°, objet ou entreprise"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <select className="champ w-auto" value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Filtrer par statut">
            <option value="">Tous les statuts</option>
            {STATUTS_MARCHE.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className="btn-primaire" onClick={() => setCreation(true)}>
            <Plus size={16} /> Nouveau marché
          </button>
        </div>

        {!donnees && !erreur && <div className="py-10 text-center text-sm text-slate-500">Chargement…</div>}
        {donnees && filtrees.length === 0 && (
          <Vide>{cartes.length ? "Aucun marché ne correspond à la recherche." : "Aucun marché. Créez le premier avec « Nouveau marché »."}</Vide>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtrees.map(({ marche: m, s }) => (
            <CarteMarche key={m.id} marche={m} s={s} />
          ))}
        </div>
      </main>
      {creation && (
        <FormulaireMarche ouvert onFermer={() => setCreation(false)} onEnregistre={(id) => router.push(`/marches/${id}`)} />
      )}
    </>
  );
}

function CarteMarche({ marche: m, s }: { marche: Marche; s: ReturnType<typeof syntheseMarche> }) {
  const j = s.delais.joursRestants;
  const lien = (onglet: string) => `/marches/${m.id}?onglet=${onglet}`;
  return (
    <div className="carte flex flex-col p-4">
      <Link href={`/marches/${m.id}`} className="group block flex-1">
        <div className="mb-1 flex items-start justify-between gap-2">
          <span className="font-semibold text-slate-900 group-hover:text-marque-700">{m.numero}</span>
          <BadgeStatut statut={m.statut} />
        </div>
        <p className="line-clamp-2 text-sm text-slate-700">{m.objet || "—"}</p>
        <p className="mt-1 text-xs text-slate-500">{m.entreprise || "Entreprise non renseignée"}</p>
        <div className="mt-3 flex items-baseline justify-between text-sm">
          <span className="font-medium tabular-nums">{formatMontant(Number(m.montant_ttc))} TTC</span>
          <span className="text-xs text-slate-500">
            Fin {formatDate(s.delais.finPrevue)}{" "}
            {j !== null && s.enCours && (
              <span className={j < 0 ? "font-semibold text-red-600" : "text-slate-700"}>
                ({j < 0 ? `${-j} j de retard` : `${j} j restants`})
              </span>
            )}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          <Barre label="Délai écoulé" valeur={s.delais.tempsEcoule} couleur={s.enRetard ? "bg-red-500" : "bg-slate-500"} />
          <Barre label="Avancement physique" valeur={s.physique.avancement} />
          <Barre label="Avancement financier" valeur={s.finances.part} couleur="bg-emerald-500" />
        </div>
      </Link>
      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
        <Link className="btn px-2 py-1 text-xs" href={lien("delais")}>
          <CalendarClock size={13} /> Délais
        </Link>
        <Link className="btn px-2 py-1 text-xs" href={lien("documents")}>
          <FileText size={13} /> Documents
        </Link>
        <Link className="btn px-2 py-1 text-xs" href={lien("physique")}>
          <Ruler size={13} /> Physique
        </Link>
        <Link className="btn px-2 py-1 text-xs" href={lien("financier")}>
          <Wallet size={13} /> Financier
        </Link>
        {s.vigilance.length > 0 && (
          <span className="ml-auto self-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {s.vigilance.length} point(s) à surveiller
          </span>
        )}
      </div>
    </div>
  );
}

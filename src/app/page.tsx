"use client";
import { CalendarClock, FileText, Plus, Search, Wallet, Ruler } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CLASSE_PAGE, EnTete } from "@/components/EnTete";
import { FormulaireMarche } from "@/components/FormulaireMarche";
import { Anneau, BadgeStatut, Barre, Chiffre, Erreur, Vide } from "@/components/ui";
import { formatDate, formatMontant, montantMarche } from "@/lib/calculs";
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
        par(donnees.reserves, m.id),
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
      total: cartes.reduce((s, c) => s + montantMarche(c.marche), 0),
      physique: ouverts.length ? ouverts.reduce((s, c) => s + c.s.physique.avancement, 0) / ouverts.length : 0,
    };
  }, [cartes]);

  return (
    <>
      <EnTete />
      <main className={CLASSE_PAGE}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Portefeuille</p>
            <h1 className="text-3xl font-semibold sm:text-4xl">Marchés</h1>
          </div>
          <button className="btn-primaire" onClick={() => setCreation(true)}>
            <Plus size={16} /> Nouveau marché
          </button>
        </div>
        <Erreur message={erreur} />

        <section className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Chiffre label="Marchés ouverts" valeur={resume.ouverts} sous={`${cartes.length} au total`} />
            <Chiffre label="En retard" valeur={resume.retard} alerte={resume.retard > 0} sous={resume.retard ? "délai dépassé" : "aucun"} />
            <div className="col-span-2 grid md:col-span-1">
              <Chiffre label="Montant total TTC" valeur={formatMontant(resume.total)} sous="avec avenants" />
            </div>
          </div>
          <div className="carte flex items-center px-5 py-3">
            <Anneau label="Avancement physique moyen" valeur={resume.physique} sous="marchés ouverts, pondéré BPDE" taille={72} horizontal />
          </div>
        </section>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-2.5 text-slate-400" />
            <input
              className="champ rounded-full pl-10"
              placeholder="Rechercher par n°, objet ou entreprise"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher un marché"
            />
          </div>
          <div className="defilement -mx-3 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:px-0" role="group" aria-label="Filtrer par statut">
            {["", ...STATUTS_MARCHE].map((st) => (
              <button
                key={st || "tous"}
                onClick={() => setFiltre(st)}
                aria-pressed={filtre === st}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  filtre === st ? "bg-encre text-white" : "bg-white/70 text-slate-600 hover:bg-white"
                }`}
              >
                {st || "Tous"}
              </button>
            ))}
          </div>
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
  const raccourcis = [
    { o: "delais", label: "Délais", icone: CalendarClock },
    { o: "documents", label: "Documents", icone: FileText },
    { o: "physique", label: "Physique", icone: Ruler },
    { o: "financier", label: "Financier", icone: Wallet },
  ];
  return (
    <article className="carte flex flex-col p-5">
      <Link href={`/marches/${m.id}`} className="group block flex-1">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="text-lg font-semibold tracking-tight group-hover:underline">{m.numero}</span>
          <BadgeStatut statut={m.statut} />
        </div>
        <p className="line-clamp-2 text-[15px] leading-snug">{m.objet || "—"}</p>
        <p className="mt-1 text-xs text-slate-500">{m.entreprise || "Entreprise non renseignée"}</p>
        <div className="mt-4 flex items-end justify-between gap-2">
          <div>
            <p className="text-xs text-slate-500">Montant TTC</p>
            <p className="font-semibold tabular-nums">{formatMontant(montantMarche(m))}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Fin prévue {formatDate(s.delais.finPrevue)}</p>
            {j !== null && s.enCours ? (
              <span className={`pastille mt-0.5 ${j < 0 ? "bg-rouge text-white" : "bg-bleu-pale text-bleu-texte"}`}>
                {j < 0 ? `${-j} j de retard` : `${j} j restants`}
              </span>
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-2.5">
          <Barre label="Délai écoulé" valeur={s.delais.tempsEcoule} couleur={s.enRetard ? "bg-rouge" : "bg-slate-400"} />
          <Barre label="Avancement physique" valeur={s.physique.avancement} />
          <Barre label="Avancement financier" valeur={s.finances.part} couleur="bg-encre" />
        </div>
      </Link>
      <div className="mt-4 flex items-center gap-1.5 border-t border-slate-200/60 pt-3">
        {raccourcis.map((r) => (
          <Link key={r.o} className="btn-rond h-9 w-9" href={lien(r.o)} title={r.label} aria-label={r.label}>
            <r.icone size={15} />
          </Link>
        ))}
        {s.vigilance.length > 0 && (
          <Link href={lien("apercu")} className="pastille ml-auto bg-rouge-pale text-rouge-fonce">
            {s.vigilance.length} à surveiller
          </Link>
        )}
      </div>
    </article>
  );
}

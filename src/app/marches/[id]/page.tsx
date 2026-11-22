"use client";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CLASSE_PAGE, EnTete } from "@/components/EnTete";
import { FormulaireMarche } from "@/components/FormulaireMarche";
import { MenuExport } from "@/components/MenuExport";
import { GenererDocument } from "@/components/modeles/GenererDocument";
import { ParametresCpsBouton } from "@/components/ParametresCps";
import { OngletApercu } from "@/components/onglets/Apercu";
import { OngletAttachements } from "@/components/onglets/Attachements";
import { OngletBpde } from "@/components/onglets/Bpde";
import { OngletDecompte } from "@/components/onglets/Decompte";
import { OngletDelais } from "@/components/onglets/Delais";
import { OngletDocuments } from "@/components/onglets/Documents";
import { OngletFinancier } from "@/components/onglets/Financier";
import { OngletGaranties } from "@/components/onglets/Garanties";
import { OngletAvenants } from "@/components/onglets/Avenants";
import { OngletReception } from "@/components/onglets/Reception";
import { OngletIntervenants } from "@/components/onglets/Intervenants";
import { OngletPhysique } from "@/components/onglets/Physique";
import { OngletPv } from "@/components/onglets/Pv";
import { BadgeStatut, Erreur } from "@/components/ui";
import { formatMontant, montantMarche } from "@/lib/calculs";
import { chargerDossier, supprimer } from "@/lib/donnees";
import type { PropsOnglet } from "@/components/onglets/types";
import type { DossierMarche } from "@/lib/types";

const ONGLETS = [
  { id: "apercu", label: "Aperçu" },
  { id: "intervenants", label: "Intervenants" },
  { id: "delais", label: "Délais et OS" },
  { id: "pv", label: "PV de réunion" },
  { id: "attachements", label: "Attachements" },
  { id: "documents", label: "Documents à fournir" },
  { id: "financier", label: "Financier" },
  { id: "garanties", label: "Garanties" },
  { id: "avenants", label: "Avenants" },
  { id: "reception", label: "Réception" },
  { id: "physique", label: "État physique" },
  { id: "decompte", label: "Décompte" },
  { id: "bpde", label: "BPDE et prix" },
] as const;

export default function PageMarche() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-slate-500">Chargement…</div>}>
      <FicheMarche />
    </Suspense>
  );
}

function FicheMarche() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const onglet = params.get("onglet") ?? "apercu";
  const [dossier, setDossier] = useState<DossierMarche | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);

  const recharger = useCallback(async () => {
    try {
      setDossier(await chargerDossier(id));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial depuis Supabase
    recharger();
  }, [recharger]);

  const allerA = useCallback((o: string) => router.replace(`/marches/${id}?onglet=${o}`, { scroll: false }), [id, router]);

  async function supprimerMarche() {
    if (!dossier) return;
    if (!confirm(`Supprimer définitivement le marché ${dossier.marche.numero} et toutes ses données ?`)) return;
    try {
      await supprimer("marches", dossier.marche.id);
      router.replace("/");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  const props: PropsOnglet | null = dossier ? { dossier, recharger, allerA } : null;

  return (
    <>
      <EnTete />
      <main className={CLASSE_PAGE}>
        <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-encre">
          <span className="btn-rond h-8 w-8">
            <ArrowLeft size={15} />
          </span>
          Tous les marchés
        </Link>
        <Erreur message={erreur} />
        {dossier === undefined && !erreur && <div className="py-10 text-center text-sm text-slate-500">Chargement…</div>}
        {dossier === null && <div className="py-10 text-center text-sm text-slate-500">Marché introuvable.</div>}
        {dossier && props && (
          <>
            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold sm:text-4xl">Marché {dossier.marche.numero}</h1>
                  <BadgeStatut statut={dossier.marche.statut} />
                </div>
                <p className="mt-1 text-[15px] text-slate-700">{dossier.marche.objet}</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {dossier.marche.entreprise || "Entreprise non renseignée"} · {formatMontant(montantMarche(dossier.marche))} TTC
                  {dossier.marche.montant_avenants ? " (avec avenants)" : ""} · {Number(dossier.marche.duree_mois)} mois
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <GenererDocument dossier={dossier} />
                <ParametresCpsBouton marche={dossier.marche} recharger={recharger} />
                <MenuExport dossier={dossier} />
                <button className="btn-rond" onClick={() => setEdition(true)} title="Modifier le marché" aria-label="Modifier le marché">
                  <Pencil size={16} />
                </button>
                <button
                  className="btn-rond text-rouge-fonce hover:bg-rouge-pale"
                  onClick={supprimerMarche}
                  title="Supprimer le marché"
                  aria-label="Supprimer le marché"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <BarreOnglets onglet={onglet} allerA={allerA} />

            {onglet === "apercu" && <OngletApercu {...props} />}
            {onglet === "intervenants" && <OngletIntervenants {...props} />}
            {onglet === "delais" && <OngletDelais {...props} />}
            {onglet === "pv" && <OngletPv {...props} />}
            {onglet === "attachements" && <OngletAttachements {...props} />}
            {onglet === "documents" && <OngletDocuments {...props} />}
            {onglet === "financier" && <OngletFinancier {...props} />}
            {onglet === "garanties" && <OngletGaranties {...props} />}
            {onglet === "avenants" && <OngletAvenants {...props} />}
            {onglet === "reception" && <OngletReception {...props} />}
            {onglet === "physique" && <OngletPhysique {...props} />}
            {onglet === "decompte" && <OngletDecompte {...props} />}
            {onglet === "bpde" && <OngletBpde {...props} />}

            {edition && (
              <FormulaireMarche
                ouvert
                marche={dossier.marche}
                onFermer={() => setEdition(false)}
                onEnregistre={() => recharger()}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}

/** Onglets en pilules, collants sous l'en-tête ; défilement horizontal sur mobile, l'onglet actif reste visible. */
function BarreOnglets({ onglet, allerA }: { onglet: string; allerA: (o: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const actif = ref.current?.querySelector<HTMLElement>("[aria-current='page']");
    actif?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [onglet]);
  return (
    <div className="sticky top-[76px] z-30 -mx-3 mb-5 px-3 sm:mx-0 sm:px-0">
      <nav
        ref={ref}
        className="carte defilement flex gap-1 overflow-x-auto rounded-full p-1.5"
        aria-label="Onglets du marché"
      >
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            onClick={() => allerA(o.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
              onglet === o.id ? "bg-encre text-white shadow" : "text-slate-600 hover:bg-white hover:text-encre"
            }`}
            aria-current={onglet === o.id ? "page" : undefined}
          >
            {o.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

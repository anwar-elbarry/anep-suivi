"use client";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { EnTete } from "@/components/EnTete";
import { FormulaireMarche } from "@/components/FormulaireMarche";
import { MenuExport } from "@/components/MenuExport";
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
      <main className="mx-auto max-w-7xl px-4 py-5">
        <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Tous les marchés
        </Link>
        <Erreur message={erreur} />
        {dossier === undefined && !erreur && <div className="py-10 text-center text-sm text-slate-500">Chargement…</div>}
        {dossier === null && <div className="py-10 text-center text-sm text-slate-500">Marché introuvable.</div>}
        {dossier && props && (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold">Marché {dossier.marche.numero}</h1>
                  <BadgeStatut statut={dossier.marche.statut} />
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{dossier.marche.objet}</p>
                <p className="text-xs text-slate-500">
                  {dossier.marche.entreprise || "Entreprise non renseignée"} · {formatMontant(montantMarche(dossier.marche))} TTC
                  {dossier.marche.montant_avenants ? " (avec avenants)" : ""} ·{" "}
                  {Number(dossier.marche.duree_mois)} mois
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ParametresCpsBouton marche={dossier.marche} recharger={recharger} />
                <MenuExport dossier={dossier} />
                <button className="btn" onClick={() => setEdition(true)}>
                  <Pencil size={14} /> Modifier
                </button>
                <button className="btn-danger" onClick={supprimerMarche}>
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
            </div>

            <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Onglets du marché">
              {ONGLETS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => allerA(o.id)}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                    onglet === o.id ? "border-marque-600 text-marque-700" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                  aria-current={onglet === o.id ? "page" : undefined}
                >
                  {o.label}
                </button>
              ))}
            </nav>

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

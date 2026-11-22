import type { DossierMarche } from "@/lib/types";

export interface PropsOnglet {
  dossier: DossierMarche;
  recharger: () => Promise<void>;
  allerA: (onglet: string) => void;
}

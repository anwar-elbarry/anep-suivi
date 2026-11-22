import {
  aujourdhuiUtc,
  calculerDelais,
  etatPhysique,
  pointsDeVigilance,
  rapprocher,
  situationFinanciere,
} from "./calculs";
import type { Attachement, BpdeLigne, Decompte, DocumentAFournir, Marche, OrdreService } from "./types";

/** Indicateurs d'un marché, partagés par la page d'accueil et l'aperçu. */
export function syntheseMarche(
  marche: Marche,
  ordres: OrdreService[],
  bpde: BpdeLigne[],
  attachements: Attachement[],
  decomptes: Decompte[],
  documents: DocumentAFournir[],
  aujourdhui = aujourdhuiUtc(),
) {
  const delais = calculerDelais(marche, ordres, aujourdhui);
  const rapprochement = rapprocher(attachements, bpde, marche.attachements_cumulatifs);
  const physique = etatPhysique(bpde, rapprochement.quantites);
  const finances = situationFinanciere(marche, decomptes);
  const vigilance = pointsDeVigilance(delais, documents, attachements, aujourdhui, marche.statut);
  const enCours = !["Réception provisoire", "Réception définitive", "Résilié"].includes(marche.statut);
  const enRetard = enCours && delais.joursRestants !== null && delais.joursRestants < 0;
  return { delais, rapprochement, physique, finances, vigilance, enRetard, enCours, aujourdhui };
}

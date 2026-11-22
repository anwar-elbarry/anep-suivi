import {
  aujourdhuiUtc,
  calculerDelais,
  calculerPenalites,
  etatPhysique,
  pointsDeVigilance,
  projetDecompte,
  rapprocher,
  situationFinanciere,
} from "./calculs";
import type { Attachement, BpdeLigne, Decompte, DocumentAFournir, Garantie, Marche, OrdreService } from "./types";

/** Indicateurs d'un marché, partagés par la page d'accueil et l'aperçu. */
export function syntheseMarche(
  marche: Marche,
  ordres: OrdreService[],
  bpde: BpdeLigne[],
  attachements: Attachement[],
  decomptes: Decompte[],
  documents: DocumentAFournir[],
  garanties: Garantie[] = [],
  aujourdhui = aujourdhuiUtc(),
) {
  const delais = calculerDelais(marche, ordres, aujourdhui);
  const penalites = calculerPenalites(marche, delais, aujourdhui);
  const rapprochement = rapprocher(attachements, bpde, marche.attachements_cumulatifs);
  const physique = etatPhysique(bpde, rapprochement.quantites);
  const finances = situationFinanciere(marche, decomptes);
  const vigilance = pointsDeVigilance(delais, documents, attachements, aujourdhui, marche.statut, {
    garanties,
    penalites,
    marche,
  });
  const enCours = !["Réception provisoire", "Réception définitive", "Résilié"].includes(marche.statut);
  const enRetard = enCours && delais.joursRestants !== null && delais.joursRestants < 0;
  return { delais, penalites, rapprochement, physique, finances, vigilance, enRetard, enCours, aujourdhui };
}

/** Projet de décompte avec les paramètres enregistrés sur le marché (export, impression). */
export function projetCourant(d: import("./types").DossierMarche, appliquerPenalites = true) {
  const s = syntheseMarche(d.marche, d.ordres, d.bpde, d.attachements, d.decomptes, d.documents, d.garanties);
  const projet = projetDecompte(d.marche, s.physique, d.decomptes, s.penalites, appliquerPenalites);
  return { ...s, projet };
}

import { describe, expect, it } from "vitest";
import {
  ajouterMois,
  calculerDelais,
  coefficientK,
  etatPhysique,
  projetDecompte,
  rapprocher,
  retenueGarantie,
  situationFinanciere,
  verifierBpde,
  versDate,
  versIso,
} from "./calculs";
import type { Attachement, BpdeLigne, Decompte, Marche, OrdreService } from "./types";

const marche: Marche = {
  id: "m",
  user_id: "u",
  numero: "01/2026",
  objet: "Lycée",
  entreprise: "SOTRAVO",
  montant_ttc: 1_200_000,
  date_debut: null,
  duree_mois: 6,
  statut: "En cours",
  taux_tva: 20,
  taux_retenue: 10,
  plafond_retenue: 7,
  indices_revision: [],
  attachements_cumulatifs: false,
  created_at: "",
  updated_at: "",
};

const os = (type: OrdreService["type"], date: string, jours = 0): OrdreService => ({
  id: type + date,
  marche_id: "m",
  type,
  numero: "",
  date_emission: date,
  date_notification: null,
  jours_supplementaires: jours,
  objet: "",
});

const bpde: BpdeLigne[] = [
  { id: "b1", marche_id: "m", ordre: 1, numero: "1", designation: "Béton armé pour semelles", unite: "m3", quantite: 100, prix_unitaire: 1500, montant_importe: null },
  { id: "b2", marche_id: "m", ordre: 2, numero: "2", designation: "Étanchéité multicouche", unite: "m2", quantite: 500, prix_unitaire: 1700, montant_importe: null },
];

describe("délais", () => {
  it("ajoute des mois en restant sur le dernier jour du mois", () => {
    expect(versIso(ajouterMois(versDate("2026-01-31")!, 1))).toBe("2026-02-28");
  });

  it("calcule la fin avec arrêts, prolongation et arrêt en cours", () => {
    const ordres = [
      os("demarrage", "2026-01-01"),
      os("arret", "2026-02-01"),
      os("reprise", "2026-02-11"),
      os("prolongation", "2026-03-01", 15),
      os("arret", "2026-05-01"),
    ];
    const d = calculerDelais(marche, ordres, versDate("2026-05-06")!);
    expect(versIso(d.finContractuelle!)).toBe("2026-07-01");
    expect(d.joursArret).toBe(10 + 5);
    expect(d.arretEnCours).toBe(true);
    expect(versIso(d.finPrevue!)).toBe("2026-07-31"); // +15 arrêt +15 prolongation
    expect(d.joursRestants).toBe(86);
  });

  it("utilise la date de début du marché à défaut d'OS", () => {
    const d = calculerDelais({ ...marche, date_debut: "2026-01-01" }, [], versDate("2026-08-01")!);
    expect(d.sourceDemarrage).toBe("marche");
    expect(d.joursRestants).toBe(-31);
    expect(d.tempsEcoule).toBe(1);
  });
});

describe("BPDE et état physique", () => {
  it("signale prix manquant, doublon et montant incohérent", () => {
    const lignes: BpdeLigne[] = [
      ...bpde,
      { ...bpde[0], id: "b3", numero: "01", prix_unitaire: null, montant_importe: 10 },
    ];
    const msgs = verifierBpde(lignes, marche).map((a) => a.message);
    expect(msgs.some((m) => m.includes("Prix unitaire manquant"))).toBe(true);
    expect(msgs.some((m) => m.includes("en double"))).toBe(true);
  });

  it("rapproche par n° puis par libellé, pondère par la valeur", () => {
    const atts: Attachement[] = [
      {
        id: "a1", marche_id: "m", numero: "1", periode: "", date: "2026-02-01", montant: null, statut: "Validé", observations: "",
        attachement_lignes: [
          { id: "l1", attachement_id: "a1", ordre: 1, numero: "", designation: "BETON ARME pour semelles", unite: "m3", quantite: 50 },
          { id: "l2", attachement_id: "a1", ordre: 2, numero: "2", designation: "autre libellé", unite: "m2", quantite: 600 },
          { id: "l3", attachement_id: "a1", ordre: 3, numero: "", designation: "Inconnu", unite: "u", quantite: 3 },
        ],
      },
    ];
    const r = rapprocher(atts, bpde, false);
    expect(r.quantites.get("b1")).toBe(50);
    expect(r.quantites.get("b2")).toBe(600);
    expect(r.nonRapprochees).toHaveLength(1);
    const p = etatPhysique(bpde, r.quantites);
    // b1 : 150 000 × 50 % ; b2 : 850 000 × 100 % (plafonné)
    expect(p.avancement).toBeCloseTo((75_000 + 850_000) / 1_000_000, 6);
    expect(p.lignes[1].depassement).toBe(true);
  });
});

describe("finances", () => {
  it("plafonne la retenue de garantie", () => {
    expect(retenueGarantie(500_000, marche)).toBe(50_000);
    expect(retenueGarantie(1_000_000, marche)).toBe(84_000); // 7 % de 1 200 000
  });

  it("calcule K avec partie fixe", () => {
    const k = coefficientK([
      { nom: "A", part: 0.5, base: 100, actuel: 110 },
      { nom: "B", part: 0.35, base: 200, actuel: 200 },
    ]);
    expect(k.partieFixe).toBeCloseTo(0.15, 9);
    expect(k.k).toBeCloseTo(1.05, 9);
  });

  it("projette un décompte en déduisant les précédents", () => {
    const m = { ...marche, indices_revision: [{ nom: "A", part: 0.85, base: 100, actuel: 110 }] };
    const physique = etatPhysique(bpde, new Map([["b1", 100]])); // 150 000 HT
    const precedents: Decompte[] = [
      { id: "d1", marche_id: "m", numero: "1", date: null, montant_travaux: 120_000, montant_revision: 0, coefficient_k: null, observations: "" },
    ];
    const p = projetDecompte(m, physique, precedents);
    expect(p.cumulExecuteTTC).toBe(180_000);
    expect(p.travauxPeriodeTTC).toBe(60_000);
    expect(p.travauxPeriodeHT).toBe(50_000);
    expect(p.revisionPeriodeHT).toBe(4_250); // 50 000 × 0,085
    expect(p.revisionPeriodeTTC).toBe(5_100);
    expect(p.retenuePeriode).toBe(6_510); // 10 % × 65 100
    expect(p.netAPayer).toBe(58_590);
    const s = situationFinanciere(m, precedents);
    expect(s.part).toBeCloseTo(0.1, 9);
  });
});

import { readFileSync } from "node:fs";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import type { DossierMarche } from "../types";
import { construireDonnees } from "./catalogue";
import { analyserModele, genererDocument } from "./moteur";

const lire = (nom: string) => {
  const b = readFileSync(`public/modeles-exemples/${nom}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const texteDocx = async (blob: Blob) =>
  new PizZip(await blob.arrayBuffer()).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");

const dossier: DossierMarche = {
  marche: {
    id: "m", user_id: "u", numero: "01/2026", objet: "Lycée qualifiant", entreprise: "SOTRAVO SARL", montant_ttc: 538_800,
    date_debut: null, duree_mois: 6, statut: "En cours", taux_tva: 20, taux_retenue: 10, plafond_retenue: 7, indices_revision: [],
    attachements_cumulatifs: false, penalite_taux_millieme: 1, penalite_plafond: 10, penalite_jours_exoneres: 0,
    date_reception_provisoire: "2026-07-11", avance_montant: 0, avance_date: null, avance_debut_remboursement: 0,
    avance_fin_remboursement: 100, retenue_remplacee_par_caution: false, penalite_base: "initial_ttc", seuil_avenants: null,
    delai_garantie_mois: 12, date_reception_definitive: null, created_at: "", updated_at: "", montant_avenants: 0, jours_avenants: 0,
  },
  intervenants: [{ id: "i", marche_id: "m", role: "Maître d'ouvrage", nom: "M. X", organisme: "Agence", telephone: "", email: "" }],
  ordres: [{ id: "o", marche_id: "m", type: "demarrage", numero: "OS1", date_emission: "2026-01-01", date_notification: null, jours_supplementaires: 0, objet: "" }],
  pvs: [],
  bpde: [
    { id: "b1", marche_id: "m", ordre: 1, numero: "1", designation: "Béton armé", unite: "m3", quantite: 100, prix_unitaire: 1500, montant_importe: null, avenant_id: null },
    { id: "b2", marche_id: "m", ordre: 2, numero: "2", designation: "Enduit & peinture <ext>", unite: "m2", quantite: 100, prix_unitaire: 50, montant_importe: null, avenant_id: null },
  ],
  attachements: [
    {
      id: "a", marche_id: "m", numero: "1", periode: "", date: "2026-02-01", montant: null, statut: "Validé", observations: "",
      attachement_lignes: [
        { id: "l1", attachement_id: "a", ordre: 1, numero: "1", designation: "Béton armé", unite: "m3", quantite: 100 },
        { id: "l2", attachement_id: "a", ordre: 2, numero: "2", designation: "", unite: "m2", quantite: 10 },
      ],
    },
  ],
  documents: [], decomptes: [], garanties: [], avenants: [], reserves: [], activites: [],
};

describe("moteur de modèles", () => {
  it("analyse le modèle de décompte : champs connus, aucune erreur", () => {
    const a = analyserModele(lire("decompte.docx"), "docx");
    expect(a.erreurs).toEqual([]);
    expect(a.connus).toContain("lignes_decompte");
    expect(a.connus).toContain("decompte_net_a_payer_lettres");
    expect(a.libres.sort()).toEqual(["organisme", "service"]);
  });

  it("remplit le décompte : boucle, montants, lettres, caractères spéciaux", async () => {
    const donnees = { ...construireDonnees({ dossier, decompteId: null }), organisme: "AGENCE", service: "Direction régionale" };
    const t = await texteDocx(genererDocument(lire("decompte.docx"), "docx", donnees));
    expect(t).toContain("DÉCOMPTE N° 1 (PROJET)");
    expect(t).toContain("Béton armé");
    expect(t).toContain("Enduit &amp; peinture &lt;ext&gt;"); // échappé en XML
    expect(t).toMatch(/180\s600,00/); // 100 m3 × 1 500 + 10 m2 × 50 = 150 500 HT, soit 180 600 TTC
    expect(t).toMatch(/NET À PAYER TTC157\s152,00/); // − retenue 18 060 − pénalités 10 j × 538,80
    expect(t).toContain("dirhams");
    expect(t).not.toContain("{");
  });

  it("repère les champs libres du bordereau d'envoi et de la note de pénalités", () => {
    expect(analyserModele(lire("bordereau-envoi.docx"), "docx").libres).toEqual(
      expect.arrayContaining(["destinataire", "objet_envoi", "pieces", "signataire"]),
    );
    const p = analyserModele(lire("note-calcul-penalites.docx"), "docx");
    expect(p.erreurs).toEqual([]);
    expect(p.libres).toEqual(expect.arrayContaining(["article_cps_penalites", "motifs_exoneration"]));
  });

  it("calcule la note de pénalités (191 j de retard plafonnés)", async () => {
    const t = await texteDocx(genererDocument(lire("note-calcul-penalites.docx"), "docx", construireDonnees({ dossier, decompteId: null })));
    // Fin prévue 01/07/2026, réception 11/07/2026 : 10 jours × 538,80
    expect(t).toContain("5 388,00");
    expect(t).toContain("cinq mille trois cent quatre-vingt-huit dirhams");
    expect(t).not.toContain("Le plafond des pénalités est atteint");
  });

  it("remplit un modèle Excel (chaînes en ligne et caractères accentués)", async () => {
    const a = analyserModele(lire("situation-marche.xlsx"), "xlsx");
    expect(a.erreurs).toEqual([]);
    expect(a.libres).toEqual(["observations"]);
    const blob = genererDocument(lire("situation-marche.xlsx"), "xlsx", { ...construireDonnees({ dossier, decompteId: null }), observations: "RAS" });
    const xml = new PizZip(await blob.arrayBuffer()).file("xl/worksheets/sheet1.xml")!.asText();
    expect(xml).toContain("Situation du marché n° 01/2026");
    expect(xml).toContain("RAS");
  });

  it("signale une balise mal fermée", () => {
    const zip = new PizZip(lire("bordereau-envoi.docx"));
    const xml = zip.file("word/document.xml")!.asText().replace("{destinataire}", "{destinataire");
    zip.file("word/document.xml", xml);
    const a = analyserModele(zip.generate({ type: "arraybuffer" }), "docx");
    expect(a.erreurs).toHaveLength(1);
    expect(a.erreurs[0]).toMatch(/^Balise non fermée « destinataire/);
  });
});

import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import type { ModeleIA } from "../schemasIA";
import { SchemaModeleIA } from "../schemasIA";
import { construireDocxBuffer } from "./construireDocx";
import { analyserModele, genererDocument } from "./moteur";
import { promptExterne } from "./prompt";

const vide = { texte: null, niveau: null, alignement: null, gras: null, lignes: null, liste: null, colonnes: null, elements: null, cadres: null };

const modele: ModeleIA = SchemaModeleIA.parse({
  nom: "Bordereau d'envoi des réserves",
  description: "Transmission de la liste des réserves à l'entreprise.",
  remarques: [],
  blocs: [
    { ...vide, type: "paragraphe", texte: "{organisme}\n{service}" },
    { ...vide, type: "titre", texte: "BORDEREAU D'ENVOI N° {numero_bordereau}", niveau: 1 },
    { ...vide, type: "infos", lignes: [{ libelle: "Marché n°", valeur: "{marche_numero}" }, { libelle: "Titulaire", valeur: "{marche_entreprise}" }] },
    {
      ...vide,
      type: "tableau",
      liste: "reserves",
      colonnes: [
        { entete: "N°", champ: "numero" },
        { entete: "Réserve", champ: "{designation}" },
        { entete: "Statut", champ: "statut" },
      ],
    },
    { ...vide, type: "paragraphe", texte: "{#en_retard}Le délai est dépassé.{/en_retard}" },
    { ...vide, type: "signatures", cadres: ["L'expéditeur", "Accusé de réception"] },
  ],
});

describe("modèle conçu par l'IA", () => {
  it("produit un .docx valide : balises reconnues, liste répétée, champs à saisir", async () => {
    const buf = await construireDocxBuffer(modele);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const a = analyserModele(ab, "docx");
    expect(a.erreurs).toEqual([]);
    expect(a.connus).toEqual(expect.arrayContaining(["marche_numero", "reserves", "en_retard"]));
    expect(a.libres.sort()).toEqual(["numero_bordereau", "organisme", "service"]);
    expect(a.avertissements).toEqual([]);

    const blob = genererDocument(ab, "docx", {
      organisme: "AGENCE",
      service: "DR",
      numero_bordereau: "12",
      marche_numero: "01/2026",
      marche_entreprise: "SOTRAVO",
      en_retard: false,
      reserves: [
        { numero: "1", designation: "Fissure", statut: "Ouverte" },
        { numero: "2", designation: "Joint", statut: "Levée" },
      ],
    });
    const texte = new PizZip(await blob.arrayBuffer()).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
    expect(texte).toContain("ENVOI N° 12");
    expect(texte).toContain("Fissure");
    expect(texte).toContain("Joint");
    expect(texte).not.toContain("Le délai est dépassé");
  });

  it("le prompt externe contient la syntaxe et le catalogue", () => {
    const p = promptExterne({ categorie: "Bordereau d'envoi", description: "Envoi des attachements au BET" });
    expect(p).toContain("{#lignes_decompte}");
    expect(p).toContain("{penalites_montant_lettres}");
    expect(p).toContain("Envoi des attachements au BET");
    expect(p).toContain("N'invente aucune référence juridique");
  });
});

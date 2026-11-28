import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { SchemaBpdeIA, SchemaModeleIA, SchemaParametresIA, SchemaPropositions, versParametresCps, type ParametresIA } from "./schemasIA";

/** Compte les propriétés facultatives et les unions (anyOf, type multiple) d'un JSON Schema : l'API les plafonne à 24 et 16. */
function complexite(schema: unknown): { unions: number; facultatives: number } {
  const c = { unions: 0, facultatives: 0 };
  const visiter = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visiter);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (Array.isArray(o.anyOf) || Array.isArray(o.oneOf) || Array.isArray(o.type)) c.unions++;
    if (o.properties && typeof o.properties === "object") {
      const requises = new Set((o.required as string[] | undefined) ?? []);
      c.facultatives += Object.keys(o.properties).filter((k) => !requises.has(k)).length;
    }
    Object.values(o).forEach(visiter);
  };
  visiter(schema);
  return c;
}

describe("schémas de sortie structurée", () => {
  const schemas = { SchemaParametresIA, SchemaPropositions, SchemaModeleIA, SchemaBpdeIA };

  it.each(Object.entries(schemas))("%s se convertit en JSON Schema et respecte les limites de l'API", (_, s) => {
    const f = betaZodOutputFormat(s);
    expect(f.type).toBe("json_schema");
    expect(JSON.stringify(f.schema)).toContain('"additionalProperties":false');
    const c = complexite(f.schema);
    expect(c.unions).toBeLessThanOrEqual(16);
    expect(c.facultatives).toBeLessThanOrEqual(24);
  });

  it("les schémas des paramètres et des modèles n'utilisent aucune union", () => {
    expect(complexite(betaZodOutputFormat(SchemaParametresIA).schema).unions).toBe(0);
    expect(complexite(betaZodOutputFormat(SchemaModeleIA).schema).unions).toBe(0);
  });
});

describe("mise en forme des paramètres du CPS", () => {
  const lot = (p: Partial<ParametresIA>): ParametresIA =>
    SchemaParametresIA.parse({
      valeurs: [],
      penalite_base: { valeur: "non_precise", article: "", extrait: "" },
      revision: { applicable: "non_precise", formule: "", indices: [], article: "" },
      remarques: [],
      ...p,
    });

  it("laisse à null ce que le CPS ne fixe pas", () => {
    const r = versParametresCps([lot({ valeurs: [{ parametre: "delai_mois", valeur: 8, article: "Art. 12", extrait: "huit (8) mois" }] })]);
    expect(r.delai_mois).toEqual({ valeur: 8, article: "Art. 12", extrait: "huit (8) mois" });
    expect(r.taux_tva).toEqual({ valeur: null, article: null, extrait: null });
    expect(r.penalite_base.valeur).toBeNull();
    expect(r.revision.applicable).toBeNull();
  });

  it("fusionne les lots d'un CPS long et signale les valeurs divergentes", () => {
    const r = versParametresCps([
      lot({ valeurs: [{ parametre: "penalite_taux_millieme", valeur: 1, article: "Art. 30", extrait: "1/1000" }], remarques: ["Renvoi au CCAG-T"] }),
      lot({
        valeurs: [
          { parametre: "penalite_taux_millieme", valeur: 0.5, article: "Art. 52", extrait: "1/2000" },
          { parametre: "taux_retenue", valeur: 10, article: "", extrait: "dix pour cent" },
        ],
        penalite_base: { valeur: "initial_ttc", article: "Art. 30", extrait: "montant initial du marché" },
        revision: { applicable: "oui", formule: "P = P0 (0,15 + 0,85 BAT6/BAT6o)", indices: [{ nom: "BAT6", part: 0.85 }], article: "Art. 18" },
        remarques: ["Renvoi au CCAG-T"],
      }),
    ]);
    expect(r.penalite_taux_millieme.valeur).toBe(1);
    expect(r.taux_retenue).toEqual({ valeur: 10, article: null, extrait: "dix pour cent" });
    expect(r.penalite_base.valeur).toBe("initial_ttc");
    expect(r.revision).toMatchObject({ applicable: true, indices: [{ nom: "BAT6", part: 0.85 }], article: "Art. 18" });
    expect(r.remarques).toHaveLength(2);
    expect(r.remarques[1]).toContain("0,5");
  });
});

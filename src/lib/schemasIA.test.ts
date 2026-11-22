import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { SchemaParametres, SchemaPropositions } from "./schemasIA";

describe("schémas de sortie structurée", () => {
  it("se convertissent en JSON Schema pour l'API", () => {
    for (const s of [SchemaParametres, SchemaPropositions]) {
      const f = betaZodOutputFormat(s);
      expect(f.type).toBe("json_schema");
      expect(JSON.stringify(f.schema)).toContain('"additionalProperties":false');
    }
  });

  it("valide une réponse type", () => {
    const v = (valeur: number | null) => ({ valeur, article: valeur === null ? null : "Art. 12", extrait: valeur === null ? null : "…" });
    const r = SchemaParametres.parse({
      delai_mois: v(8),
      taux_tva: v(20),
      taux_retenue: v(10),
      plafond_retenue: v(7),
      penalite_taux_millieme: v(1),
      penalite_plafond: v(10),
      penalite_base: { valeur: "initial_ttc", article: "Art. 30", extrait: "…" },
      avance_pourcentage: v(null),
      avance_debut_remboursement: v(null),
      avance_fin_remboursement: v(null),
      delai_garantie_mois: v(12),
      revision: { applicable: true, formule: "P = P0 (0,15 + 0,85 BAT6/BAT6o)", indices: [{ nom: "BAT6", part: 0.85 }], article: "Art. 18" },
      remarques: [],
    });
    expect(r.revision.indices[0].part).toBe(0.85);
  });
});

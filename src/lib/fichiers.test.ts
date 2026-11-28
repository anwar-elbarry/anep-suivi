import { describe, expect, it } from "vitest";
import { avecTypeMime, messageBase, messageStockage, TAILLE_MAX_MO, typeMime, verifierTaille } from "./fichiers";

describe("fichiers déposés", () => {
  it("déduit le type de l'extension, même si le navigateur n'en déclare aucun", () => {
    expect(typeMime("OS n°2 notifié.PDF")).toBe("application/pdf");
    expect(typeMime("photo.heic", "")).toBe("image/heic");
    expect(typeMime("modele.docx", "application/octet-stream")).toContain("wordprocessingml");
    expect(typeMime("inconnu.xyz", "image/gif")).toBe("image/gif");
  });

  it("corrige le type porté par le fichier avant dépôt", () => {
    expect(avecTypeMime(new Blob(["x"]), "cps.pdf").type).toBe("application/pdf");
    const deja = new Blob(["x"], { type: "application/pdf" });
    expect(avecTypeMime(deja, "cps.pdf")).toBe(deja);
  });

  it("refuse un fichier au-delà de la taille maximale, avec sa taille", () => {
    expect(TAILLE_MAX_MO).toBe(50);
    expect(() => verifierTaille({ size: 51 * 1024 * 1024, name: "cps.pdf" })).toThrow("51,0 Mo, maximum 50 Mo");
    expect(() => verifierTaille({ size: 49 * 1024 * 1024 })).not.toThrow();
  });

  it("traduit les refus du stockage et les erreurs de schéma", () => {
    expect(messageStockage("The object exceeded the maximum allowed size")).toContain("limite du projet Supabase");
    expect(messageStockage("mime type application/octet-stream is not supported")).toContain("Format de fichier non accepté");
    expect(messageStockage("autre")).toBe("autre");
    expect(messageBase({ code: "PGRST204", message: "Could not find the 'scan_path' column of 'ordres_service' in the schema cache" })).toContain("supabase/migrations");
    expect(messageBase({ code: "23505", message: "duplicate key" })).toBe("duplicate key");
  });
});

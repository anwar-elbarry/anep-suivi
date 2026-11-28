import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { decouperPdf } from "./pdf";

async function pdfDe(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]).drawText(`Page ${i + 1}`);
  return doc.save();
}

describe("découpage des PDF", () => {
  it("laisse un PDF court tel quel", async () => {
    const octets = await pdfDe(3);
    const r = await decouperPdf(octets, 10);
    expect(r.pages).toBe(3);
    expect(r.lots).toHaveLength(1);
    expect(r.lots[0].octets).toBe(octets);
  });

  it("découpe un PDF long en lots consécutifs sans perdre de page", async () => {
    const r = await decouperPdf(await pdfDe(25), 10);
    expect(r.pages).toBe(25);
    expect(r.lots.map((l) => [l.debut, l.fin])).toEqual([
      [1, 10],
      [11, 20],
      [21, 25],
    ]);
    const comptes = await Promise.all(r.lots.map(async (l) => (await PDFDocument.load(l.octets)).getPageCount()));
    expect(comptes).toEqual([10, 10, 5]);
  });

  it("renvoie le fichier tel quel s'il n'est pas analysable", async () => {
    const octets = new TextEncoder().encode("ceci n'est pas un PDF");
    const r = await decouperPdf(octets);
    expect(r.pages).toBeNull();
    expect(r.lots[0].octets).toBe(octets);
  });
});

/** Découpage des PDF longs en lots de pages, pour rester sous les limites de lecture de Claude. */
import { PDFDocument } from "pdf-lib";

export const PAGES_PAR_LOT = 100;

export interface LotPdf {
  octets: Uint8Array;
  /** Première et dernière page du lot dans le document d'origine (à partir de 1). */
  debut: number;
  fin: number;
}

/**
 * Découpe un PDF en lots d'au plus `pagesParLot` pages.
 * Renvoie `pages: null` et un lot unique (le fichier tel quel) si le PDF ne peut pas être analysé ici
 * (protégé, endommagé) : Claude tentera de le lire directement.
 */
export async function decouperPdf(octets: Uint8Array, pagesParLot = PAGES_PAR_LOT): Promise<{ pages: number | null; lots: LotPdf[] }> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(octets, { updateMetadata: false });
  } catch {
    return { pages: null, lots: [{ octets, debut: 1, fin: 1 }] };
  }
  const pages = source.getPageCount();
  if (pages <= pagesParLot) return { pages, lots: [{ octets, debut: 1, fin: pages }] };

  const lots: LotPdf[] = [];
  for (let debut = 0; debut < pages; debut += pagesParLot) {
    const fin = Math.min(debut + pagesParLot, pages);
    const lot = await PDFDocument.create();
    const copiees = await lot.copyPages(
      source,
      Array.from({ length: fin - debut }, (_, i) => debut + i),
    );
    copiees.forEach((p) => lot.addPage(p));
    lots.push({ octets: await lot.save(), debut: debut + 1, fin });
  }
  return { pages, lots };
}

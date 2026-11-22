/** Construit un modèle .docx à partir de la structure produite par Claude. */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { BlocModeleIA, ModeleIA } from "../schemasIA";

const ALIGN = {
  gauche: AlignmentType.LEFT,
  centre: AlignmentType.CENTER,
  droite: AlignmentType.RIGHT,
  justifie: AlignmentType.JUSTIFIED,
} as const;

const BORD = { style: BorderStyle.SINGLE, size: 4, color: "9AA3AF" };
const BORDS = { top: BORD, bottom: BORD, left: BORD, right: BORD };
const LARGEUR = 9638; // largeur utile A4 avec marges de 2 cm, en twips

function cellule(texte: string, opts: { gras?: boolean; entete?: boolean; largeur: number; droite?: boolean }) {
  return new TableCell({
    width: { size: opts.largeur, type: WidthType.DXA },
    borders: BORDS,
    shading: opts.entete ? { type: ShadingType.CLEAR, color: "auto", fill: "E7ECF3" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: opts.droite ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: texte, bold: opts.gras || opts.entete, size: opts.entete ? 18 : 20 })],
      }),
    ],
  });
}

function tableau(lignes: TableRow[], colonnes: number[]) {
  return new Table({ rows: lignes, columnWidths: colonnes, layout: TableLayoutType.FIXED, width: { size: LARGEUR, type: WidthType.DXA } });
}

/** Une balise de champ de liste peut arriver avec ou sans accolades : on la normalise. */
const nomChamp = (c: string) => c.replace(/[{}#/\s]/g, "");

function bloc(b: BlocModeleIA): (Paragraph | Table)[] {
  const align = b.alignement ? ALIGN[b.alignement] : undefined;
  switch (b.type) {
    case "titre":
      return [
        new Paragraph({
          alignment: align ?? (b.niveau === 2 ? AlignmentType.LEFT : AlignmentType.CENTER),
          spacing: { before: b.niveau === 2 ? 240 : 120, after: 120 },
          children: [new TextRun({ text: b.texte ?? "", bold: true, size: b.niveau === 2 ? 24 : 30 })],
        }),
      ];
    case "paragraphe":
      return [
        new Paragraph({
          alignment: align,
          spacing: { after: 120 },
          children: (b.texte ?? "").split("\n").map((t, i) => new TextRun({ text: t, bold: b.gras ?? false, break: i ? 1 : 0, size: 21 })),
        }),
      ];
    case "infos": {
      const lignes = (b.lignes ?? []).map(
        (l) => new TableRow({ children: [cellule(l.libelle, { largeur: 3600, gras: true }), cellule(l.valeur, { largeur: LARGEUR - 3600 })] }),
      );
      return lignes.length ? [tableau(lignes, [3600, LARGEUR - 3600]), new Paragraph({})] : [];
    }
    case "tableau": {
      const cols = b.colonnes ?? [];
      if (!b.liste || !cols.length) return [];
      const l = Math.floor(LARGEUR / cols.length);
      const larg = cols.map(() => l);
      const entete = new TableRow({ tableHeader: true, children: cols.map((c, i) => cellule(c.entete, { largeur: larg[i], entete: true })) });
      const modele = new TableRow({
        children: cols.map((c, i) => {
          const champ = `{${nomChamp(c.champ)}}`;
          const texte = (i === 0 ? `{#${b.liste}}` : "") + champ + (i === cols.length - 1 ? `{/${b.liste}}` : "");
          return cellule(texte, { largeur: larg[i], droite: /montant|prix|quantite|qte|ecart|net|travaux|revision/.test(c.champ) });
        }),
      });
      return [tableau([entete, modele], larg), new Paragraph({})];
    }
    case "liste":
      return (b.elements ?? []).map((t) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: t, size: 21 })] }));
    case "signatures": {
      const cadres = b.cadres?.length ? b.cadres : ["Établi par", "Visa"];
      const l = Math.floor(LARGEUR / cadres.length);
      const cellules = cadres.map(
        (c) =>
          new TableCell({
            width: { size: l, type: WidthType.DXA },
            borders: BORDS,
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [
              new Paragraph({ children: [new TextRun({ text: c, bold: true, size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: "Nom, date et signature", italics: true, size: 18, color: "6B7280" })] }),
              new Paragraph({}),
              new Paragraph({}),
              new Paragraph({}),
            ],
          }),
      );
      return [new Paragraph({}), tableau([new TableRow({ children: cellules })], cadres.map(() => l))];
    }
    case "saut":
      return [new Paragraph({})];
    default:
      return [];
  }
}

function documentDocx(m: ModeleIA) {
  return new Document({
    creator: "Suivi des travaux",
    title: m.nom,
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: m.blocs.flatMap(bloc),
      },
    ],
  });
}

export function construireDocx(m: ModeleIA): Promise<Blob> {
  return Packer.toBlob(documentDocx(m));
}

/** Variante Node (tests). */
export function construireDocxBuffer(m: ModeleIA): Promise<Buffer> {
  return Packer.toBuffer(documentDocx(m));
}

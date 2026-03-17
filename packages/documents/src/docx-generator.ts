/**
 * DocxGenerator — Produces .docx files using the `docx` library.
 *
 * Spec → structured Word document with headings, paragraphs, bullet lists,
 * tables, and page breaks.  Saved to workspacePath/<filename>.docx.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  UnderlineType,
} from 'docx';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface DocxSection {
  type: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'bullet' | 'pagebreak';
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
}

export interface DocxTable {
  headers: string[];
  rows: string[][];
}

export interface DocxSpec {
  title: string;
  author?: string;
  sections: Array<DocxSection | { type: 'table'; table: DocxTable }>;
  filename?: string; // without extension
}

function sectionToParagraph(section: DocxSection): Paragraph {
  const textRun = new TextRun({
    text: section.text ?? '',
    bold: section.bold ?? false,
    italics: section.italic ?? false,
    underline: section.underline ? { type: UnderlineType.SINGLE } : undefined,
  });

  const alignMap: Record<string, typeof AlignmentType[keyof typeof AlignmentType]> = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  };

  const headingMap: Record<string, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
    heading1: HeadingLevel.HEADING_1,
    heading2: HeadingLevel.HEADING_2,
    heading3: HeadingLevel.HEADING_3,
  };

  return new Paragraph({
    children: [textRun],
    heading: headingMap[section.type],
    alignment: alignMap[section.align ?? 'left'],
    bullet: section.type === 'bullet' ? { level: 0 } : undefined,
    pageBreakBefore: section.type === 'pagebreak',
  });
}

function specToTable(tableSpec: DocxTable): Table {
  const headerRow = new TableRow({
    children: tableSpec.headers.map(
      (h) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true })],
            }),
          ],
          shading: { fill: '2563EB', color: 'FFFFFF' },
        }),
    ),
    tableHeader: true,
  });

  const dataRows = tableSpec.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun(cell)] })],
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 },
              },
            }),
        ),
      }),
  );

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

export class DocxGenerator {
  async generate(spec: DocxSpec, workspacePath: string): Promise<string> {
    const children: (Paragraph | Table)[] = [];

    for (const section of spec.sections) {
      if (section.type === 'table') {
        children.push(specToTable((section as { type: 'table'; table: DocxTable }).table));
      } else if (section.type === 'pagebreak') {
        children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
      } else {
        children.push(sectionToParagraph(section as DocxSection));
      }
    }

    const doc = new Document({
      creator: spec.author ?? 'Infinius',
      title: spec.title,
      sections: [{ children }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${spec.filename ?? spec.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;
    const filepath = path.join(workspacePath, filename);
    await fs.writeFile(filepath, buffer);
    return filepath;
  }
}

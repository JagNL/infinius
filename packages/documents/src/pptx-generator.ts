/**
 * PptxGenerator — Produces .pptx files using pptxgenjs.
 *
 * Each slide can have a title, body text, bullet list, image URL, or table.
 * Theme colors mirror a clean dark-on-light professional default.
 */

import PptxGenJS from 'pptxgenjs';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface PptxSlide {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  body?: string;
  /** URL or absolute path to an image */
  imageUrl?: string;
  table?: {
    headers: string[];
    rows: string[][];
  };
  notes?: string;
}

export interface PptxSpec {
  title: string;
  author?: string;
  theme?: {
    background?: string;  // hex e.g. 'FFFFFF'
    accent?: string;      // hex e.g. '2563EB'
    textColor?: string;   // hex e.g. '1E293B'
  };
  slides: PptxSlide[];
  filename?: string;
}

const DEFAULT_THEME = {
  background: 'FFFFFF',
  accent: '2563EB',
  textColor: '1E293B',
};

export class PptxGenerator {
  async generate(spec: PptxSpec, workspacePath: string): Promise<string> {
    const pptx = new PptxGenJS();
    const theme = { ...DEFAULT_THEME, ...spec.theme };

    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = spec.author ?? 'Infinius';
    pptx.title = spec.title;

    // Define master layout
    pptx.defineSlideMaster({
      title: 'MASTER',
      background: { color: theme.background },
    });

    for (const slide of spec.slides) {
      const s = pptx.addSlide({ masterName: 'MASTER' });

      // Title
      if (slide.title) {
        s.addText(slide.title, {
          x: 0.5,
          y: 0.3,
          w: '90%',
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: theme.textColor,
        });
      }

      // Subtitle
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.5,
          y: 1.0,
          w: '90%',
          h: 0.5,
          fontSize: 16,
          color: '64748B',
          italic: true,
        });
      }

      // Bullets
      if (slide.bullets && slide.bullets.length > 0) {
        const bulletItems = slide.bullets.map((b) => ({
          text: b,
          options: { bullet: true, fontSize: 16, color: theme.textColor },
        }));
        s.addText(bulletItems, {
          x: 0.5,
          y: slide.subtitle ? 1.7 : 1.2,
          w: '90%',
          h: 4.0,
        });
      }

      // Body paragraph
      if (slide.body) {
        s.addText(slide.body, {
          x: 0.5,
          y: slide.subtitle ? 1.7 : 1.2,
          w: '90%',
          h: 4.0,
          fontSize: 15,
          color: theme.textColor,
          wrap: true,
        });
      }

      // Image
      if (slide.imageUrl) {
        s.addImage({
          path: slide.imageUrl,
          x: 1.0,
          y: 2.0,
          w: 8.0,
          h: 4.5,
          sizing: { type: 'contain', w: 8.0, h: 4.5 },
        });
      }

      // Table
      if (slide.table) {
        const rows = [
          slide.table.headers.map((h) => ({
            text: h,
            options: { bold: true, fill: { color: theme.accent }, color: 'FFFFFF' },
          })),
          ...slide.table.rows.map((row) =>
            row.map((cell) => ({ text: cell, options: { color: theme.textColor } })),
          ),
        ];
        s.addTable(rows, {
          x: 0.5,
          y: slide.title ? 1.4 : 0.5,
          w: '90%',
          fontSize: 13,
          border: { pt: 1, color: 'D1D5DB' },
        });
      }

      // Speaker notes
      if (slide.notes) {
        s.addNotes(slide.notes);
      }

      // Accent bar at bottom
      s.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 6.8,
        w: '100%',
        h: 0.2,
        fill: { color: theme.accent },
        line: { color: theme.accent },
      });
    }

    const filename = `${spec.filename ?? spec.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pptx`;
    const filepath = path.join(workspacePath, filename);
    await pptx.writeFile({ fileName: filepath });
    return filepath;
  }
}

/**
 * XlsxGenerator — Produces .xlsx files using exceljs.
 *
 * Supports multiple named sheets, headers with bold styling, data rows,
 * auto-column widths, and optional number formatting.
 */

import ExcelJS from 'exceljs';
import path from 'node:path';

export interface XlsxSheet {
  name: string;
  headers: Array<{
    key: string;
    header: string;
    width?: number;
    numFmt?: string; // e.g. '$#,##0.00', '0.00%', 'yyyy-mm-dd'
  }>;
  rows: Record<string, string | number | Date | null>[];
  freezeTopRow?: boolean;
}

export interface XlsxSpec {
  filename?: string;
  sheets: XlsxSheet[];
}

export class XlsxGenerator {
  async generate(spec: XlsxSpec, workspacePath: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Infinius';
    workbook.created = new Date();

    for (const sheet of spec.sheets) {
      const ws = workbook.addWorksheet(sheet.name);

      // Define columns
      ws.columns = sheet.headers.map((h) => ({
        key: h.key,
        header: h.header,
        width: h.width ?? 18,
      }));

      // Style header row
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 22;

      // Apply number formats to columns
      sheet.headers.forEach((h, idx) => {
        if (h.numFmt) {
          ws.getColumn(idx + 1).numFmt = h.numFmt;
        }
      });

      // Add data rows
      for (const row of sheet.rows) {
        const r = ws.addRow(row);
        r.alignment = { vertical: 'middle' };
        // Alternate row shading
        const rowNum = r.number;
        if (rowNum % 2 === 0) {
          r.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' },
          };
        }
      }

      // Auto-fit column widths based on content
      ws.columns.forEach((col) => {
        if (!col.values) return;
        let maxLen = 10;
        col.values.forEach((v) => {
          if (v !== null && v !== undefined) {
            maxLen = Math.max(maxLen, v.toString().length + 2);
          }
        });
        col.width = Math.min(maxLen, 50);
      });

      // Freeze top row
      if (sheet.freezeTopRow !== false) {
        ws.views = [{ state: 'frozen', ySplit: 1 }];
      }

      // Auto filter on headers
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.headers.length },
      };
    }

    const filename = `${spec.filename ?? 'export'}.xlsx`;
    const filepath = path.join(workspacePath, filename);
    await workbook.xlsx.writeFile(filepath);
    return filepath;
  }
}

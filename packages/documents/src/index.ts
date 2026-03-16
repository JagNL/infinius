/**
 * @infinius/documents
 *
 * Document generation package.  Mirrors Computer's asset subagent that
 * produces DOCX, PPTX, XLSX, and PDF files for sharing.
 *
 * Each generator accepts a structured spec and writes a file to the
 * agent's workspace, then returns the file path for share_file to serve.
 *
 * Generators:
 *   DocxGenerator  — Microsoft Word (.docx) via docx library
 *   PptxGenerator  — PowerPoint (.pptx) via pptxgenjs
 *   XlsxGenerator  — Excel (.xlsx) via exceljs
 *   PdfGenerator   — PDF via HTML → headless Chromium (puppeteer-core)
 */

export { DocxGenerator, type DocxSpec, type DocxSection } from './docx-generator.js';
export { PptxGenerator, type PptxSpec, type PptxSlide } from './pptx-generator.js';
export { XlsxGenerator, type XlsxSpec, type XlsxSheet } from './xlsx-generator.js';
export { PdfGenerator, type PdfSpec } from './pdf-generator.js';

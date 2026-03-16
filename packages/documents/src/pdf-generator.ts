/**
 * PdfGenerator — Produces .pdf files by rendering HTML with headless Chromium.
 *
 * Two modes:
 *   1. html  — you provide raw HTML; we wrap it in a styled page and print
 *   2. markdown — we convert markdown to HTML first then print
 *
 * Requires CHROMIUM_PATH env var OR falls back to the system `chromium-browser`
 * binary.  In Railway/Docker use: CHROMIUM_PATH=/usr/bin/chromium-browser
 *
 * Uses puppeteer-core (no bundled Chromium) to keep the Docker image lean.
 */

import puppeteer from 'puppeteer-core';
import path from 'node:path';

export interface PdfSpec {
  mode: 'html' | 'markdown';
  content: string;
  filename?: string;
  pageSize?: 'A4' | 'Letter';
  landscape?: boolean;
  margins?: { top?: string; right?: string; bottom?: string; left?: string };
}

const PAGE_STYLES = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.6;
    color: #1e293b;
    padding: 0;
    margin: 0;
  }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #0f172a; }
  h2 { font-size: 18px; font-weight: 600; margin: 20px 0 6px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  h3 { font-size: 15px; font-weight: 600; margin: 14px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: #2563eb; color: white; padding: 8px 10px; text-align: left; font-size: 12px; }
  td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  tr:nth-child(even) td { background: #f8fafc; }
  pre, code { background: #f1f5f9; border-radius: 4px; font-family: 'SF Mono', monospace; font-size: 11px; }
  pre { padding: 10px 14px; overflow-x: auto; }
  code { padding: 1px 4px; }
  blockquote { border-left: 3px solid #2563eb; margin: 10px 0; padding: 4px 12px; color: #475569; }
  ul, ol { margin: 6px 0; padding-left: 20px; }
  li { margin: 3px 0; }
  a { color: #2563eb; }
`;

async function markdownToHtml(md: string): Promise<string> {
  // Lightweight markdown conversion without external deps
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, (line) =>
      line.startsWith('<') ? line : `<p>${line}</p>`,
    );
}

export class PdfGenerator {
  async generate(spec: PdfSpec, workspacePath: string): Promise<string> {
    const chromiumPath =
      process.env.CHROMIUM_PATH ??
      process.env.PUPPETEER_EXECUTABLE_PATH ??
      '/usr/bin/chromium-browser';

    const browser = await puppeteer.launch({
      executablePath: chromiumPath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    });

    try {
      const page = await browser.newPage();

      const bodyHtml =
        spec.mode === 'markdown'
          ? await markdownToHtml(spec.content)
          : spec.content;

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>${PAGE_STYLES}</style></head><body>${bodyHtml}</body></html>`;

      await page.setContent(html, { waitUntil: 'networkidle0' });

      const margins = {
        top: spec.margins?.top ?? '20mm',
        right: spec.margins?.right ?? '20mm',
        bottom: spec.margins?.bottom ?? '20mm',
        left: spec.margins?.left ?? '20mm',
      };

      const filename = `${spec.filename ?? 'document'}.pdf`;
      const filepath = path.join(workspacePath, filename);

      await page.pdf({
        path: filepath,
        format: spec.pageSize ?? 'A4',
        landscape: spec.landscape ?? false,
        margin: margins,
        printBackground: true,
      });

      return filepath;
    } finally {
      await browser.close();
    }
  }
}

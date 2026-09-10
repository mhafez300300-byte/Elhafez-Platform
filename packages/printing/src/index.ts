import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface SimplePdfDocument {
  title: string;
  lines: string[];
  footer?: string;
}

export class PdfRenderer {
  async render(document: SimplePdfDocument): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText(document.title, { x: 50, y: 790, size: 18, font, color: rgb(0, 0, 0) });
    let y = 755;
    for (const line of document.lines) {
      page.drawText(line, { x: 50, y, size: 11, font, color: rgb(0, 0, 0) });
      y -= 18;
      if (y < 70) break;
    }
    if (document.footer) page.drawText(document.footer, { x: 50, y: 40, size: 9, font });
    return pdf.save();
  }
}

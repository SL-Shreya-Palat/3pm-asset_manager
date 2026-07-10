/**
 * Barcode / QR code PDF label generation utility.
 *
 * Generates downloadable PDFs with labels laid out on Avery-compatible sheets.
 * Uses jsPDF for PDF creation, JsBarcode for Code128 barcodes, and qrcode for QR codes.
 */
import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

/* ── Types ────────────────────────────────────────────────────────── */

export type LabelSize = 'small' | 'large';
/** 'applink' = QR encoding a URL that opens the asset in the app (PWA). */
export type BarcodeType = 'barcode' | 'qrcode' | 'applink';

interface LabelFormat {
  name: string;
  averyNumbers: string;
  labelWidth: number;   // inches
  labelHeight: number;  // inches
  columns: number;
  rows: number;
  perSheet: number;
  marginTop: number;    // inches
  marginLeft: number;   // inches
  gapX: number;         // inches
  gapY: number;         // inches
}

export interface GeneratePDFOptions {
  assets: { id: string; name: string; assetNumber?: string }[];
  barcodeType: BarcodeType;
  labelQuantity: number;
  labelSize: LabelSize;
  /** Builds the URL a scan opens — required when barcodeType is 'applink'. */
  appLink?: (id: string) => string;
}

/* ── Label format constants (US Letter 8.5" x 11") ───────────────── */

export const LABEL_FORMATS: Record<LabelSize, LabelFormat> = {
  small: {
    name: 'Small (1" x 2-5/8")',
    averyNumbers: 'Avery 5160 / 8160',
    labelWidth: 2.625,
    labelHeight: 1.0,
    columns: 3,
    rows: 10,
    perSheet: 30,
    marginTop: 0.5,
    marginLeft: 0.1875,
    gapX: 0.125,
    gapY: 0,
  },
  large: {
    name: 'Large (2" x 4")',
    averyNumbers: 'Avery 5163 / 8163',
    labelWidth: 4.0,
    labelHeight: 2.0,
    columns: 2,
    rows: 5,
    perSheet: 10,
    marginTop: 0.5,
    marginLeft: 0.15625,
    gapX: 0.1875,
    gapY: 0,
  },
};

/* ── Barcode generation (offscreen canvas) ────────────────────────── */

function generateBarcodeDataUrl(text: string, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, text, {
    format: 'CODE128',
    width: 2,
    height,
    displayValue: false,
    margin: 0,
  });
  // Scale canvas to requested width if needed
  if (canvas.width !== width) {
    const scaled = document.createElement('canvas');
    scaled.width = width;
    scaled.height = height;
    const ctx = scaled.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0, width, height);
      return scaled.toDataURL('image/png');
    }
  }
  return canvas.toDataURL('image/png');
}

/* ── QR code generation ───────────────────────────────────────────── */

async function generateQRCodeDataUrl(text: string, size: number): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 0,
    errorCorrectionLevel: 'M',
  });
}

/* ── Single-label preview (for dialog) ────────────────────────────── */

export async function generatePreviewDataUrl(
  text: string,
  barcodeType: BarcodeType,
): Promise<string> {
  if (barcodeType === 'barcode') {
    return generateBarcodeDataUrl(text, 240, 80);
  }
  return generateQRCodeDataUrl(text, 180);
}

/* ── Full PDF generation ──────────────────────────────────────────── */

export async function generateLabelsPDF(options: GeneratePDFOptions): Promise<Blob> {
  const { assets, barcodeType, labelQuantity, labelSize, appLink } = options;
  const format = LABEL_FORMATS[labelSize];
  const doc = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });

  // Build flat list of labels (each asset repeated labelQuantity times).
  // `value` is what the code encodes; `caption` is the printed text below it.
  const labels: { value: string; caption: string }[] = [];
  for (const asset of assets) {
    const caption = asset.assetNumber || asset.name;
    const value =
      barcodeType === 'applink' && appLink ? appLink(asset.id) : caption;
    for (let i = 0; i < labelQuantity; i++) {
      labels.push({ value, caption });
    }
  }

  for (let i = 0; i < labels.length; i++) {
    const pageIndex = Math.floor(i / format.perSheet);
    const posOnPage = i % format.perSheet;

    // Add new page when needed (page 0 already exists)
    if (pageIndex > 0 && posOnPage === 0) {
      doc.addPage('letter', 'portrait');
    }

    const col = posOnPage % format.columns;
    const row = Math.floor(posOnPage / format.columns);

    const x = format.marginLeft + col * (format.labelWidth + format.gapX);
    const y = format.marginTop + row * (format.labelHeight + format.gapY);

    const { value: labelValue, caption: labelText } = labels[i];
    const padding = 0.08;
    const availWidth = format.labelWidth - padding * 2;
    const availHeight = format.labelHeight - padding * 2;
    const textHeight = labelSize === 'small' ? 0.15 : 0.25;
    const imgAreaHeight = availHeight - textHeight;

    // Generate image
    let imgDataUrl: string;

    if (barcodeType === 'barcode') {
      imgDataUrl = generateBarcodeDataUrl(labelValue, 300, 80);
      const barcodeWidth = Math.min(availWidth * 0.9, availWidth);
      const barcodeHeight = Math.min(imgAreaHeight * 0.65, imgAreaHeight);
      const imgX = x + padding + (availWidth - barcodeWidth) / 2;
      const imgY = y + padding + (imgAreaHeight - barcodeHeight) / 2;
      doc.addImage(imgDataUrl, 'PNG', imgX, imgY, barcodeWidth, barcodeHeight);
    } else {
      const qrSize = Math.min(imgAreaHeight * 0.85, availWidth * 0.45);
      imgDataUrl = await generateQRCodeDataUrl(labelValue, 200);
      const imgX = x + padding + (availWidth - qrSize) / 2;
      const imgY = y + padding + (imgAreaHeight - qrSize) / 2;
      doc.addImage(imgDataUrl, 'PNG', imgX, imgY, qrSize, qrSize);
    }

    // Draw text below barcode/QR
    const fontSize = labelSize === 'small' ? 6 : 9;
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    const textX = x + format.labelWidth / 2;
    const textY = y + format.labelHeight - padding;
    doc.text(labelText, textX, textY, { align: 'center', maxWidth: availWidth });
  }

  return doc.output('blob');
}

import PDFDocument from 'pdfkit';

export interface ComprobanteItem {
  nombre: string;
  categoria?: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
}

export interface ComprobanteData {
  id_venta: number;
  tipo_comprobante: 'boleta' | 'factura';
  fecha: string;
  estado?: string;
  cliente: string;
  email: string;
  dni_ruc?: string;
  razon_social?: string;
  metodo_pago: string;
  referencia_pago?: string;
  comentario?: string;
  items: ComprobanteItem[];
  subtotal: number;
  igv: number;
  costo_envio: number;
  total: number;
  direccion?: string;
}

const BLUE   = '#0ea5e9';
const DARK   = '#0f172a';
const GRAY   = '#64748b';
const LGRAY  = '#e2e8f0';
const WHITE  = '#ffffff';

export async function buildComprobantePDF(data: ComprobanteData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data',  (chunk) => chunks.push(chunk));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;
    const PH = doc.page.height;
    const W  = PW - 100;
    const L  = 50;

    doc.save();
    doc.translate(PW / 2, PH / 2);
    doc.rotate(-45);
    doc.fontSize(88).fillColor('#e0f2fe').font('Helvetica-Bold')
       .text('NOVATECH', -210, -44, { lineBreak: false });
    doc.restore();

    doc.rect(0, 0, PW, 88).fill(BLUE);

    doc.fontSize(22).fillColor(WHITE).font('Helvetica-Bold')
       .text('NovaTech Commerce', L, 20, { lineBreak: false });
    doc.fontSize(9).fillColor('rgba(255,255,255,0.78)').font('Helvetica')
       .text('Plataforma de comercio electronico  ·  Lima, Peru', L, 48, { lineBreak: false });

    doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold')
       .text('COMPROBANTE DE COMPRA', 0, 24, { align: 'right', width: PW - L, lineBreak: false });
    doc.fontSize(17).fillColor(WHITE).font('Helvetica-Bold')
       .text(`Pedido #${data.id_venta}`, 0, 40, { align: 'right', width: PW - L, lineBreak: false });

    let y = 108;

    doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold')
       .text('DATOS DEL PEDIDO', L, y);
    doc.moveTo(L, y + 15).lineTo(L + W, y + 15).strokeColor(LGRAY).lineWidth(0.8).stroke();
    y += 24;

    const half  = W / 2;
    const lCol  = L;
    const rCol  = L + half + 8;
    const lLbl  = 82;
    const rLbl  = 90;
    const rowGap = 17;

    const refText = data.referencia_pago || '-';
    const commentText = data.comentario || (data.direccion ? `DESPACHO: ${data.direccion}` : '-');
    const estadoText  = (data.estado || 'PENDIENTE').toUpperCase();

    const leftRows: [string, string][] = [
      ['Cliente:',  data.cliente],
      ['Correo:',   data.email],
      ['Fecha:',    data.fecha],
      ['Estado:',   estadoText],
    ];

    const rightRows: [string, string][] = [
      ['Metodo de pago:',  data.metodo_pago],
      ['Monto pagado:',    `S/ ${data.total.toFixed(2)}`],
      ['Referencia:',      refText],
      ['Comentario:',      commentText],
    ];

    leftRows.forEach(([label, value], i) => {
      const ry = y + i * rowGap;
      doc.fontSize(8.5).fillColor(GRAY).font('Helvetica')
         .text(label, lCol, ry, { width: lLbl, lineBreak: false });
      doc.fontSize(8.5).fillColor(DARK).font('Helvetica')
         .text(value, lCol + lLbl + 4, ry, { width: half - lLbl - 8, lineBreak: false });
    });

    rightRows.forEach(([label, value], i) => {
      const ry = y + i * rowGap;
      doc.fontSize(8.5).fillColor(GRAY).font('Helvetica')
         .text(label, rCol, ry, { width: rLbl, lineBreak: false });
      doc.fontSize(8.5).fillColor(DARK).font('Helvetica')
         .text(value, rCol + rLbl + 4, ry, { width: half - rLbl - 8, lineBreak: false });
    });

    y += leftRows.length * rowGap + 22;

    doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold')
       .text('DETALLE DE PRODUCTOS', L, y);
    y += 16;

    const colProd = W * 0.36;
    const colCat  = W * 0.18;
    const colQty  = W * 0.08;
    const colUnit = W * 0.18;
    const colSub  = W * 0.20;

    doc.rect(L, y, W, 22).fill(BLUE);
    doc.fontSize(8).fillColor(WHITE).font('Helvetica-Bold');
    doc.text('Producto',           L + 8,                             y + 7, { width: colProd - 8,  lineBreak: false });
    doc.text('Categoria',          L + colProd,                       y + 7, { width: colCat,        lineBreak: false });
    doc.text('Cant.',              L + colProd + colCat,              y + 7, { width: colQty,   align: 'center', lineBreak: false });
    doc.text('P. Unit. (c/IGV)',   L + colProd + colCat + colQty,     y + 7, { width: colUnit,  align: 'right',  lineBreak: false });
    doc.text('Subtotal',           L + colProd + colCat + colQty + colUnit, y + 7, { width: colSub - 8, align: 'right', lineBreak: false });
    y += 22;

    data.items.forEach((item, i) => {
      const rh   = 22;
      const fill = i % 2 === 0 ? WHITE : '#f0f9ff';
      doc.rect(L, y, W, rh).fill(fill).stroke(LGRAY);

      const xProd = L + 8;
      const xCat  = L + colProd;
      const xQty  = L + colProd + colCat;
      const xUnit = L + colProd + colCat + colQty;
      const xSub  = L + colProd + colCat + colQty + colUnit;

      doc.fontSize(8).fillColor(DARK).font('Helvetica');
      doc.text(item.nombre,                             xProd, y + 7, { width: colProd - 12, lineBreak: false });
      doc.text(item.categoria || '-',                   xCat,  y + 7, { width: colCat - 4,   lineBreak: false });
      doc.text(String(item.cantidad),                   xQty,  y + 7, { width: colQty,   align: 'center', lineBreak: false });
      doc.text(`S/ ${item.precio_unit.toFixed(2)}`,     xUnit, y + 7, { width: colUnit,  align: 'right',  lineBreak: false });
      doc.fillColor(BLUE).font('Helvetica-Bold')
         .text(`S/ ${item.subtotal.toFixed(2)}`,        xSub,  y + 7, { width: colSub - 8, align: 'right', lineBreak: false });
      y += rh;
    });

    doc.moveTo(L, y).lineTo(L + W, y).strokeColor(LGRAY).lineWidth(0.8).stroke();
    y += 16;

    const totW = 230;
    const totX = L + W - totW;

    const drawRow = (label: string, value: string) => {
      doc.fontSize(9).fillColor(GRAY).font('Helvetica')
         .text(label, totX, y, { width: 130, lineBreak: false });
      doc.fillColor(DARK).font('Helvetica')
         .text(value, totX, y, { width: totW, align: 'right', lineBreak: false });
      doc.moveTo(totX, y + 14).lineTo(totX + totW, y + 14).strokeColor(LGRAY).lineWidth(0.5).stroke();
      y += 18;
    };

    drawRow('Subtotal (sin IGV):', `S/ ${data.subtotal.toFixed(2)}`);
    drawRow('IGV (18%):',          `S/ ${data.igv.toFixed(2)}`);
    if (data.costo_envio > 0) {
      drawRow('Costo de envio:',   `S/ ${data.costo_envio.toFixed(2)}`);
    }

    y += 2;
    doc.rect(totX - 12, y - 4, totW + 12, 26).fill(BLUE);
    doc.fontSize(10).fillColor(WHITE).font('Helvetica-Bold')
       .text('TOTAL PAGADO:', totX, y + 3, { width: 130, lineBreak: false })
       .text(`S/ ${data.total.toFixed(2)}`, totX, y + 3, { width: totW, align: 'right', lineBreak: false });

    doc.end();
  });
}

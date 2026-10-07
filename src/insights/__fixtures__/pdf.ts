// Test-only helper: build small but real PDFs (text, vector lines, an embedded
// raster) so the extraction layer can be exercised against pdf.js without
// shipping sample documents. Not imported by production code.
import zlib from 'zlib';

export interface TestText {
  x: number;
  y: number;
  size: number;
  str: string;
}

export interface TestImage {
  // Placement on the page, in PDF points (origin bottom-left).
  x: number;
  y: number;
  w: number;
  h: number;
  // Pixel dimensions of the embedded raster.
  pxW: number;
  pxH: number;
  fill: (x: number, y: number) => [number, number, number];
}

export interface TestPage {
  width?: number;
  height?: number;
  texts?: TestText[];
  // Stroked line segments [x1, y1, x2, y2].
  lines?: [number, number, number, number][];
  image?: TestImage;
}

function escapeText(str: string): string {
  return str.replace(/[\\()]/g, (c) => `\\${c}`);
}

export function buildPdf(pages: TestPage[]): Buffer {
  const objects: (Buffer | string)[] = [];
  const add = (body: Buffer | string): number => {
    objects.push(body);
    return objects.length;
  };
  const stream = (dict: string, data: Buffer): Buffer =>
    Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, Buffer.from('\nendstream')]);

  const catalogId = add(''); // patched below
  const pagesId = add(''); // patched below
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const pageIds: number[] = [];
  for (const page of pages) {
    const width = page.width ?? 842;
    const height = page.height ?? 595;
    let content = '';
    let resources = `/Font << /F1 ${fontId} 0 R >>`;
    if (page.image) {
      const img = page.image;
      const raw = Buffer.alloc(img.pxW * img.pxH * 3);
      for (let y = 0; y < img.pxH; y++) {
        for (let x = 0; x < img.pxW; x++) {
          const [r, g, b] = img.fill(x, y);
          const i = (y * img.pxW + x) * 3;
          raw[i] = r;
          raw[i + 1] = g;
          raw[i + 2] = b;
        }
      }
      const imageId = add(
        stream(
          `/Type /XObject /Subtype /Image /Width ${img.pxW} /Height ${img.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`,
          zlib.deflateSync(raw)
        )
      );
      resources += ` /XObject << /Im1 ${imageId} 0 R >>`;
      content += `q ${img.w} 0 0 ${img.h} ${img.x} ${img.y} cm /Im1 Do Q\n`;
    }
    for (const [x1, y1, x2, y2] of page.lines ?? []) content += `${x1} ${y1} m ${x2} ${y2} l S\n`;
    for (const t of page.texts ?? []) {
      content += `BT /F1 ${t.size} Tf ${t.x} ${t.y} Td (${escapeText(t.str)}) Tj ET\n`;
    }
    const contentId = add(stream('', Buffer.from(content)));
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << ${resources} >> /Contents ${contentId} 0 R >>`
      )
    );
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let length = chunks[0]!.length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.from(body), Buffer.from('\nendobj\n')]);
    chunks.push(chunk);
    length += chunk.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

// A noisy, colourful raster that reads as "photographic" to the pixel stats.
export function photoFill(x: number, y: number): [number, number, number] {
  const n = (x * 7919 + y * 104729) % 97;
  return [(x * 3 + n) % 256, (y * 5 + n * 2) % 256, ((x + y) * 2 + n) % 256];
}

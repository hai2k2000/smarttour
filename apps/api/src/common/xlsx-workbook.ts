import { BadRequestException } from '@nestjs/common';
import * as zlib from 'node:zlib';

type AnyRecord = Record<string, unknown>;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function toXlsxWorkbook(sheetName: string, rows: AnyRecord[], keys: string[]) {
  return toXlsxWorkbookRows(sheetName, [keys, ...rows.map((row) => keys.map((key) => row[key]))]);
}

export function csvToXlsxWorkbook(sheetName: string, csv: string) {
  return toXlsxWorkbookRows(sheetName, parseCsvRows(csv));
}

export function toXlsxWorkbookRows(sheetName: string, rows: unknown[][]) {
  const worksheet = worksheetXml(rows);
  const files = new Map<string, Buffer>([
    ['[Content_Types].xml', Buffer.from(contentTypesXml(), 'utf8')],
    ['_rels/.rels', Buffer.from(rootRelsXml(), 'utf8')],
    ['docProps/app.xml', Buffer.from(appXml(sheetName), 'utf8')],
    ['docProps/core.xml', Buffer.from(coreXml(), 'utf8')],
    ['xl/workbook.xml', Buffer.from(workbookXml(sheetName), 'utf8')],
    ['xl/_rels/workbook.xml.rels', Buffer.from(workbookRelsXml(), 'utf8')],
    ['xl/worksheets/sheet1.xml', Buffer.from(worksheet, 'utf8')],
  ]);
  return zipStore(files);
}

export function parseXlsxRows(buffer: Buffer) {
  if (buffer.length > 5 * 1024 * 1024) throw new BadRequestException('File XLSX không được vượt quá 5 MB');
  const files = unzip(buffer);
  const worksheet = files.get(firstWorksheetPath(files));
  if (!worksheet) throw new BadRequestException('File XLSX thiếu worksheet dữ liệu');
  const sharedStrings = parseSharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8') || '');
  const rows = parseWorksheetRows(worksheet.toString('utf8'), sharedStrings);
  const header = (rows.shift() || []).map((cell) => String(cell || '').trim());
  if (!header.length || header.some((column) => !column)) throw new BadRequestException('XLSX thiếu header hợp lệ');
  if (new Set(header).size !== header.length) throw new BadRequestException('XLSX có header trùng lặp');
  return rows
    .filter((cells) => cells.some((entry) => String(entry || '').trim()))
    .map((cells, rowIndex) => {
      if (cells.length > header.length) throw new BadRequestException(`XLSX dòng ${rowIndex + 2} có quá nhiều cột`);
      return Object.fromEntries(header.map((column, columnIndex) => [column, String(cells[columnIndex] ?? '').trim() || undefined]));
    });
}

export { XLSX_MIME };

function worksheetXml(rows: unknown[][]) {
  const allRows = rows.length ? rows : [[]];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${allRows.map((row, rowIndex) => rowXml(row, rowIndex + 1)).join('')}</sheetData>` +
    `</worksheet>`;
}

function rowXml(values: unknown[], rowNumber: number) {
  return `<row r="${rowNumber}">${values.map((value, columnIndex) => cellXml(value, columnName(columnIndex + 1), rowNumber)).join('')}</row>`;
}

function cellXml(value: unknown, column: string, rowNumber: number) {
  const ref = `${column}${rowNumber}`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlText(cellText(value))}</t></is></c>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`;
}

function workbookXml(sheetName: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${xmlText(sheetName.slice(0, 31) || 'Sheet1')}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;
}

function workbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;
}

function appXml(sheetName: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>SmartTour</Application><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${xmlText(sheetName)}</vt:lpstr></vt:vector></TitlesOfParts>` +
    `</Properties>`;
}

function coreXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:creator>SmartTour</dc:creator><cp:lastModifiedBy>SmartTour</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>` +
    `</cp:coreProperties>`;
}

function zipStore(files: Map<string, Buffer>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files.entries()) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

function unzip(buffer: Buffer) {
  const eocdOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset < 0) throw new BadRequestException('File XLSX không hợp lệ');
  const entries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const files = new Map<string, Buffer>();
  for (let index = 0; index < entries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new BadRequestException('File XLSX có central directory không hợp lệ');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString('utf8');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    if (method === 0) files.set(name, compressed);
    else if (method === 8) files.set(name, zlib.inflateRawSync(compressed));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function firstWorksheetPath(files: Map<string, Buffer>) {
  if (files.has('xl/worksheets/sheet1.xml')) return 'xl/worksheets/sheet1.xml';
  const fallback = [...files.keys()].find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!fallback) throw new BadRequestException('File XLSX thiếu worksheet dữ liệu');
  return fallback;
}


function parseCsvRows(value: string) {
  const csv = value.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\r' || character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
    } else {
      cell += character;
    }
  }
  if (quoted) throw new BadRequestException('CSV has an unclosed quoted cell');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((entry) => String(entry || '').trim()));
}

function parseSharedStrings(xml: string) {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => xmlDecode([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join('')));
}

function parseWorksheetRows(xml: string, sharedStrings: string[]) {
  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const index = ref ? columnIndex(ref) : cells.length;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      if (type === 'inlineStr') cells[index] = xmlDecode(body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || '');
      else {
        const raw = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] || '';
        cells[index] = type === 's' ? (sharedStrings[Number(raw)] || '') : xmlDecode(raw);
      }
    }
    return cells;
  });
}

function columnName(index: number) {
  let name = '';
  while (index > 0) {
    index -= 1;
    name = String.fromCharCode(65 + (index % 26)) + name;
    index = Math.floor(index / 26);
  }
  return name;
}

function columnIndex(name: string) {
  return name.split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function cellText(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '');
}

function xmlText(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function xmlDecode(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

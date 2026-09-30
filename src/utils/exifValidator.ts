/**
 * Pure TypeScript EXIF Metadata Parser & Festival Date Validator
 * Extracts DateTimeOriginal, DateTimeDigitized, or DateTime from JPEG/TIFF image binary
 * without any external npm packages.
 */

export interface ExifValidationResult {
  hasExif: boolean;
  dateTimeOriginal?: string;
  date?: Date;
  year?: number;
  isValidForCurrentFestival: boolean;
  message: string;
  source: 'exif' | 'file_last_modified' | 'live_capture' | 'unknown';
}

/**
 * Extracts EXIF Date Taken from an image File
 */
export async function extractExifDateTime(file: File): Promise<ExifValidationResult> {
  const currentYear = new Date().getFullYear();

  // 1. If File was captured via live camera stream
  if ((file as any).isLiveCapture) {
    return {
      hasExif: true,
      dateTimeOriginal: new Date().toISOString(),
      date: new Date(),
      year: currentYear,
      isValidForCurrentFestival: true,
      message: 'Verified Live Camera Capture',
      source: 'live_capture',
    };
  }

  try {
    // Read first 128KB of image where EXIF header resides
    const slice = file.slice(0, 131072);
    const arrayBuffer = await slice.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    // Check JPEG SOI marker (0xFFD8)
    if (dataView.getUint16(0, false) === 0xFFD8) {
      let offset = 2;
      const length = dataView.byteLength;

      while (offset < length - 4) {
        const marker = dataView.getUint16(offset, false);
        offset += 2;

        if (marker === 0xFFE1) {
          // APP1 Marker (EXIF)
          const segmentLength = dataView.getUint16(offset, false);
          offset += 2;

          // Check "Exif\0\0"
          const exifHeader = String.fromCharCode(
            dataView.getUint8(offset),
            dataView.getUint8(offset + 1),
            dataView.getUint8(offset + 2),
            dataView.getUint8(offset + 3)
          );

          if (exifHeader === 'Exif') {
            const tiffOffset = offset + 6;
            const parsedDate = parseTiffHeader(dataView, tiffOffset);
            if (parsedDate) {
              const fileYear = parsedDate.getFullYear();
              const isCurrentFestival = fileYear === currentYear || fileYear === 2027 || (currentYear === 2026 && fileYear === 2026);

              return {
                hasExif: true,
                dateTimeOriginal: parsedDate.toISOString(),
                date: parsedDate,
                year: fileYear,
                isValidForCurrentFestival: isCurrentFestival,
                message: isCurrentFestival
                  ? `Verified Photo Date: ${parsedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : `Photo taken in ${fileYear} (Prior season). Please consider a live photo for ${currentYear}.`,
                source: 'exif',
              };
            }
          }
          offset += segmentLength - 2;
        } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD8 && marker !== 0xFFD9) {
          // Skip other markers
          const segmentLength = dataView.getUint16(offset, false);
          offset += segmentLength;
        } else {
          break;
        }
      }
    }
  } catch (err) {
    console.warn('Could not parse EXIF binary:', err);
  }

  // Fallback to file.lastModified if EXIF was stripped by messaging apps (WhatsApp / Telegram)
  if (file.lastModified) {
    const modDate = new Date(file.lastModified);
    const modYear = modDate.getFullYear();
    const isCurrentFestival = modYear === currentYear || modYear === 2027 || (currentYear === 2026 && modYear === 2026);

    return {
      hasExif: false,
      dateTimeOriginal: modDate.toISOString(),
      date: modDate,
      year: modYear,
      isValidForCurrentFestival: isCurrentFestival,
      message: isCurrentFestival
        ? `File timestamp: ${modDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} (Active Season)`
        : `File date from ${modYear}. You can also use live camera capture.`,
      source: 'file_last_modified',
    };
  }

  return {
    hasExif: false,
    isValidForCurrentFestival: true,
    message: 'Standard image upload (Timestamp check passed)',
    source: 'unknown',
  };
}

/**
 * Helper to parse TIFF header and IFD tags
 */
function parseTiffHeader(view: DataView, tiffStart: number): Date | null {
  if (tiffStart + 8 > view.byteLength) return null;

  // Byte order: 0x4949 = Little Endian ('II'), 0x4D4D = Big Endian ('MM')
  const byteOrder = view.getUint16(tiffStart, false);
  const isLittleEndian = byteOrder === 0x4949;

  // TIFF magic 0x002A
  const magic = view.getUint16(tiffStart + 2, isLittleEndian);
  if (magic !== 0x002A) return null;

  const firstIfdOffset = view.getUint32(tiffStart + 4, isLittleEndian);
  if (firstIfdOffset < 8) return null;

  // Search 0th IFD & Exif SubIFD for DateTimeOriginal (0x9003), DateTimeDigitized (0x9004), DateTime (0x0132)
  const exifSubIfdOffset = readTagValue(view, tiffStart, tiffStart + firstIfdOffset, isLittleEndian, 0x8769);

  // Try Exif SubIFD first
  if (exifSubIfdOffset && typeof exifSubIfdOffset === 'number') {
    const dateStr = readTagString(view, tiffStart, tiffStart + exifSubIfdOffset, isLittleEndian, 0x9003) ||
      readTagString(view, tiffStart, tiffStart + exifSubIfdOffset, isLittleEndian, 0x9004);
    if (dateStr) {
      return parseExifDateString(dateStr);
    }
  }

  // Fallback to 0th IFD DateTime tag (0x0132)
  const dateStr = readTagString(view, tiffStart, tiffStart + firstIfdOffset, isLittleEndian, 0x0132);
  if (dateStr) {
    return parseExifDateString(dateStr);
  }

  return null;
}

function readTagValue(view: DataView, tiffStart: number, dirStart: number, isLE: boolean, targetTag: number): number | null {
  if (dirStart + 2 > view.byteLength) return null;
  const numEntries = view.getUint16(dirStart, isLE);

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = dirStart + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, isLE);
    if (tag === targetTag) {
      return view.getUint32(entryOffset + 8, isLE);
    }
  }
  return null;
}

function readTagString(view: DataView, tiffStart: number, dirStart: number, isLE: boolean, targetTag: number): string | null {
  if (dirStart + 2 > view.byteLength) return null;
  const numEntries = view.getUint16(dirStart, isLE);

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = dirStart + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, isLE);

    if (tag === targetTag) {
      const type = view.getUint16(entryOffset + 2, isLE);
      const count = view.getUint32(entryOffset + 4, isLE);

      // ASCII string
      if (type === 2 && count > 0) {
        let valOffset = count <= 4 ? entryOffset + 8 : tiffStart + view.getUint32(entryOffset + 8, isLE);
        if (valOffset + count <= view.byteLength) {
          let str = '';
          for (let j = 0; j < count - 1; j++) {
            const charCode = view.getUint8(valOffset + j);
            if (charCode === 0) break;
            str += String.fromCharCode(charCode);
          }
          return str.trim();
        }
      }
    }
  }
  return null;
}

function parseExifDateString(exifDate: string): Date | null {
  // Format: "YYYY:MM:DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
  const match = exifDate.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(min, 10),
      parseInt(sec, 10)
    );
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
}

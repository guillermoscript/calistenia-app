/**
 * Dependency-free JPEG EXIF reader.
 *
 * Reads DateTimeOriginal (tag 0x9003) from the EXIF APP1 segment of a JPEG.
 * Returns the raw "YYYY:MM:DD HH:MM:SS" string so callers can feed it into
 * parseExifDateTimeToHM without an extra parse step.
 *
 * Returns null for any non-JPEG, malformed EXIF, or missing tag — callers
 * must fall back gracefully (e.g. default to the current local time).
 */

const JPEG_SOI = 0xffd8
const MARKER_APP1 = 0xffe1

// TIFF tags we care about
const TAG_EXIF_IFD_POINTER = 0x8769      // in IFD0 — points to Exif SubIFD
const TAG_DATE_TIME_ORIGINAL = 0x9003    // in ExifIFD

/**
 * Read a 16-bit unsigned integer from a DataView, respecting byte order.
 */
function readUint16(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint16(offset, littleEndian)
}

/**
 * Read a 32-bit unsigned integer from a DataView, respecting byte order.
 */
function readUint32(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint32(offset, littleEndian)
}

/**
 * Walk a TIFF IFD starting at `ifdOffset` (relative to `tiffStart`) and
 * return the value of `targetTag`, or null if not found.
 *
 * For ASCII tags this returns the raw string value.
 * For LONG/SHORT tags this returns the numeric value.
 */
function readIfdTag(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  targetTag: number,
  littleEndian: boolean,
): string | number | null {
  // Guard: need at least 2 bytes for the entry count
  if (tiffStart + ifdOffset + 2 > view.byteLength) return null

  const entryCount = readUint16(view, tiffStart + ifdOffset, littleEndian)
  const ifdBase = tiffStart + ifdOffset + 2

  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifdBase + i * 12
    if (entryOffset + 12 > view.byteLength) break

    const tag = readUint16(view, entryOffset, littleEndian)
    if (tag !== targetTag) continue

    const type = readUint16(view, entryOffset + 2, littleEndian)
    const count = readUint32(view, entryOffset + 4, littleEndian)
    const valueOffset = entryOffset + 8

    // ASCII (type 2): inline if count <= 4 bytes, else at offset
    if (type === 2) {
      const dataSize = count
      if (dataSize === 0) return null
      let dataStart: number
      if (dataSize <= 4) {
        dataStart = valueOffset
      } else {
        dataStart = tiffStart + readUint32(view, valueOffset, littleEndian)
      }
      if (dataStart + dataSize > view.byteLength) return null
      // Decode ASCII bytes, stripping the trailing NUL
      const chars: number[] = []
      for (let c = 0; c < dataSize - 1; c++) {
        chars.push(view.getUint8(dataStart + c))
      }
      return String.fromCharCode(...chars)
    }

    // LONG (type 4) or SHORT (type 3): inline value when fits in 4 bytes
    if (type === 3 && count === 1) {
      return readUint16(view, valueOffset, littleEndian)
    }
    if (type === 4 && count === 1) {
      return readUint32(view, valueOffset, littleEndian)
    }

    return null
  }

  return null
}

/**
 * Parse the TIFF block embedded in an EXIF APP1 payload (starting after
 * the "Exif\0\0" header) and extract DateTimeOriginal.
 *
 * Returns the raw "YYYY:MM:DD HH:MM:SS" string or null.
 */
function parseTiffBlock(buffer: ArrayBuffer, tiffStart: number): string | null {
  const view = new DataView(buffer)

  // Byte order mark: "II" (0x4949) = little-endian, "MM" (0x4D4D) = big-endian
  if (tiffStart + 4 > view.byteLength) return null
  const bom = view.getUint16(tiffStart, false /* always big-endian for BOM read */)
  const littleEndian = bom === 0x4949
  if (bom !== 0x4949 && bom !== 0x4d4d) return null

  // Magic number 0x002A (42)
  const magic = readUint16(view, tiffStart + 2, littleEndian)
  if (magic !== 42) return null

  // Offset to IFD0 (relative to tiffStart)
  const ifd0Offset = readUint32(view, tiffStart + 4, littleEndian)

  // Step 1: find the ExifIFD pointer in IFD0
  const exifIfdPointer = readIfdTag(view, tiffStart, ifd0Offset, TAG_EXIF_IFD_POINTER, littleEndian)
  if (typeof exifIfdPointer !== 'number') return null

  // Step 2: read DateTimeOriginal from ExifIFD
  const dateTimeOriginal = readIfdTag(view, tiffStart, exifIfdPointer, TAG_DATE_TIME_ORIGINAL, littleEndian)
  if (typeof dateTimeOriginal !== 'string' || dateTimeOriginal.length < 19) return null

  return dateTimeOriginal
}

/**
 * Extract the DateTimeOriginal from a JPEG file's EXIF metadata.
 *
 * @param input  A File or Blob (JPEG). Non-JPEG inputs return null immediately.
 * @returns      Raw EXIF string "YYYY:MM:DD HH:MM:SS", or null on any failure.
 */
export async function readPhotoTakenAt(input: File | Blob): Promise<string | null> {
  try {
    // Read only the first 128 KB — EXIF is always in the first APP1 segment
    const slice = input.slice(0, 131_072)
    const buffer = await slice.arrayBuffer()
    const view = new DataView(buffer)

    // Must start with JPEG SOI marker 0xFFD8
    if (view.byteLength < 4) return null
    if (view.getUint16(0, false) !== JPEG_SOI) return null

    // Scan JPEG markers looking for APP1
    let offset = 2
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset, false)
      offset += 2

      if (marker === 0xffda) break // SOS — no more headers after this

      const segmentLength = view.getUint16(offset, false) // includes the 2-byte length field
      offset += 2

      if (marker === MARKER_APP1 && segmentLength >= 8) {
        // Check for "Exif\0\0" header (6 bytes)
        if (
          view.getUint8(offset) === 0x45 && // E
          view.getUint8(offset + 1) === 0x78 && // x
          view.getUint8(offset + 2) === 0x69 && // i
          view.getUint8(offset + 3) === 0x66 && // f
          view.getUint8(offset + 4) === 0x00 && // \0
          view.getUint8(offset + 5) === 0x00    // \0
        ) {
          // TIFF block starts 6 bytes after the segment data start
          return parseTiffBlock(buffer, offset + 6)
        }
      }

      offset += segmentLength - 2 // segmentLength includes the 2-byte length field itself
    }

    return null
  } catch {
    return null
  }
}

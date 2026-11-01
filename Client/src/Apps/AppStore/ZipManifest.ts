import { parseManifest, type AppManifest } from '@landscape/shared';

/**
 * Reads manifest.json out of a zip in the browser (central directory +
 * one deflate entry through DecompressionStream) so the install dialog can
 * show the name and permissions before uploading. The server validates
 * everything again.
 */
export async function readManifestFromZip(file: File): Promise<AppManifest | null> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buffer.buffer);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) return null;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(buffer.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== 'manifest.json' && !name.endsWith('/manifest.json')) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressedSize);
    let text: string;
    if (method === 0) text = decoder.decode(data);
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      text = await new Response(stream).text();
    } else return null;
    const parsed = parseManifest(text);
    return parsed.manifest;
  }
  return null;
}

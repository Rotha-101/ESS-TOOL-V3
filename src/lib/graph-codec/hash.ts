// SHA-256 of a payload, hex encoded.
//
// Two jobs: the server dedupes re-uploads of an unchanged graph by this hash
// (no new revision, no wasted R2 object), and a client that downloaded a
// payload can prove it arrived intact before handing it to the decoder.

/** Available in Electron's renderer and in Workers; both run on Chromium/V8
 *  with WebCrypto, so there is no fallback path to maintain. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a standalone ArrayBuffer: subtle.digest rejects views whose
  // underlying buffer is larger than the view (common after subarray()).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

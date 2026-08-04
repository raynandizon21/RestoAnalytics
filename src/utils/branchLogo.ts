/** Resolve DB/API logo path to a browser URL (same shape as restoAdmin). */

const FALLBACK_BY_NAME: Array<{ match: RegExp; path: string }> = [
  {
    match: /kim/i,
    path: '/uploads/branches/Gemini_Generated_Image_qvu00bqvu00bqvu0_removebg_preview_1__removebg_preview-1779243141910-880719362.webp',
  },
  { match: /blue\s*moon|bluemoon/i, path: '/uploads/branches/BLUEMOON-1779086932595-703143079.webp' },
  { match: /kumho|kum\s*ho|keumho|keum\s*ho|daraejung/i, path: '/uploads/branches/KEUMHO-1779086947532-304637493.webp' },
  { match: /prime/i, path: '/uploads/branches/PRIMEBBQ-1779086971890-786287232.webp' },
  { match: /eesome/i, path: '/uploads/branches/EESOME-1779086940415-679083384.webp' },
];

function normalizePath(logoPath: string): string {
  const path = String(logoPath).trim();
  if (path.startsWith('http')) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

export function resolveBranchLogoUrl(
  logoPath?: string | null,
  branchName?: string | null,
): string | null {
  if (logoPath && String(logoPath).trim()) {
    return normalizePath(logoPath);
  }
  const name = String(branchName || '').trim();
  if (!name) return null;
  const hit = FALLBACK_BY_NAME.find((row) => row.match.test(name));
  return hit ? hit.path : null;
}

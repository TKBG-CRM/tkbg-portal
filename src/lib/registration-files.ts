// Helpers for reconciling the files a client uploads during portal
// registration.
//
// Background: the registration wizard uploads ID / payment files
// *directly* to Supabase Storage under `registration/<token>/` (this
// dodges Vercel's request-body size limit) and only afterwards calls
// `/api/register/submit` to finalise. If that finalise step never
// lands — the client closes the tab, the network drops, the POST errors
// — the uploaded files are stranded in storage with no `documents` row
// pointing at them. Staff then see empty document slots and have no idea
// the client actually uploaded anything.
//
// To make completion self-healing, the finalise step doesn't only trust
// the paths in the request body — it also *sweeps* everything sitting in
// the token's storage folder and links anything it recognises. That way
// a client who completes on a second attempt (or whose first attempt
// orphaned files) still gets every file attached.

export type RegistrationFileKind = "client_id" | "confirmation_of_transfer";

// The wizard names uploads `<timestamp>_id_<name>` and
// `<timestamp>_payment_<name>` (see src/app/register/page.tsx). We use
// that convention to classify files discovered by a folder sweep, where
// we don't have the body's explicit id-vs-payment labelling.
export function classifyRegistrationFile(
  path: string
): RegistrationFileKind | null {
  const file = (path.split("/").pop() || "").toLowerCase();
  if (/_payment_/.test(file)) return "confirmation_of_transfer";
  if (/_id_/.test(file)) return "client_id";
  return null;
}

export interface MergedRegistrationFiles {
  idPaths: string[];
  remittancePaths: string[];
}

/**
 * Merge the explicitly-submitted paths with whatever is actually present
 * in the token's storage folder.
 *
 * - Body paths win and keep their order/classification (the client told
 *   us which file is ID vs payment).
 * - Any extra file found in the folder that isn't already referenced is
 *   appended, classified by filename convention. Unrecognised files are
 *   ignored so we never link mystery objects.
 * - Deduplicated by exact path, so re-running submit (idempotent retry)
 *   never double-links a file.
 */
export function mergeRegistrationFiles(
  bodyIdPaths: string[],
  bodyRemittance: string | null,
  folderPaths: string[]
): MergedRegistrationFiles {
  const idPaths: string[] = [...bodyIdPaths];
  const remittancePaths: string[] = bodyRemittance ? [bodyRemittance] : [];

  const seen = new Set<string>([...idPaths, ...remittancePaths]);

  for (const path of folderPaths) {
    if (seen.has(path)) continue;
    const kind = classifyRegistrationFile(path);
    if (kind === "client_id") {
      idPaths.push(path);
      seen.add(path);
    } else if (kind === "confirmation_of_transfer") {
      remittancePaths.push(path);
      seen.add(path);
    }
    // Unrecognised file — leave it alone.
  }

  return { idPaths, remittancePaths };
}

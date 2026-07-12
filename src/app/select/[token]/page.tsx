import {
  createClient as createAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import SelectionGallery, {
  type GalleryOption,
} from "@/components/select/SelectionGallery";
import {
  selectionOpenState,
  optionImageUrl,
  type SelectionRequestRow,
} from "@/lib/selections";

export const dynamic = "force-dynamic";

// Tokenised facade & colour selection page. No portal session: the token IS
// the credential (64 hex chars, single request, 30 day expiry), validated
// here with the service role — these tables have no anon RLS policies, so
// nothing is readable without going through this server component.
export default async function SelectPage({
  params,
}: {
  params: { token: string };
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return <ClosedShell title="Something went wrong" body="Please try again later." />;
  const token = (params.token ?? "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return <ClosedShell title="This link is not valid" body="Please check the link in your email, or contact your consultant." />;
  }

  const admin = createAdminClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: request } = await admin
    .from("selection_requests")
    .select(
      "id, project_id, status, include_facades, include_external_colours, include_internal_colours, custom_message, facade_option_ids, external_colour_ids, internal_colour_ids, selected_facade_id, selected_external_id, selected_internal_id, completed_at, expires_at, viewed_at"
    )
    .eq("token", token)
    .maybeSingle();
  if (!request) {
    return <ClosedShell title="This link is not valid" body="Please check the link in your email, or contact your consultant." />;
  }
  const req = request as unknown as SelectionRequestRow;

  const { data: project } = await admin
    .from("projects")
    .select("id, name, client_full_name, land_address, land_suburb, sales_rep_id")
    .eq("id", req.project_id)
    .maybeSingle();

  let repName = "Your consultant";
  let repEmail: string | null = null;
  if (project?.sales_rep_id) {
    const { data: rep } = await admin
      .from("user_profiles")
      .select("display_name, email")
      .eq("id", project.sales_rep_id)
      .maybeSingle();
    if (rep?.display_name) repName = rep.display_name as string;
    repEmail = (rep?.email as string | null) ?? null;
  }

  const state = selectionOpenState(req, new Date());
  const address =
    [project?.land_address, project?.land_suburb].filter(Boolean).join(", ") || null;

  if (state === "completed") {
    const chosen = await resolveChosenNames(admin, req);
    return (
      <ClosedShell
        title="Selection received"
        body={`Thank you — your selection${chosen ? ` (${chosen})` : ""} is locked in. ${repName} will be in touch with the next steps.`}
        contact={{ name: repName, email: repEmail }}
      />
    );
  }
  if (state === "closed") {
    return (
      <ClosedShell
        title="This selection link has closed"
        body={`This link has expired or been replaced. ${repName} can send you a fresh one in a minute or two.`}
        contact={{ name: repName, email: repEmail }}
      />
    );
  }

  // First open: stamp viewed (best effort, never blocks the page).
  if (!req.viewed_at) {
    await admin
      .from("selection_requests")
      .update({ viewed_at: new Date().toISOString(), status: "viewed" })
      .eq("id", req.id)
      .eq("status", "sent");
  }

  // Load only the options this request offers. Images may live in the
  // facade-images bucket or link straight to Drive (drive:<id> refs).
  const publicUrl = (path: string) => optionImageUrl(path, url) as string;

  const [{ data: facades }, { data: colours }] = await Promise.all([
    req.facade_option_ids.length
      ? admin
          .from("facade_options")
          .select("id, name, description, image_path, price_delta, sort_order")
          .in("id", req.facade_option_ids)
          .order("sort_order")
          .order("name")
      : Promise.resolve({ data: [] as any[] }),
    req.external_colour_ids.length + req.internal_colour_ids.length
      ? admin
          .from("colour_scheme_options")
          .select("id, scheme_type, name, description, image_path, sort_order")
          .in("id", [...req.external_colour_ids, ...req.internal_colour_ids])
          .order("sort_order")
          .order("name")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const toCard = (o: any): GalleryOption => ({
    id: o.id,
    name: o.name,
    description: o.description ?? null,
    price_delta: o.price_delta != null ? Number(o.price_delta) : null,
    image_url: o.image_path ? publicUrl(o.image_path) : null,
  });

  const externalSet = new Set(req.external_colour_ids);
  const facadeCards = (facades ?? []).map(toCard);
  const externalCards = (colours ?? [])
    .filter((c: any) => c.scheme_type === "external" && externalSet.has(c.id))
    .map(toCard);
  const internalCards = (colours ?? [])
    .filter((c: any) => c.scheme_type === "internal" && !externalSet.has(c.id))
    .map(toCard);

  const firstName = (project?.client_full_name ?? "").split(" ")[0] || "there";

  return (
    <SelectionGallery
      token={token}
      firstName={firstName}
      address={address}
      customMessage={req.custom_message}
      repName={repName}
      facades={req.include_facades ? facadeCards : []}
      externalColours={req.include_external_colours ? externalCards : []}
      internalColours={req.include_internal_colours ? internalCards : []}
      visualiserEnabled={!!process.env.GEMINI_API_KEY}
    />
  );
}

async function resolveChosenNames(
  admin: SupabaseClient,
  req: SelectionRequestRow
): Promise<string | null> {
  const names: string[] = [];
  if (req.selected_facade_id) {
    const { data } = await admin
      .from("facade_options")
      .select("name")
      .eq("id", req.selected_facade_id)
      .maybeSingle();
    if (data?.name) names.push(data.name as string);
  }
  const colourIds = [req.selected_external_id, req.selected_internal_id].filter(
    Boolean
  ) as string[];
  if (colourIds.length) {
    const { data } = await admin
      .from("colour_scheme_options")
      .select("id, name")
      .in("id", colourIds);
    for (const c of data ?? []) names.push((c as any).name as string);
  }
  return names.length ? names.join(", ") : null;
}

// Branded closed/complete/invalid shell — mirrors the portal's black brand
// bar + gold accent without requiring the authenticated layout.
function ClosedShell({
  title,
  body,
  contact,
}: {
  title: string;
  body: string;
  contact?: { name: string; email: string | null };
}) {
  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <header className="bg-black py-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/TURNKEY_WORDMARK_WHITE.svg"
          alt="Turnkey"
          className="mx-auto h-8"
        />
      </header>
      <div className="h-[2px] bg-brand-gold" />
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="font-heading text-2xl font-bold text-black">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">{body}</p>
        {contact && (
          <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-brand-gold">
              Your consultant
            </div>
            <div className="mt-1 font-medium text-black">{contact.name}</div>
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="text-neutral-600 underline underline-offset-2"
              >
                {contact.email}
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

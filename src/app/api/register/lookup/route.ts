import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/register/lookup?token=<registration_token>
 *
 * Public endpoint used by the self-registration page to fetch the pre-filled
 * contact details. Runs with the service role so RLS does not block the
 * anonymous client, but only returns non-sensitive fields.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("contacts")
    .select(
      "id, first_name, middle_name, last_name, email, phone, address_line1, suburb, state, postcode, is_registered, registration_token_used_at"
    )
    .eq("registration_token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (data.registration_token_used_at || data.is_registered) {
    return NextResponse.json(
      { error: "This registration link has already been used." },
      { status: 410 }
    );
  }

  // Pull the lot number from the client's project (if one exists) so the
  // onboarding deposit step can auto-fill the bank-transfer reference
  // ("{Lot Number} {Last Name}"). Lot lives on projects, not contacts.
  let lotNumber: string | null = null;
  const { data: projects } = await admin
    .from("projects")
    .select("land_lot_number")
    .eq("client_id", data.id)
    .limit(1);
  const lot = projects?.[0]?.land_lot_number;
  if (typeof lot === "string" && lot.trim()) {
    lotNumber = lot.trim();
  } else if (typeof lot === "number") {
    lotNumber = String(lot);
  }

  return NextResponse.json({
    contact: {
      id: data.id,
      first_name: data.first_name,
      middle_name: data.middle_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      address_line1: data.address_line1,
      suburb: data.suburb,
      state: data.state,
      postcode: data.postcode,
      lot_number: lotNumber,
    },
  });
}

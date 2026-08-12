import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { validateContact, sanitize, rateLimit } from '@/lib/validation'
import { findCustomerByPhone } from '@/lib/phoneMatch'
import { postToDiscord, DISCORD_COLORS } from '@/lib/discord'
import { TILE_KIT, isServiceTown } from '@/data/tileKit'

// POST /api/tile-kit
//
// Tile Match Kit intake. Deliberately saves the lead to Supabase BEFORE
// sending anyone to Stripe: the deposit flow's `checkout.session.completed`
// webhook is registered on the apex domain, which redirects to www, so
// webhook delivery cannot be relied on to be the thing that creates a lead.
// Here payment only *upgrades* a lead that already exists. Worst case we
// capture an unpaid but fully-qualified quote request — which is still the
// same lead the /quote form would have produced.
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limit = rateLimit(ip, { maxRequests: 5, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const name = sanitize(body.name || '')
    const email = sanitize(body.email || '')
    const phone = sanitize(body.phone || '')
    const town = sanitize(body.town || '')
    const address = sanitize(body.address || '')
    const room = sanitize(body.room || 'other')
    const budget = sanitize(body.budget || '')
    const timeline = sanitize(body.timeline || '')
    const squareFeet = sanitize(body.squareFeet || '')
    const notes = sanitize(body.notes || '')

    const styles: string[] = Array.isArray(body.styles)
      ? body.styles.slice(0, 6).map((s: unknown) => sanitize(String(s ?? '')))
      : []

    // Email required here (unlike /api/quotes) — the kit confirmation and the
    // credit reminder both go by email, and there's a physical drop-off to
    // coordinate.
    const errors = validateContact({ name, email, phone }, { requireEmail: true })
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    if (!isServiceTown(town)) {
      return NextResponse.json(
        { error: 'Kits are hand-delivered inside our service area only.', field: 'town' },
        { status: 400 }
      )
    }

    if (styles.length === 0) {
      return NextResponse.json(
        { error: 'Pick at least one style so we know what to pull.', field: 'styles' },
        { status: 400 }
      )
    }

    const answers: Record<string, string> = {
      offer: 'tile-match-kit',
      styles: styles.join(', '),
      room,
      budget,
      timeline,
      square_feet: squareFeet,
      town,
      address,
      kit_price: `$${TILE_KIT.price}`,
      install_credit: `$${TILE_KIT.installCredit}`,
      payment_status: 'unpaid',
      ...(notes ? { notes } : {}),
    }

    const supabase = createServiceClient()

    // Reuse the same identity resolution the quote intake uses so a kit buyer
    // who already texted Vince lands on their existing customer record instead
    // of forking their history.
    let customerId: string | null = null
    const { data: byEmail } = await supabase
      .from('customers')
      .select('id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    if (byEmail) customerId = byEmail.id

    if (!customerId && phone) {
      const match = await findCustomerByPhone<{ id: string; phone: string | null }>(
        supabase,
        phone,
        'id, phone'
      )
      if (match) customerId = match.id
    }

    if (!customerId) {
      const { data: created } = await supabase
        .from('customers')
        .insert({ name, email, phone: phone || null, source: 'website' })
        .select('id')
        .single()
      if (created) customerId = created.id
    }

    const { data: quoteRequest, error: insertError } = await supabase
      .from('quote_requests')
      .insert({
        client_name: name,
        client_email: email,
        client_phone: phone,
        project_type: room,
        answers,
        status: 'new',
        source: 'tile-match-kit',
        customer_id: customerId,
        // "This month" buyers get worked first — they already paid to shortlist.
        // Values are constrained to high/medium/low by migration 018.
        priority: timeline === 'asap' ? 'high' : 'medium',
      })
      .select('id')
      .single()

    if (insertError || !quoteRequest) {
      console.error('[TileKit] Failed to save lead:', insertError?.message)
      return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 })
    }

    // Alert regardless of whether they finish checkout — a qualified lead that
    // abandons at the payment step is still worth a call.
    postToDiscord({
      username: 'Tile Match Kit',
      embeds: [
        {
          title: `🎨 Kit request: ${name} (${town})`,
          description: 'Lead saved. Awaiting Stripe checkout.',
          color: DISCORD_COLORS.blue,
          fields: [
            { name: 'Project', value: room, inline: true },
            { name: 'Timeline', value: timeline || 'not given', inline: true },
            { name: 'Styles', value: styles.join(', ') || 'none', inline: false },
            { name: 'Phone', value: phone || 'none', inline: true },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    }).catch((err) => console.error('[TileKit] Discord alert failed:', err))

    if (!isStripeConfigured()) {
      // No payments configured (local dev) — the lead is already captured, so
      // send them to the thank-you page rather than failing the submission.
      return NextResponse.json({ url: `/tile-samples/thanks?ref=${quoteRequest.id}`, demo: true })
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || req.nextUrl.origin

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: TILE_KIT.price * 100,
            product_data: {
              name: `Tile Match Kit — ${TILE_KIT.sampleCount} samples`,
              description: `Hand-picked tile samples delivered in ${town}. $${TILE_KIT.installCredit} credited toward your install.`,
            },
          },
          quantity: 1,
        },
      ],
      customer_email: email,
      metadata: {
        type: 'tile_kit',
        quote_request_id: quoteRequest.id,
        customer_id: customerId ?? '',
        town,
        room,
      },
      success_url: `${baseUrl}/tile-samples/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/tile-samples?checkout=cancelled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[TileKit] intake error:', message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

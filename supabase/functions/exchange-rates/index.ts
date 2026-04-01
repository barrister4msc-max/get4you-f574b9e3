const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Free API — no key needed. Returns rates relative to USD.
const API_URL = 'https://open.er-api.com/v6/latest/USD'

let cache: { rates: Record<string, number>; fetchedAt: number } | null = null
const CACHE_TTL = 3600_000 // 1 hour

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const now = Date.now()
    if (!cache || now - cache.fetchedAt > CACHE_TTL) {
      const res = await fetch(API_URL)
      if (!res.ok) throw new Error(`Exchange API error: ${res.status}`)
      const data = await res.json()
      cache = { rates: data.rates, fetchedAt: now }
    }

    return new Response(JSON.stringify({ rates: cache.rates, fetchedAt: cache.fetchedAt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

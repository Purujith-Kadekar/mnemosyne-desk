// ============================================================
//  /api/health - is the planner store actually reachable?
//
//  GET /api/health           shallow: env presence + last store error
//  GET /api/health?deep=1    one real Firestore round-trip
//
//  Same auth as /api/sync: when SYNC_API_KEY is set, X-Api-Key is
//  required. The response never includes credentials, only the
//  project id and the exact error message.
// ============================================================

import { storeStatus, probe } from '../../../lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(req) {
  const key = process.env.SYNC_API_KEY;
  if (!key) return true;
  const sent = req.headers.get('x-api-key') || '';
  if (sent === key) return true;
  // Same-origin planner UI (see /api/sync): allowed without the device key.
  if (req.headers.get('sec-fetch-site') === 'same-origin') return true;
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin && host) {
    try { if (new URL(origin).host === host) return true; } catch { /* bad origin */ }
  }
  return false;
}

export async function GET(req) {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const deep = url.searchParams.get('deep') === '1';
  const store = storeStatus();
  const body = {
    ok: true,
    app: 'planner',
    time: new Date().toISOString(),
    env: {
      syncKey: !!process.env.SYNC_API_KEY,
      firebaseServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    },
    store,
  };
  if (deep) {
    body.probe = await probe();
    // A configured-but-unreachable store is a real failure: say so loudly
    // instead of letting the UI show "Not connected" with no reason.
    if (store.configured && !body.probe.ok) {
      body.ok = false;
      body.error = body.probe.error;
    }
  } else if (store.configured && store.error) {
    body.ok = false;
    body.error = store.error;
  }
  return Response.json(body, {
    status: body.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

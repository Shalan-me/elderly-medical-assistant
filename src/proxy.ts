import type { NextRequest } from 'next/server'

import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/records/:path*',
    '/overview/:path*',
    '/medications/:path*',
    '/chat/:path*',
  ],
}

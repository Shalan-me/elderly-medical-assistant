function requireEnvironmentVariable(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing ${name} environment variable`)
  }

  return value
}

const supabaseUrl = requireEnvironmentVariable(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
)

const supabasePublishableKey = requireEnvironmentVariable(
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
)

export { supabasePublishableKey, supabaseUrl }

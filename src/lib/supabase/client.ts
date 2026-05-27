// Phase 3: browser-side stub. No DB or pg import — `pg` is Node-only and
// would crash the browser bundle. Any data call routes through `/api/*`
// endpoints (server-side) backed by the Neon-backed compat client.
//
// Components using this client for `.auth.signOut()` should switch to
// `signOut()` from 'next-auth/react' directly (see sidebar.tsx for the
// migrated pattern). The auth.* methods below are no-op stubs that exist
// only so legacy imports compile during the transition.

type AnyFn = (...args: unknown[]) => unknown

function deny(name: string): AnyFn {
  return () => {
    throw new Error(
      `[supabase compat] Browser-side ${name}() is not supported in Phase 3. ` +
        `Move the call to an API route, or use NextAuth (signIn/signOut/useSession) for auth.`
    )
  }
}

export function createClient() {
  return {
    from: deny('.from') as unknown as never,
    rpc: deny('.rpc') as unknown as never,
    storage: {
      from: () => ({
        getPublicUrl: (_p: string) => ({ data: { publicUrl: '' } }),
        upload: deny('storage.upload'),
        remove: deny('storage.remove'),
        createSignedUrl: deny('storage.createSignedUrl'),
        download: deny('storage.download'),
      }),
    },
    auth: {
      signOut: async () => {
        throw new Error("Use signOut from 'next-auth/react' instead of supabase.auth.signOut")
      },
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: (_cb: unknown) => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }
}

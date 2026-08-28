import { Button } from "@/components/ui/button";
import { signOutOwner } from "@/lib/auth/actions";

// The `(owner)` group. **Everything that reads the library lives here** — this is the
// group the proxy's matcher covers and the group whose pages `src/app/gated.test.ts`
// requires to call `requireOwner()`. A new screen goes in here; see the README.
//
// Note that the wall does **not** live in this layout. A layout does not run for a
// Server Function, which is why the assert is called by each page and each `actions.ts`
// instead. This layout is chrome, and the sign-out affordance, and nothing else.

// Every gated response carries a `Set-Cookie`, so it can never be cached. Forcing the
// whole group dynamic means no route under it can be prerendered by accident —
// including a screen a later slice adds that reads nothing and would otherwise qualify,
// and which would then ship one visitor's session inside a static payload.
export const dynamic = "force-dynamic";

export default function OwnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      {/* The way out, deliberately quiet and at the end of the page rather than in the
          chrome: with a 90-day session a stray tap on a phone costs a round trip to
          Google. It earns its place because ending the session is the only way out of
          a cookie issued to an address that is no longer the owner's. */}
      <footer className="mx-auto w-full max-w-2xl px-5 pb-10 sm:px-8">
        <form action={signOutOwner} className="border-t border-border pt-4">
          <Button type="submit" variant="ghost" size="sm" className="-ml-2.5 text-muted-foreground">
            Sign out
          </Button>
        </form>
      </footer>
    </>
  );
}

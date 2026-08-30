import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/auth/actions";

// The only screen a non-owner can reach, so it shows **nothing about the library** —
// not how many Volumes are on the shelf, not a Story's title, not that there is
// anything in there at all. A wordmark, a line saying what this is, and one button.
//
// It carries no chrome either: navigation would name screens a visitor may not open.
//
// Visually it is the home page's own voice and nothing new: the same mark, the same mono
// eyebrow, the same hairline rule, the same paper and ink. The decision here is restraint
// executed precisely — centred on the phone, centred on the desktop, one full-width touch
// target — and the one thing it does say is the mark, because a stranger should be able to
// tell that they have arrived somewhere rather than at a login form.

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Auth.js sends its own failures here rather than to its default error page,
  // `AccessDenied` among them — which is what a Google account that is not the
  // owner's gets. Which address *would* work is not a visitor's business.
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-10 sm:px-8">
      <div>
        {/* The mark, at the size it was drawn to survive. It is the pile the application
            is named after, and this is the one screen a stranger ever sees. */}
        <h1 className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <Mark className="size-5 shrink-0 text-foreground" />
          tsundoku
        </h1>
        <p className="mt-4 border-t border-border pt-4 text-pretty text-sm leading-relaxed">
          A private library — what has been read, what it was worth, what is on the shelf. One
          Google address gets in.
        </p>
      </div>

      <form action={signInWithGoogle}>
        {/* The one thing anyone taps here, so it is a full touch target rather than
            the primitive's default height. */}
        <Button type="submit" size="lg" className="h-11 w-full">
          Sign in with Google
        </Button>
      </form>

      {error ? (
        <p className="text-xs leading-relaxed text-destructive">
          That Google account cannot sign in. This library admits one address, and the sign-in
          reached it with another.
        </p>
      ) : null}
    </main>
  );
}

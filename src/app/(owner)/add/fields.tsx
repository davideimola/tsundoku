import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// **THE TWO CONTROLS THIS SCREEN IS BUILT OUT OF**, lifted out of `page.tsx` so that the half
// of the door running in the browser draws the same box as the half that does not (#48).
//
// Neither is a Server Component and neither is a client one: they read no session, call no
// query and hold no state, so they are shared components and each half of the door compiles
// them into itself. That is the whole reason they could move — a control the object half drew
// for itself would be the same field at two heights on one form.

/**
 * A picker over a vocabulary — Type, Binding, Series.
 *
 * A native select rather than a scripted one: on a phone it opens the platform picker, and it
 * submits whether JavaScript ran or not. Every vocabulary here is read rather than written
 * down (ADR-0006), so a seventh Binding appears on this screen without this file being touched.
 */
export function Picker({
  id,
  name,
  label,
  chosen,
  onChoose,
  any,
  required,
  children,
}: {
  id: string;
  name: string;
  label: string;
  /** What was chosen on a press that came back refused, where there was one. */
  chosen?: string;
  /**
   * Told what was chosen, where the screen around the picker answers it (#48).
   *
   * Two of these decide something the moment they are turned rather than at submit — the
   * Series decides what narrative the list already holds, the Binding decides which Type a new
   * one arrives as — and given this they are controlled from out there. Absent, the picker
   * holds its own answer and submits it, which is what the two about a narrative still do.
   */
  onChoose?: (chosen: string) => void;
  /** The wording for "none in particular", or for the choice nobody has made yet. */
  any?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        name={name}
        {...(onChoose
          ? { value: chosen ?? "", onChange: (event) => onChoose(event.target.value) }
          : { defaultValue: chosen ?? "" })}
        required={required}
        className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30"
      >
        {any ? <option value="">{any}</option> : null}
        {children}
      </select>
    </div>
  );
}

export function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  const fieldId = `say-${name}`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {/* 44px under a thumb, and the desk's own 40px from `sm` up. Every control the owner
          reaches for one-handed in a shop is drawn at this height. */}
      <Input id={fieldId} name={name} className="h-11 sm:h-10" {...props} />
    </div>
  );
}

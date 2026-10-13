// Maroon strip across the top of every signed-in screen: tells people this is
// a module of Ekhaya Connect and gives them the way back. Hidden when printing.
const EKHAYA_CONNECT_URL =
  process.env.NEXT_PUBLIC_EKHAYA_CONNECT_URL || "https://shakabornman.github.io/ekhaya-connect/";

export function EkhayaConnectStrip() {
  return (
    <div className="print:hidden border-b-[3px] border-brand-lime bg-strip text-strip-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 text-sm">
        <span>
          <span className="font-semibold">Ekhaya Connect</span>
          <span className="opacity-70"> › HR Payroll</span>
        </span>
        <a
          href={EKHAYA_CONNECT_URL}
          className="rounded-md px-2 py-0.5 font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-lime"
        >
          ← Back to Ekhaya Connect
        </a>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

/** Renders Ari's plain-text reply: a lead answer, "- " bullets, and **bold**. No raw markdown symbols reach the screen. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>
      : <span key={index}>{part.replace(/\*\*/g, "")}</span>,
  );
}

export function AriReply({ text }: { text: string }) {
  const blocks: Array<{ kind: "p" | "ul"; lines: string[] }> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.kind === "ul") last.lines.push(bullet[1]);
      else blocks.push({ kind: "ul", lines: [bullet[1]] });
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
  }
  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) =>
        block.kind === "ul" ? (
          <ul key={index} className="space-y-1.5">
            {block.lines.map((line, i) => (
              <li key={i} className="flex gap-2"><span aria-hidden="true" className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" /><span>{inline(line)}</span></li>
            ))}
          </ul>
        ) : (
          <p key={index} className={/^you could say:/i.test(block.lines[0]) ? "rounded-md bg-sky-500/10 px-2.5 py-1.5 italic" : undefined}>{inline(block.lines[0])}</p>
        ),
      )}
    </div>
  );
}

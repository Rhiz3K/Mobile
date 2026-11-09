/**
 * Cursor-key bytes for programs that turn on DECCKM.
 *
 * xterm-256color's terminfo lists Right as `kcuf1=\EOC`. `less` (what
 * `systemctl status` runs, with `LESS=FRSXMK`) sends `smkx` (`ESC [ ? 1 h`)
 * and then only scrolls a chopped line when it reads that SS3 sequence.
 * `ESC [ C` still moves the cursor in readline, so the key looks fine at a
 * prompt and dead in the pager.
 */

export interface CursorModifiers {
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  /** DEC private mode 1, application cursor keys. */
  cursorApplication?: boolean;
}

const ARROWS: Record<string, string> = {
  ArrowUp: "A",
  ArrowDown: "B",
  ArrowRight: "C",
  ArrowLeft: "D",
};

const CURSOR_PAD: Record<string, string> = {
  ...ARROWS,
  Home: "H",
  End: "F",
};

/** xterm modifier parameter: 1 + shift + 2*alt + 4*ctrl. */
function modifierParameter(options: CursorModifiers): number {
  return (
    (options.shift ? 1 : 0) + (options.alt ? 2 : 0) + (options.ctrl ? 4 : 0)
  );
}

/**
 * Bytes for an arrow, Home, or End. Null for any other name, and for Home
 * or End in normal mode so the older alt-prefix path can keep them.
 */
export function encodeCursorKey(
  name: string,
  options: CursorModifiers = {},
): string | null {
  const letter = CURSOR_PAD[name];
  if (!letter) return null;
  const application = !!options.cursorApplication;
  const mod = modifierParameter(options);
  const arrow = name in ARROWS;

  if (mod === 0) {
    if (application) return `\x1bO${letter}`;
    return arrow ? `\x1b[${letter}` : null;
  }
  if (!arrow && !application) return null;
  return `\x1b[1;${mod + 1}${letter}`;
}

const SEQUENCE_NAMES: Record<string, string> = {
  "\x1b[A": "ArrowUp",
  "\x1bOA": "ArrowUp",
  "\x1b[B": "ArrowDown",
  "\x1bOB": "ArrowDown",
  "\x1b[C": "ArrowRight",
  "\x1bOC": "ArrowRight",
  "\x1b[D": "ArrowLeft",
  "\x1bOD": "ArrowLeft",
};

/**
 * A keyboard that commits a hardcoded arrow (`ESC [ C`) instead of a key
 * event. Re-encode it for the mode the program actually turned on.
 */
export function normalizeCommittedArrows(
  text: string,
  cursorApplication: boolean,
): string {
  const name = SEQUENCE_NAMES[text];
  if (!name) return text;
  return encodeCursorKey(name, { cursorApplication }) ?? text;
}

type Phase = "ground" | "esc" | "csi";

/**
 * Tracks DECCKM from PTY output. `ESC [ ? 1 h` sets it (including when 1 is
 * one of several private modes) and `ESC [ ? 1 l` clears it. `ESC c` resets.
 */
export class CursorKeyMode {
  application = false;
  private phase: Phase = "ground";
  private privateMode = false;
  private params: number[] = [];
  private current = 0;
  private sawDigit = false;
  private ignore = false;

  reset() {
    this.application = false;
    this.phase = "ground";
    this.clearCsi();
  }

  feed(data: string) {
    for (let i = 0; i < data.length; i++) this.accept(data.charCodeAt(i));
  }

  private clearCsi() {
    this.privateMode = false;
    this.params = [];
    this.current = 0;
    this.sawDigit = false;
    this.ignore = false;
  }

  private accept(code: number) {
    if (code === 0x1b && this.phase !== "ground" && this.phase !== "esc") {
      this.phase = "esc";
      this.clearCsi();
      return;
    }
    if (this.phase === "ground") {
      if (code === 0x1b) this.phase = "esc";
      return;
    }
    if (this.phase === "esc") {
      if (code === 0x5b) {
        this.phase = "csi";
        this.clearCsi();
        return;
      }
      if (code === 0x63) this.application = false;
      this.phase = "ground";
      return;
    }
    this.csi(code);
  }

  private csi(code: number) {
    if (code === 0x1b) {
      this.phase = "esc";
      this.clearCsi();
      return;
    }
    if (
      code === 0x3f &&
      this.params.length === 0 &&
      !this.sawDigit &&
      !this.privateMode
    ) {
      this.privateMode = true;
      return;
    }
    if (code >= 0x30 && code <= 0x39) {
      this.current = this.current * 10 + (code - 0x30);
      this.sawDigit = true;
      return;
    }
    if (code === 0x3b) {
      this.params.push(this.sawDigit ? this.current : 0);
      this.current = 0;
      this.sawDigit = false;
      return;
    }
    if (code >= 0x20 && code <= 0x2f) {
      this.ignore = true;
      return;
    }
    if (!this.ignore && this.privateMode && (code === 0x68 || code === 0x6c)) {
      if (this.finishParams().includes(1)) this.application = code === 0x68;
    }
    this.phase = "ground";
    this.clearCsi();
  }

  private finishParams(): number[] {
    if (this.sawDigit) return [...this.params, this.current];
    if (this.params.length === 0) return [];
    return [...this.params, 0];
  }
}

package expo.modules.termixterminal

/**
 * Cursor-key bytes, and whether the program has turned on DECCKM.
 *
 * `less` (used by `systemctl status`) sends `smkx`, which is `ESC [ ? 1 h`,
 * then only treats Right as a horizontal scroll when the key comes back as
 * `ESC O C`. `ESC [ C` still edits a shell line, so the same key looks fine
 * at a prompt and does nothing in the pager.
 */
internal class CursorKeys {
  var application = false
    private set

  private var phase = Phase.GROUND
  private var privateMode = false
  private val params = ArrayList<Int>(4)
  private var current = 0
  private var sawDigit = false
  private var ignore = false

  @Synchronized
  fun reset() {
    application = false
    phase = Phase.GROUND
    clearCsi()
  }

  @Synchronized
  fun feed(data: ByteArray) {
    for (b in data) accept(b.toInt() and 0xff)
  }

  @Synchronized
  fun isApplication(): Boolean = application

  private fun clearCsi() {
    privateMode = false
    params.clear()
    current = 0
    sawDigit = false
    ignore = false
  }

  private fun accept(code: Int) {
    if (code == 0x1b && phase != Phase.GROUND && phase != Phase.ESC) {
      phase = Phase.ESC
      clearCsi()
      return
    }
    when (phase) {
      Phase.GROUND -> if (code == 0x1b) phase = Phase.ESC
      Phase.ESC -> when (code) {
        // ESC ESC c is a reset. Dropping the second ESC would leave DECCKM on.
        0x1b -> Unit
        0x5b -> {
          phase = Phase.CSI
          clearCsi()
        }
        else -> {
          if (code == 0x63) application = false
          phase = Phase.GROUND
        }
      }
      Phase.CSI -> csi(code)
    }
  }

  private fun csi(code: Int) {
    if (code == 0x1b) {
      phase = Phase.ESC
      clearCsi()
      return
    }
    if (code == 0x3f && params.isEmpty() && !sawDigit && !privateMode) {
      privateMode = true
      return
    }
    if (code in 0x30..0x39) {
      current = current * 10 + (code - 0x30)
      sawDigit = true
      return
    }
    if (code == 0x3b) {
      params.add(if (sawDigit) current else 0)
      current = 0
      sawDigit = false
      return
    }
    if (code in 0x20..0x2f) {
      ignore = true
      return
    }
    if (!ignore && privateMode && (code == 0x68 || code == 0x6c)) {
      if (1 in finishParams()) application = code == 0x68
    }
    phase = Phase.GROUND
    clearCsi()
  }

  private fun finishParams(): List<Int> {
    if (sawDigit) return params + current
    if (params.isEmpty()) return emptyList()
    return params + 0
  }

  private enum class Phase { GROUND, ESC, CSI }

  companion object {
    private val ARROWS = mapOf(
      "ArrowUp" to "A",
      "ArrowDown" to "B",
      "ArrowRight" to "C",
      "ArrowLeft" to "D",
    )
    private val PAD = ARROWS + mapOf("Home" to "H", "End" to "F")

    /** Null when this name is not a cursor key, or Home/End in normal mode. */
    fun sequence(
      name: String,
      shift: Boolean,
      ctrl: Boolean,
      alt: Boolean,
      meta: Boolean,
      application: Boolean,
    ): String? {
      val letter = PAD[name] ?: return null
      // Same parameter the native encoder uses: 1 + shift + 2*alt + 4*ctrl + 8*meta.
      val mod = (if (shift) 1 else 0) + (if (alt) 2 else 0) + (if (ctrl) 4 else 0) +
        (if (meta) 8 else 0)
      if (mod == 0) {
        if (application) return "\u001bO$letter"
        return if (name in ARROWS) "\u001b[$letter" else null
      }
      if (name !in ARROWS && !application) return null
      return "\u001b[1;${mod + 1}$letter"
    }

    /** An arrow a keyboard committed as text, in either cursor mode. */
    fun nameOfSequence(text: String): String? = when (text) {
      "\u001b[A", "\u001bOA" -> "ArrowUp"
      "\u001b[B", "\u001bOB" -> "ArrowDown"
      "\u001b[C", "\u001bOC" -> "ArrowRight"
      "\u001b[D", "\u001bOD" -> "ArrowLeft"
      else -> null
    }
  }
}

package expo.modules.termixterminal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CursorKeysTest {
  @Test
  fun rightArrowIsSs3OnlyWhileDecckmIsOn() {
    assertEquals("\u001b[C", CursorKeys.sequence("ArrowRight", false, false, false, false))
    assertEquals("\u001bOC", CursorKeys.sequence("ArrowRight", false, false, false, true))
    assertEquals("\u001bOA", CursorKeys.sequence("ArrowUp", false, false, false, true))
    assertEquals("\u001bOB", CursorKeys.sequence("ArrowDown", false, false, false, true))
    assertEquals("\u001bOD", CursorKeys.sequence("ArrowLeft", false, false, false, true))
    assertEquals("\u001bOH", CursorKeys.sequence("Home", false, false, false, true))
    assertNull(CursorKeys.sequence("Home", false, false, false, false))
    assertNull(CursorKeys.sequence("Tab", false, false, false, true))
  }

  @Test
  fun modifiersUseTheXtermParameter() {
    assertEquals("\u001b[1;2C", CursorKeys.sequence("ArrowRight", true, false, false, true))
    assertEquals("\u001b[1;5C", CursorKeys.sequence("ArrowRight", false, true, false, false))
    assertEquals("\u001b[1;3D", CursorKeys.sequence("ArrowLeft", false, false, true, false))
    assertEquals("\u001b[1;6C", CursorKeys.sequence("ArrowRight", true, true, false, true))
  }

  @Test
  fun smkxFromLessTurnsApplicationCursorKeysOn() {
    val keys = CursorKeys()
    assertFalse(keys.isApplication())
    keys.feed("ready\u001b[?1h\u001b=".toByteArray())
    assertTrue(keys.isApplication())
    keys.feed("\u001b[?1l\u001b>".toByteArray())
    assertFalse(keys.isApplication())
  }

  @Test
  fun modeOneAmongOtherPrivateModes() {
    val keys = CursorKeys()
    keys.feed("\u001b[?25h".toByteArray())
    assertFalse(keys.isApplication())
    keys.feed("\u001b[?1049;1h".toByteArray())
    assertTrue(keys.isApplication())
    keys.feed("\u001b[?25l".toByteArray())
    assertTrue(keys.isApplication())
    keys.feed("\u001bc".toByteArray())
    assertFalse(keys.isApplication())
  }

  @Test
  fun aSequenceSplitAcrossReadsStillCounts() {
    val keys = CursorKeys()
    keys.feed("\u001b[?".toByteArray())
    assertFalse(keys.isApplication())
    keys.feed("1h".toByteArray())
    assertTrue(keys.isApplication())
  }

  @Test
  fun committedCsiIsTheSameArrowAsSs3() {
    assertEquals("ArrowRight", CursorKeys.nameOfSequence("\u001b[C"))
    assertEquals("ArrowRight", CursorKeys.nameOfSequence("\u001bOC"))
    assertNull(CursorKeys.nameOfSequence("ls"))
  }
}

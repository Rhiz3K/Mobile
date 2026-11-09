package expo.modules.termixterminal

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DoubleTapTabTest {
  @Test
  fun offKeepsTheTerminalsOwnDoubleTap() {
    assertFalse(DoubleTapTab.sendsTab(false, false, false, false))
  }

  @Test
  fun aCleanDoubleTapSendsTabWhenAsked() {
    assertTrue(DoubleTapTab.sendsTab(true, false, false, false))
  }

  @Test
  fun mouseLinkAndSelectionStayOnTheTerminal() {
    assertFalse(DoubleTapTab.sendsTab(true, true, false, false))
    assertFalse(DoubleTapTab.sendsTab(true, false, true, false))
    assertFalse(DoubleTapTab.sendsTab(true, false, false, true))
  }
}

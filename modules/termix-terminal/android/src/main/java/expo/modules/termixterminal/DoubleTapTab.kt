package expo.modules.termixterminal

/**
 * Whether a double tap sends Tab. Same rule as
 * src/features/terminal/doubleTapTab.ts (`doubleTapAction`): off keeps word
 * selection, and a mouse-tracking program, a link, or a selection already on
 * screen keeps it too. Scrolling and a long press never ask.
 */
internal object DoubleTapTab {
  fun sendsTab(
    enabled: Boolean,
    mouse: Boolean,
    link: Boolean,
    selecting: Boolean
  ): Boolean = enabled && !mouse && !link && !selecting
}

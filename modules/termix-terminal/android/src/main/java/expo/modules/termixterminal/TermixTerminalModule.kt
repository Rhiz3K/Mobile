package expo.modules.termixterminal

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class TermixTerminalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TermixTerminal")

    Constant("engineLoaded") { GhosttyVt.loaded }

    View(TermixTerminalView::class) {
      Events("onInput", "onResize", "onBell", "onTitleChange")

      Prop("fontSize") { view: TermixTerminalView, size: Float ->
        view.setFontSize(size)
      }

      Prop("theme") { view: TermixTerminalView, theme: TerminalThemeRecord? ->
        view.setTheme(theme)
      }

      AsyncFunction("write") { view: TermixTerminalView, base64: String ->
        val data = try {
          Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
          throw InvalidBase64Exception(e)
        }
        view.write(data)
      }

      AsyncFunction("paste") { view: TermixTerminalView, text: String -> view.paste(text) }
      AsyncFunction("scrollToBottom") { view: TermixTerminalView -> view.scrollToBottom() }
      AsyncFunction("copySelection") { view: TermixTerminalView -> view.copySelection() }
      AsyncFunction("focus") { view: TermixTerminalView -> view.focusTerminal() }
      AsyncFunction("blur") { view: TermixTerminalView -> view.blurTerminal() }
      AsyncFunction("getStats") { view: TermixTerminalView -> view.stats() }

      OnViewDestroys { view: TermixTerminalView -> view.destroy() }
    }
  }
}

internal class InvalidBase64Exception(cause: Throwable) :
  CodedException("expected base64 terminal output", cause)

internal class TerminalThemeRecord : Record {
  @Field val background: String? = null
  @Field val foreground: String? = null
  @Field val cursorColor: String? = null
  @Field val selectionBackground: String? = null
  @Field val selectionForeground: String? = null
  @Field val palette: List<String?>? = null
}

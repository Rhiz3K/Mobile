import ExpoModulesCore

public class TermixTerminalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TermixTerminal")

    Constant("engineLoaded") { true }

    View(TermixTerminalView.self) {
      Events("onInput", "onResize", "onBell", "onTitleChange")

      Prop("fontSize") { (view: TermixTerminalView, size: Float?) in
        view.fontSize = size
      }

      Prop("theme") { (view: TermixTerminalView, theme: TerminalThemeRecord?) in
        view.applyTheme(theme)
      }

      AsyncFunction("write") { (view: TermixTerminalView, base64: String) in
        guard let data = Data(base64Encoded: base64) else {
          throw InvalidBase64Exception()
        }
        view.write(data)
      }.runOnQueue(.main)

      AsyncFunction("paste") { (view: TermixTerminalView, text: String) in
        view.paste(text)
      }.runOnQueue(.main)

      AsyncFunction("scrollToBottom") { (view: TermixTerminalView) in
        view.scrollToBottom()
      }.runOnQueue(.main)

      AsyncFunction("copySelection") { (view: TermixTerminalView) in
        view.copySelection()
      }.runOnQueue(.main)

      AsyncFunction("focus") { (view: TermixTerminalView) in
        view.focusTerminal()
      }.runOnQueue(.main)

      AsyncFunction("blur") { (view: TermixTerminalView) in
        view.blurTerminal()
      }.runOnQueue(.main)

      AsyncFunction("getStats") { (view: TermixTerminalView) -> [String: Double] in
        view.stats()
      }.runOnQueue(.main)
    }
  }
}

internal final class InvalidBase64Exception: Exception {
  override var reason: String {
    "expected base64 terminal output"
  }
}

internal struct TerminalThemeRecord: Record {
  @Field var background: String?
  @Field var foreground: String?
  @Field var cursorColor: String?
  @Field var selectionBackground: String?
  @Field var selectionForeground: String?
  @Field var palette: [String?]?
}

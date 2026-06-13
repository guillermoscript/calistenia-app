import SwiftUI
import CoreText

enum Theme {
  static let bg = Color(red: 0.075, green: 0.067, blue: 0.059)       // #13110f
  static let lime = Color(red: 0.64, green: 0.90, blue: 0.21)         // #a3e635
  static let emerald = Color(red: 0.06, green: 0.73, blue: 0.51)      // #10b981
  static let muted = Color(red: 0.54, green: 0.53, blue: 0.51)
  static let fg = Color(red: 0.98, green: 0.98, blue: 0.976)

  private static let registered: Void = {
    for file in ["BebasNeue_400Regular", "JetBrainsMono_400Regular", "JetBrainsMono_700Bold"] {
      if let url = Bundle.main.url(forResource: file, withExtension: "ttf") {
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
      }
    }
  }()

  static func bebas(_ size: CGFloat) -> Font { _ = registered; return .custom("Bebas Neue", size: size) }
  static func mono(_ size: CGFloat, bold: Bool = false) -> Font {
    _ = registered
    return .custom(bold ? "JetBrains Mono Bold" : "JetBrains Mono", size: size)
  }
}

struct WidgetBackground: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(Theme.bg, for: .widget)
    } else {
      content.background(Theme.bg)
    }
  }
}

import WidgetKit
import SwiftUI

@main
struct CalisteniaWidgetsBundle: WidgetBundle {
  var body: some Widget {
    TodayWidget()
    // deploymentTarget del target es 16.2, no hace falta gate de disponibilidad
    SessionLiveActivity()
  }
}

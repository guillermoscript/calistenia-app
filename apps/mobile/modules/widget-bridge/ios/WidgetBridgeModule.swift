import ExpoModulesCore
import WidgetKit

let APP_GROUP = "group.tech.guille.calistenia"

public class WidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    Function("setSnapshot") { (json: String) in
      let defaults = UserDefaults(suiteName: APP_GROUP)
      defaults?.set(json, forKey: "widget_snapshot")
      WidgetCenter.shared.reloadAllTimelines()
    }

    Function("startActivity") { (workoutTitle: String, stateJson: String) -> Bool in
      if #available(iOS 16.2, *) {
        return LiveActivityManager.start(workoutTitle: workoutTitle, stateJson: stateJson)
      }
      return false
    }

    Function("updateActivity") { (stateJson: String) in
      if #available(iOS 16.2, *) {
        Task { await LiveActivityManager.update(stateJson: stateJson) }
      }
    }

    Function("endActivity") {
      if #available(iOS 16.2, *) {
        Task { await LiveActivityManager.end() }
      }
    }
  }
}

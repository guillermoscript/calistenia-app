import Foundation

struct WidgetSnapshot: Codable {
  struct WorkoutToday: Codable {
    var title: String
    var type: String
    var done: Bool
    var exerciseCount: Int
    var programPhase: Int
  }
  struct WeekDay: Codable {
    var id: String
    var done: Bool
    var type: String
  }
  var date: String
  var programName: String?
  var workoutToday: WorkoutToday?
  var week: [WeekDay]
  var streak: Int
  var weeklyDone: Int
  var weeklyGoal: Int
  var lang: String
}

enum SnapshotStore {
  static let appGroup = "group.tech.guille.calistenia"

  static func load() -> WidgetSnapshot? {
    guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: "widget_snapshot"),
          let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }

  static func localToday() -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
  }
}

enum L10n {
  static func t(_ key: String, _ lang: String) -> String {
    let es = ["today": "ENTRENAMIENTO DE HOY", "done": "COMPLETADO", "rest": "DÍA DE DESCANSO",
              "none": "ELIGE UN PROGRAMA", "stale": "ABRE LA APP PARA ACTUALIZAR",
              "streak": "RACHA", "set": "SERIE", "resting": "DESCANSANDO"]
    let en = ["today": "TODAY'S WORKOUT", "done": "COMPLETED", "rest": "REST DAY",
              "none": "PICK A PROGRAM", "stale": "OPEN THE APP TO UPDATE",
              "streak": "STREAK", "set": "SET", "resting": "RESTING"]
    return (lang == "en" ? en : es)[key] ?? key
  }
}

import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.2, *)
enum LiveActivityManager {
  private static var current: Activity<CalisteniaActivityAttributes>?

  private static func parseState(_ json: String) -> CalisteniaActivityAttributes.ContentState? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(CalisteniaActivityAttributes.ContentState.self, from: data)
  }

  private static func staleDate(for state: CalisteniaActivityAttributes.ContentState) -> Date {
    if let end = state.restEndsAt {
      return Date(timeIntervalSince1970: end / 1000).addingTimeInterval(10 * 60)
    }
    return Date().addingTimeInterval(45 * 60)
  }

  static func start(workoutTitle: String, stateJson: String) -> Bool {
    guard ActivityAuthorizationInfo().areActivitiesEnabled,
          let state = parseState(stateJson) else { return false }
    // Si quedó una activity zombi de una sesión anterior, terminarla primero
    Task { for a in Activity<CalisteniaActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) } }
    let attrs = CalisteniaActivityAttributes(workoutTitle: workoutTitle)
    current = try? Activity.request(
      attributes: attrs,
      content: .init(state: state, staleDate: staleDate(for: state))
    )
    return current != nil
  }

  static func update(stateJson: String) async {
    guard let state = parseState(stateJson) else { return }
    await current?.update(.init(state: state, staleDate: staleDate(for: state)))
  }

  static func end() async {
    await current?.end(nil, dismissalPolicy: .immediate)
    current = nil
  }
}
#endif

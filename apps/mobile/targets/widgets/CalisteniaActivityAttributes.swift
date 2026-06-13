import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.2, *)
struct CalisteniaActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var exerciseName: String
    var setIndex: Int
    var setTotal: Int
    var phase: String          // "work" | "rest"
    var restEndsAt: Double?    // epoch ms
  }
  var workoutTitle: String
}
#endif

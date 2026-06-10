import WidgetKit
import SwiftUI
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.2, *)
struct SessionLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CalisteniaActivityAttributes.self) { context in
      LockScreenView(context: context)
        .activityBackgroundTint(Theme.bg)
        .activitySystemActionForegroundColor(Theme.lime)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.state.exerciseName.uppercased())
              .font(Theme.bebas(22)).foregroundColor(Theme.fg).lineLimit(1)
            if context.state.setTotal > 0 {
              Text("SERIE \(context.state.setIndex)/\(context.state.setTotal)")
                .font(Theme.mono(9)).kerning(2).foregroundColor(Theme.muted)
            }
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          RestCountdown(state: context.state, size: 26)
        }
      } compactLeading: {
        Image(systemName: context.state.phase == "rest" ? "timer" : "figure.strengthtraining.functional")
          .foregroundColor(Theme.lime)
      } compactTrailing: {
        RestCountdown(state: context.state, size: 13)
      } minimal: {
        Image(systemName: "timer").foregroundColor(Theme.lime)
      }
      .widgetURL(URL(string: "calistenia://session"))
    }
  }
}

@available(iOS 16.2, *)
struct RestCountdown: View {
  let state: CalisteniaActivityAttributes.ContentState
  let size: CGFloat

  var body: some View {
    if state.phase == "rest", let end = state.restEndsAt {
      Text(timerInterval: Date()...Date(timeIntervalSince1970: end / 1000), countsDown: true)
        .font(Theme.bebas(size)).foregroundColor(Theme.lime)
        .monospacedDigit().multilineTextAlignment(.trailing)
    } else if size > 20 {
      Image(systemName: "figure.strengthtraining.functional")
        .font(.system(size: size * 0.8)).foregroundColor(Theme.lime)
    } else {
      EmptyView()
    }
  }
}

@available(iOS 16.2, *)
struct LockScreenView: View {
  let context: ActivityViewContext<CalisteniaActivityAttributes>

  var resting: Bool { context.state.phase == "rest" && context.state.restEndsAt != nil }

  var body: some View {
    HStack(alignment: .center) {
      VStack(alignment: .leading, spacing: 3) {
        Text(context.attributes.workoutTitle.uppercased())
          .font(Theme.mono(8)).kerning(2).foregroundColor(Theme.muted).lineLimit(1)
        Text(context.state.exerciseName.uppercased())
          .font(Theme.bebas(26)).foregroundColor(resting ? Theme.muted : Theme.lime)
          .lineLimit(1).minimumScaleFactor(0.7)
        if context.state.setTotal > 0 {
          Text("SERIE \(context.state.setIndex)/\(context.state.setTotal)")
            .font(Theme.mono(10)).kerning(2).foregroundColor(Theme.muted)
        }
      }
      Spacer()
      if resting, let end = context.state.restEndsAt {
        VStack(alignment: .trailing, spacing: 2) {
          Text(L10n.t("resting", "es")).font(Theme.mono(8)).kerning(2).foregroundColor(Theme.muted)
          Text(timerInterval: Date()...Date(timeIntervalSince1970: end / 1000), countsDown: true)
            .font(Theme.bebas(34)).foregroundColor(Theme.lime)
            .monospacedDigit().multilineTextAlignment(.trailing).frame(maxWidth: 90)
        }
      }
    }
    .padding(16)
  }
}
#endif

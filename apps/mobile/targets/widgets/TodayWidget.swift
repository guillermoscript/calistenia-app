import WidgetKit
import SwiftUI

struct TodayEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
  let isStale: Bool
}

struct TodayProvider: TimelineProvider {
  func makeEntry() -> TodayEntry {
    let snap = SnapshotStore.load()
    let stale = snap == nil || snap!.date != SnapshotStore.localToday()
    return TodayEntry(date: Date(), snapshot: snap, isStale: stale)
  }
  func placeholder(in context: Context) -> TodayEntry { makeEntry() }
  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) { completion(makeEntry()) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    // Una entrada ahora + refresh a medianoche para que el "done" de ayer no mienta
    let midnight = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86_400)
    completion(Timeline(entries: [makeEntry()], policy: .after(midnight)))
  }
}

struct TodayWidgetView: View {
  var entry: TodayEntry
  @Environment(\.widgetFamily) var family

  var lang: String { entry.snapshot?.lang ?? "es" }

  var titleAndColor: (String, Color) {
    guard let snap = entry.snapshot, !entry.isStale else { return (L10n.t("stale", lang), Theme.muted) }
    guard let w = snap.workoutToday else { return (L10n.t("none", lang), Theme.muted) }
    if w.done { return (L10n.t("done", lang), Theme.emerald) }
    if w.type == "rest" { return (L10n.t("rest", lang), Theme.muted) }
    return (w.title.isEmpty ? L10n.t("today", lang) : w.title.uppercased(), Theme.lime)
  }

  var body: some View {
    let (title, color) = titleAndColor
    VStack(alignment: .leading, spacing: 0) {
      if entry.snapshot != nil && !entry.isStale {
        Text(L10n.t("today", lang))
          .font(Theme.mono(8)).kerning(2).foregroundColor(Theme.muted)
      }
      Text(title)
        .font(Theme.bebas(family == .systemSmall ? 22 : 28))
        .foregroundColor(color).lineLimit(1).minimumScaleFactor(0.6)
        .padding(.top, 2)
      Spacer()
      HStack(alignment: .center) {
        if family != .systemSmall, let snap = entry.snapshot, !entry.isStale {
          HStack(spacing: 6) {
            ForEach(snap.week, id: \.id) { day in
              Circle()
                .strokeBorder(day.done ? Theme.lime : Theme.muted.opacity(day.type == "rest" ? 0.3 : 0.7), lineWidth: 1.5)
                .background(Circle().fill(day.done ? Theme.lime : .clear))
                .frame(width: 8, height: 8)
            }
          }
        }
        Spacer()
        HStack(alignment: .lastTextBaseline, spacing: 4) {
          Text(entry.isStale ? "–" : "\(entry.snapshot?.streak ?? 0)")
            .font(Theme.bebas(20)).foregroundColor(Theme.fg)
          Text(L10n.t("streak", lang)).font(Theme.mono(7)).kerning(1.5).foregroundColor(Theme.muted)
        }
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .modifier(WidgetBackground())
    .widgetURL(URL(string: "calistenia://"))
  }
}

struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "TodayWidget", provider: TodayProvider()) { entry in
      TodayWidgetView(entry: entry)
    }
    .configurationDisplayName("Entrenamiento de hoy")
    .description("Qué toca hoy, semana y racha.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

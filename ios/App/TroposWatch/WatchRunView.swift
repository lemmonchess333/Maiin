import SwiftUI

struct WatchRunView: View {
    @ObservedObject var model: WatchRunModel
    @State private var confirmEnd = false

    private var runningColor: Color { Color("Running") }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 5)) { timeline in
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if model.sessionId == nil {
                    Text("Tropos Run")
                        .font(.headline)
                        .foregroundStyle(runningColor)
                    Text(model.message)
                        .font(.footnote)
                } else {
                    Text(model.saveStatus != nil ? "Saved" : model.phase == "paused" ? "Paused" : model.phase == "review" ? "Finished" : "Running")
                        .font(.headline)
                        .foregroundStyle(runningColor)
                    HStack(alignment: .firstTextBaseline) {
                        metric("TIME", value: duration(model.elapsedSeconds))
                        Spacer()
                        metric("DISTANCE", value: model.distanceText)
                    }
                    HStack(alignment: .firstTextBaseline) {
                        metric("PACE", value: model.paceText)
                        Spacer()
                        metric("HEART", value: heartRate(at: timeline.date))
                    }
                    if !model.message.isEmpty {
                        Text(model.message).font(.footnote).foregroundStyle(.secondary)
                    }
                    if model.phase != "review", let lastUpdate = model.lastUpdate,
                       timeline.date.timeIntervalSince(lastUpdate) > 15 {
                        Text("Last update \(lastUpdate, style: .time)")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    if model.phase != "review" {
                        Button(model.isPaused ? "Resume" : "Pause") {
                            model.sendCommand(model.isPaused ? "resume" : "pause")
                        }
                        .disabled(!model.canControl)
                        Button("End run") { confirmEnd = true }
                            .disabled(!model.canControl)
                            .tint(runningColor)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
        }
        .confirmationDialog("End run on iPhone?", isPresented: $confirmEnd) {
            Button("End run", role: .destructive) { model.sendCommand("end") }
        } message: {
            Text("You will review and save it on your iPhone.")
        }
        }
    }

    private func metric(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.system(.title3, design: .rounded)).monospacedDigit()
        }
    }

    private func duration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    private func heartRate(at date: Date) -> String {
        if model.phase == "review" { return "—" }
        guard let sampleDate = model.lastHeartRate,
              date.timeIntervalSince(sampleDate) <= 15,
              let bpm = model.heartRateBpm else { return "—" }
        return "\(bpm) bpm"
    }
}

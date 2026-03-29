import AgentHostProtocol
import SwiftUI
import UIKit

/// Renders a single response part: markdown text, reasoning, tool call, or content ref.
struct ResponsePartView: View {
    let part: ResponsePart

    var body: some View {
        switch part {
        case .markdown(let md):
            MarkdownPartView(part: md)
        case .reasoning(let r):
            ReasoningPartView(part: r)
        case .toolCall(let tc):
            ToolCallPartView(toolCall: tc.toolCall)
        case .contentRef(let ref):
            ContentRefView(ref: ref)
        }
    }
}

// MARK: - MarkdownPartView

struct MarkdownPartView: View {
    let part: MarkdownResponsePart

    var body: some View {
        if !part.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            if let attributed = try? AttributedString(
                markdown: part.content,
                options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
            ) {
                Text(attributed)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
            } else {
                // Fallback for content that fails to parse as markdown.
                Text(part.content)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
            }
        }
    }
}

// MARK: - ReasoningPartView

struct ReasoningPartView: View {
    let part: ReasoningResponsePart
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            Text(part.content)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        } label: {
            Label("Thinking", systemImage: "brain")
                .font(.footnote.weight(.medium))
                .foregroundStyle(.purple)
        }
        .padding(10)
        .background(
            Color.purple.opacity(0.08),
            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
    }
}

// MARK: - ToolCallPartView

struct ToolCallPartView: View {
    let toolCall: ToolCallState
    @Environment(AppStore.self) private var store
    @State private var showDetail = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                Image(systemName: toolIcon)
                    .foregroundStyle(toolColor)
                Text(displayName)
                    .font(.subheadline.bold())
                Spacer()
                statusView
            }

            // Tool invocation message
            if let msg = invocationMessage {
                Text(stringOrMarkdownText(msg))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Show a failure label for completed-but-failed calls
            if case .completed(let s) = toolCall, !s.success {
                Label("Tool failed", systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            // Action buttons
            actionButtons
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(cardBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { showDetail = true }
        .sheet(isPresented: $showDetail) {
            ToolCallDetailSheet(toolCall: toolCall)
        }
    }

    // MARK: - Status

    @ViewBuilder
    private var statusView: some View {
        switch toolCall {
        case .streaming:
            ProgressView().controlSize(.mini)
        case .pendingConfirmation:
            Image(systemName: "questionmark.circle.fill")
                .foregroundStyle(.orange)
        case .running:
            ProgressView().controlSize(.mini)
        case .pendingResultConfirmation:
            Image(systemName: "checkmark.circle.badge.questionmark")
                .foregroundStyle(.orange)
        case .completed(let s):
            Image(systemName: s.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(s.success ? .green : .red)
        case .cancelled:
            Image(systemName: "slash.circle.fill")
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Action Buttons

    @ViewBuilder
    private var actionButtons: some View {
        switch toolCall {
        case .pendingConfirmation:
            HStack {
                Button("Deny", role: .destructive) {
                    if let ids = turnAndToolId {
                        Task { await store.denyToolCall(toolCallId: ids.toolCallId, turnId: ids.turnId) }
                    }
                }
                .buttonStyle(.bordered)

                Button("Approve") {
                    if let ids = turnAndToolId {
                        Task { await store.approveToolCall(toolCallId: ids.toolCallId, turnId: ids.turnId) }
                    }
                }
                .buttonStyle(.borderedProminent)
            }
        case .pendingResultConfirmation:
            HStack {
                Button("Reject", role: .destructive) {
                    // Result denial not exposed yet
                }
                .buttonStyle(.bordered)

                Button("Accept") {
                    if let ids = turnAndToolId {
                        Task { await store.approveToolCallResult(toolCallId: ids.toolCallId, turnId: ids.turnId) }
                    }
                }
                .buttonStyle(.borderedProminent)
            }
        default:
            EmptyView()
        }
    }

    // MARK: - Helpers

    private var displayName: String {
        toolCall.baseFields.displayName
    }

    private var toolIcon: String {
        let name = toolCall.baseFields.toolName
        switch name {
        case "bash", "terminal", "runCommand": return "terminal"
        case "readFile", "read_file": return "doc.text"
        case "writeFile", "write_file", "editFile", "edit_file": return "doc.badge.plus"
        case "listDirectory", "list_directory": return "folder"
        default: return "wrench"
        }
    }

    private var toolColor: Color {
        switch toolCall {
        case .pendingConfirmation: .orange
        case .running, .streaming: .blue
        case .completed(let s): s.success ? .green : .red
        case .cancelled: .secondary
        case .pendingResultConfirmation: .orange
        }
    }

    private var cardBackground: Color {
        switch toolCall {
        case .pendingConfirmation, .pendingResultConfirmation:
            return Color.orange.opacity(0.05)
        default:
            return Color(.systemGray6).opacity(0.5)
        }
    }

    private var borderColor: Color {
        switch toolCall {
        case .pendingConfirmation, .pendingResultConfirmation: .orange.opacity(0.4)
        case .completed(let s): s.success ? .green.opacity(0.2) : .red.opacity(0.3)
        default: Color(.systemGray4).opacity(0.5)
        }
    }

    private var invocationMessage: StringOrMarkdown? {
        switch toolCall {
        case .streaming(let s): return s.invocationMessage
        case .pendingConfirmation(let s): return s.invocationMessage
        case .running(let s): return s.invocationMessage
        case .pendingResultConfirmation(let s): return s.invocationMessage
        case .completed(let s): return s.invocationMessage
        case .cancelled(let s): return s.invocationMessage
        }
    }

    private var toolInput: String? {
        switch toolCall {
        case .streaming(let s): return s.partialInput
        case .pendingConfirmation(let s): return s.toolInput
        case .running(let s): return s.toolInput
        case .pendingResultConfirmation(let s): return s.toolInput
        case .completed(let s): return s.toolInput
        default: return nil
        }
    }

    /// Get turnId + toolCallId for dispatching actions.
    /// The turnId comes from the current active turn in the store.
    private var turnAndToolId: (turnId: String, toolCallId: String)? {
        let tcId = toolCall.toolCallId
        if let activeTurn = store.currentSession?.activeTurn {
            return (activeTurn.id, tcId)
        }
        return nil
    }

    private func stringOrMarkdownText(_ value: StringOrMarkdown) -> String {
        switch value {
        case .string(let s): return s
        case .markdown(let m): return m
        }
    }
}

// MARK: - ToolCallDetailSheet

/// Modal sheet showing the full input (parameters) and output (result content) of a tool call.
struct ToolCallDetailSheet: View {
    let toolCall: ToolCallState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // --- Input Section ---
                    if let input = toolInput, !input.isEmpty {
                        Section {
                            Text(input)
                                .font(.system(.caption, design: .monospaced))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 8))
                        } header: {
                            Label("Input", systemImage: "arrow.right.circle")
                                .font(.subheadline.weight(.semibold))
                        }
                    }

                    // --- Output Section ---
                    if let content = toolResultContent, !content.isEmpty {
                        Section {
                            ForEach(Array(content.enumerated()), id: \.offset) { _, item in
                                ToolResultContentView(content: item)
                            }
                        } header: {
                            Label("Output", systemImage: "arrow.left.circle")
                                .font(.subheadline.weight(.semibold))
                        }
                    } else if hasResult {
                        Section {
                            Text("No output content")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } header: {
                            Label("Output", systemImage: "arrow.left.circle")
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                }
                .padding()
            }
            .navigationTitle(toolCall.baseFields.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var toolInput: String? {
        switch toolCall {
        case .streaming(let s): return s.partialInput
        case .pendingConfirmation(let s): return s.toolInput
        case .running(let s): return s.toolInput
        case .pendingResultConfirmation(let s): return s.toolInput
        case .completed(let s): return s.toolInput
        default: return nil
        }
    }

    private var toolResultContent: [ToolResultContent]? {
        switch toolCall {
        case .completed(let s): return s.content
        case .pendingResultConfirmation(let s): return s.content
        default: return nil
        }
    }

    private var hasResult: Bool {
        switch toolCall {
        case .completed, .pendingResultConfirmation: return true
        default: return false
        }
    }
}

// MARK: - ToolResultContentView

struct ToolResultContentView: View {
    let content: ToolResultContent

    var body: some View {
        switch content {
        case .text(let t):
            Text(t.text)
                .font(.system(.caption, design: .monospaced))
                .textSelection(.enabled)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 6))
        case .binary(let b):
            if b.contentType.hasPrefix("image/") == true,
               let data = Data(base64Encoded: b.data),
               let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                Label("Binary content (\(b.contentType))", systemImage: "doc.zipper")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        case .fileEdit(let edit):
            HStack {
                Image(systemName: "doc.badge.gearshape")
                VStack(alignment: .leading) {
                    Text("File edit")
                        .font(.caption.bold())
                    if let diff = edit.diff?.value as? [String: Any] {
                        HStack(spacing: 4) {
                            Text("+\(diff["added"] as? Int ?? 0)")
                                .foregroundStyle(.green)
                            Text("-\(diff["removed"] as? Int ?? 0)")
                                .foregroundStyle(.red)
                        }
                        .font(.caption)
                    }
                }
            }
            .padding(8)
            .background(Color(.systemGray5), in: RoundedRectangle(cornerRadius: 8))
        case .contentRef(let ref):
            ContentRefView(ref: ref)
        }
    }
}

// MARK: - ContentRefView

struct ContentRefView: View {
    let ref: ContentRef

    var body: some View {
        HStack {
            Image(systemName: contentIcon)
            VStack(alignment: .leading) {
                Text(ref.uri)
                    .font(.caption)
                    .lineLimit(1)
                if let type = ref.contentType {
                    Text(type)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(8)
        .background(
            Color(.systemGray6),
            in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
    }

    private var contentIcon: String {
        if ref.contentType?.hasPrefix("image/") == true { return "photo" }
        if ref.contentType?.hasPrefix("text/") == true { return "doc.text" }
        return "doc"
    }
}

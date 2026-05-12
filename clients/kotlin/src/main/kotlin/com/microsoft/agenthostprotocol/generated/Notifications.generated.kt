// Generated from types/*.ts — do not edit

package com.microsoft.agenthostprotocol.generated

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull

// ─── Notification Enums ─────────────────────────────────────────────────────

/**
 * Reason why authentication is required.
 */
@Serializable
enum class AuthRequiredReason {
    /**
     * The client has not yet authenticated for the resource
     */
    @SerialName("required")
    REQUIRED,
    /**
     * A previously valid token has expired or been revoked
     */
    @SerialName("expired")
    EXPIRED
}

/**
 * Discriminant values for all protocol notifications.
 */
@Serializable
enum class NotificationType {
    @SerialName("notify/sessionAdded")
    SESSION_ADDED,
    @SerialName("notify/sessionRemoved")
    SESSION_REMOVED,
    @SerialName("notify/sessionSummaryChanged")
    SESSION_SUMMARY_CHANGED,
    @SerialName("notify/authRequired")
    AUTH_REQUIRED
}

// ─── Notification Types ─────────────────────────────────────────────────────

@Serializable
data class SessionAddedNotification(
    val type: NotificationType,
    /**
     * Summary of the new session
     */
    val summary: SessionSummary
)

@Serializable
data class SessionRemovedNotification(
    val type: NotificationType,
    /**
     * URI of the removed session
     */
    val session: String
)

@Serializable
data class SessionSummaryChangedNotification(
    val type: NotificationType,
    /**
     * URI of the session whose summary changed
     */
    val session: String,
    /**
     * Mutable summary fields that changed; omitted fields are unchanged.
     * 
     * Identity fields (`resource`, `provider`, `createdAt`) never change and
     * MUST be omitted by senders; receivers SHOULD ignore them if present.
     */
    val changes: PartialSessionSummary
)

@Serializable
data class AuthRequiredNotification(
    val type: NotificationType,
    /**
     * The protected resource identifier that requires authentication
     */
    val resource: String,
    /**
     * Why authentication is required
     */
    val reason: AuthRequiredReason? = null
)

// ─── Partial Summary Types ──────────────────────────────────────────────────

@Serializable
data class PartialSessionSummary(
    /**
     * Session URI
     */
    val resource: String? = null,
    /**
     * Agent provider ID
     */
    val provider: String? = null,
    /**
     * Session title
     */
    val title: String? = null,
    /**
     * Current session status
     */
    val status: SessionStatus? = null,
    /**
     * Human-readable description of what the session is currently doing
     */
    val activity: String? = null,
    /**
     * Creation timestamp
     */
    val createdAt: Long? = null,
    /**
     * Last modification timestamp
     */
    val modifiedAt: Long? = null,
    /**
     * Server-owned project for this session
     */
    val project: ProjectInfo? = null,
    /**
     * Currently selected model
     */
    val model: ModelSelection? = null,
    /**
     * The working directory URI for this session
     */
    val workingDirectory: String? = null,
    /**
     * Files changed during this session with diff statistics
     */
    val diffs: List<FileEdit>? = null
)

// ─── ProtocolNotification Union ─────────────────────────────────────────────

@Serializable(with = ProtocolNotificationSerializer::class)
sealed interface ProtocolNotification

@JvmInline
value class ProtocolNotificationSessionAdded(val value: SessionAddedNotification) : ProtocolNotification
@JvmInline
value class ProtocolNotificationSessionRemoved(val value: SessionRemovedNotification) : ProtocolNotification
@JvmInline
value class ProtocolNotificationSessionSummaryChanged(val value: SessionSummaryChangedNotification) : ProtocolNotification
@JvmInline
value class ProtocolNotificationAuthRequired(val value: AuthRequiredNotification) : ProtocolNotification

internal object ProtocolNotificationSerializer : KSerializer<ProtocolNotification> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ProtocolNotification")

    override fun deserialize(decoder: Decoder): ProtocolNotification {
        val input = decoder as? JsonDecoder
            ?: error("ProtocolNotification can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ProtocolNotification")
        val discriminant = (obj["type"] as? JsonPrimitive)?.content
            ?: error("Missing type discriminator on ProtocolNotification")
        return when (discriminant) {
            "notify/sessionAdded" -> ProtocolNotificationSessionAdded(input.json.decodeFromJsonElement(SessionAddedNotification.serializer(), element))
            "notify/sessionRemoved" -> ProtocolNotificationSessionRemoved(input.json.decodeFromJsonElement(SessionRemovedNotification.serializer(), element))
            "notify/sessionSummaryChanged" -> ProtocolNotificationSessionSummaryChanged(input.json.decodeFromJsonElement(SessionSummaryChangedNotification.serializer(), element))
            "notify/authRequired" -> ProtocolNotificationAuthRequired(input.json.decodeFromJsonElement(AuthRequiredNotification.serializer(), element))
            else -> error("Unknown ProtocolNotification discriminator: $discriminant")
        }
    }

    override fun serialize(encoder: Encoder, value: ProtocolNotification) {
        val output = encoder as? JsonEncoder
            ?: error("ProtocolNotification can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ProtocolNotificationSessionAdded -> output.json.encodeToJsonElement(SessionAddedNotification.serializer(), value.value)
            is ProtocolNotificationSessionRemoved -> output.json.encodeToJsonElement(SessionRemovedNotification.serializer(), value.value)
            is ProtocolNotificationSessionSummaryChanged -> output.json.encodeToJsonElement(SessionSummaryChangedNotification.serializer(), value.value)
            is ProtocolNotificationAuthRequired -> output.json.encodeToJsonElement(AuthRequiredNotification.serializer(), value.value)
        }
        output.encodeJsonElement(element)
    }
}

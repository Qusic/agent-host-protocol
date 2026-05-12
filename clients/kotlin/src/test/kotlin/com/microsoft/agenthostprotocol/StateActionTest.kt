package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.ActionEnvelope
import com.microsoft.agenthostprotocol.generated.ActionOrigin
import com.microsoft.agenthostprotocol.generated.ActionType
import com.microsoft.agenthostprotocol.generated.PartialSessionSummary
import com.microsoft.agenthostprotocol.generated.RootAgentsChangedAction
import com.microsoft.agenthostprotocol.generated.SessionStatus
import com.microsoft.agenthostprotocol.generated.StateAction
import com.microsoft.agenthostprotocol.generated.StateActionRootAgentsChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionTitleChanged
import com.microsoft.agenthostprotocol.generated.StateActionUnknown
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

/**
 * Tests for [StateAction] and the [ActionEnvelope] wrapper. Critical for
 * forward compatibility: clients running an older protocol version must
 * decode unknown action types as [StateActionUnknown] (not throw) so that
 * reducers can no-op them and still apply the rest of a replay batch.
 */
class StateActionTest {
    private val json = Ahp.json

    @Test
    fun `known action round-trips through StateAction sealed interface`() {
        val action: StateAction = StateActionRootAgentsChanged(
            RootAgentsChangedAction(
                type = ActionType.ROOT_AGENTS_CHANGED,
                agents = emptyList(),
            ),
        )
        val encoded = json.encodeToString(StateAction.serializer(), action)
        val obj = json.parseToJsonElement(encoded).jsonObject
        assertEquals(JsonPrimitive("root/agentsChanged"), obj["type"])

        val decoded = json.decodeFromString(StateAction.serializer(), encoded)
        assertIs<StateActionRootAgentsChanged>(decoded)
    }

    @Test
    fun `unknown action type decodes to StateActionUnknown without throwing`() {
        // A future server may emit an action whose `type` is unknown to
        // this client. The reducer must be able to no-op it; that requires
        // the deserializer to never throw on unknown types.
        val futureWire = """{"type":"session/futureUnknownAction","payload":{}}"""
        val decoded = json.decodeFromString(StateAction.serializer(), futureWire)
        val unknown = assertIs<StateActionUnknown>(decoded)
        assertEquals("session/futureUnknownAction", unknown.type)
    }

    @Test
    fun `ActionEnvelope wraps a StateAction with serverSeq`() {
        val envelopeJson = """{
            "action": {
                "type": "session/titleChanged",
                "session": "session://test",
                "title": "New title"
            },
            "serverSeq": 42,
            "origin": {
                "clientId": "client-1",
                "clientSeq": 7
            }
        }""".trimIndent()

        val envelope = json.decodeFromString(ActionEnvelope.serializer(), envelopeJson)
        assertEquals(42L, envelope.serverSeq)
        assertEquals(ActionOrigin(clientId = "client-1", clientSeq = 7L), envelope.origin)
        val title = assertIs<StateActionSessionTitleChanged>(envelope.action)
        assertEquals("New title", title.value.title)
    }

    @Test
    fun `Partial summary supports all-null wire payloads`() {
        // Partial<SessionSummary> models a partial-update notification.
        // Every field must be nullable; an empty payload is the wire
        // representation of "no changes" (rare but legal).
        val empty = json.decodeFromString(PartialSessionSummary.serializer(), "{}")
        assertNull(empty.title)
        assertNull(empty.status)

        // A typical partial: only `title` and `status` change.
        val partialJson = """{"title": "Renamed", "status": 1}"""
        val partial = json.decodeFromString(PartialSessionSummary.serializer(), partialJson)
        assertEquals("Renamed", partial.title)
        assertEquals(SessionStatus.IDLE, partial.status)
    }
}

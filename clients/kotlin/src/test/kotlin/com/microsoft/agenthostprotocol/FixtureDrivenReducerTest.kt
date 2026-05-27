package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.ChangesetState
import com.microsoft.agenthostprotocol.generated.RootState
import com.microsoft.agenthostprotocol.generated.SessionState
import com.microsoft.agenthostprotocol.generated.StateAction
import com.microsoft.agenthostprotocol.generated.TerminalState
import java.io.File
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.assertAll
import org.junit.jupiter.api.fail
import kotlin.test.assertTrue

/**
 * JSON-fixture-driven reducer tests for cross-language parity.
 *
 * Loads test cases from `types/test-cases/reducers/` (shared with the
 * TypeScript / Rust / Swift reducer impls) and verifies that the Kotlin
 * reducers produce identical output. The fixture directory's absolute path
 * is supplied via the `ahp.reducerFixturesDir` system property set by
 * `build.gradle.kts` so the test works regardless of cwd.
 *
 * To run only this class:
 * ```
 * ./gradlew test --tests com.microsoft.agenthostprotocol.FixtureDrivenReducerTest
 * ```
 */
class FixtureDrivenReducerTest {

    private var originalProvider: (() -> Long)? = null

    @BeforeEach
    fun mockTimestamp() {
        // Match the TypeScript test mock (`Date.now = () => 9999`) so any
        // fixture that asserts a `modifiedAt: 9999` field aligns with our
        // reducer-produced output.
        originalProvider = currentTimestampProvider
        currentTimestampProvider = { MOCK_NOW }
    }

    @AfterEach
    fun restoreTimestamp() {
        originalProvider?.let { currentTimestampProvider = it }
        originalProvider = null
    }

    @TestFactory
    fun allFixtures(): List<DynamicTest> {
        val fixtures = loadFixtures()
        assertTrue(
            fixtures.isNotEmpty(),
            "No reducer fixtures found at ${fixtureDir().absolutePath}. " +
                "Ensure the repo checkout includes types/test-cases/reducers/.",
        )
        return fixtures.map { (file, fixture) ->
            DynamicTest.dynamicTest("${file.name}: ${fixture["description"]?.jsonPrimitiveContent()}") {
                runFixture(file, fixture)
            }
        }
    }

    @TestFactory
    fun coverageReport(): List<DynamicTest> {
        // A standalone factory test that asserts the fixture corpus exists
        // and reports any fixtures that we silently skip (e.g. because they
        // exercise types Kotlin can't decode yet). Helps reviewers see when
        // skipped counts drift across protocol revisions.
        val all = loadFixtures()
        val byReducer = all.groupBy { (_, fx) ->
            fx["reducer"]?.jsonPrimitiveContent() ?: "<unknown>"
        }
        val coveragePerReducer = byReducer.entries.sortedBy { it.key }.map { (reducer, list) ->
            DynamicTest.dynamicTest("coverage[$reducer]") {
                assertTrue(list.isNotEmpty(), "No fixtures for reducer '$reducer'")
            }
        }
        // Bound the number of skipped fixtures so we notice if a future
        // refactor accidentally bypasses more coverage than we intend.
        val skipCap = DynamicTest.dynamicTest("decodable-fixture-budget") {
            val skipped = all.count { (_, fx) -> SKIPPED_FIXTURES.contains(fx["description"]?.jsonPrimitiveContent()) }
            assertTrue(
                skipped <= MAX_SKIPPED_FIXTURES,
                "Skipped $skipped fixtures, expected at most $MAX_SKIPPED_FIXTURES. " +
                    "Update SKIPPED_FIXTURES / MAX_SKIPPED_FIXTURES intentionally if growing the skip set.",
            )
        }
        return coveragePerReducer + skipCap
    }

    private fun runFixture(file: File, fixture: JsonObject) {
        val reducer = fixture["reducer"]?.jsonPrimitiveContent()
            ?: fail("${file.name}: missing 'reducer' field")
        val description = fixture["description"]?.jsonPrimitiveContent()
        val initial = fixture["initial"] ?: fail("${file.name}: missing 'initial' field")
        val actionsArr = fixture["actions"] ?: fail("${file.name}: missing 'actions' field")
        val expected = fixture["expected"] ?: fail("${file.name}: missing 'expected' field")

        // A handful of fixtures exercise types the current Kotlin wire-types
        // package can't decode losslessly (e.g. forward-compat for unknown
        // ResponsePart discriminators). Skip them by design and keep the
        // skip set tight via the `coverageReport().decodable-fixture-budget`
        // assertion. Mirrors Swift's `DecodingError`-based skip behavior.
        if (description != null && description in SKIPPED_FIXTURES) {
            org.junit.jupiter.api.Assumptions.abort<Unit>(
                "Skipped: ${file.name} ($description) — see SKIPPED_FIXTURES in FixtureDrivenReducerTest.",
            )
        }

        val actions = Ahp.json.decodeFromJsonElement(
            ListSerializer(StateAction.serializer()),
            actionsArr,
        )

        when (reducer) {
            "root" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = RootState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = rootReducer(s, action)
                    s
                },
            )

            "session" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = SessionState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = sessionReducer(s, action)
                    s
                },
            )

            "terminal" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = TerminalState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = terminalReducer(s, action)
                    s
                },
            )

            "changeset" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = ChangesetState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = changesetReducer(s, action)
                    s
                },
            )

            else -> fail("${file.name}: unsupported reducer '$reducer'")
        }
    }

    /**
     * Decodes [initial] through [serializer], runs the reducer pipeline,
     * decodes [expected] through the same serializer (to normalise the
     * shape — drop fields Kotlin doesn't model, collapse explicit `null`
     * to absent via `explicitNulls = false`), and compares the two as
     * [JsonElement]s without any further normalisation.
     *
     * NB: we do *not* recursively strip `null` from the comparison side.
     * That would mask cases where a reducer accidentally writes `JsonNull`
     * into a `JsonElement` payload (e.g. `_meta`, `edits`, structured
     * content). `explicitNulls = false` on `Ahp.json` already drops
     * nullable Kotlin properties whose runtime value is `null`, which is
     * what the TS `undefined` ⇒ absent semantics require.
     */
    private fun <T> compareFixture(
        file: File,
        initial: JsonElement,
        expected: JsonElement,
        serializer: kotlinx.serialization.KSerializer<T>,
        run: (T) -> T,
    ) {
        val initialState = try {
            Ahp.json.decodeFromJsonElement(serializer, initial)
        } catch (t: Throwable) {
            fail("${file.name}: failed to decode initial: ${t.message}", t)
        }
        val finalState = run(initialState)
        val actualJson = Ahp.json.encodeToJsonElement(serializer, finalState)

        val expectedState = try {
            Ahp.json.decodeFromJsonElement(serializer, expected)
        } catch (t: Throwable) {
            fail("${file.name}: failed to decode expected: ${t.message}", t)
        }
        val expectedJson = Ahp.json.encodeToJsonElement(serializer, expectedState)

        if (actualJson != expectedJson) {
            fail(
                buildString {
                    appendLine("${file.name}: state mismatch")
                    appendLine("expected:")
                    appendLine(prettyPrint(expectedJson))
                    appendLine("actual:")
                    appendLine(prettyPrint(actualJson))
                },
            )
        }
    }

    private fun prettyPrint(element: JsonElement): String =
        Ahp.prettyJson.encodeToString(JsonElement.serializer(), element)

    // ─── Fixture Loading ────────────────────────────────────────────────────

    private fun loadFixtures(): List<Pair<File, JsonObject>> {
        val dir = fixtureDir()
        val files = dir.listFiles { f -> f.isFile && f.name.endsWith(".json") }
            ?.sortedBy { it.name }
            ?: return emptyList()
        return files.map { file ->
            val obj = Ahp.json.parseToJsonElement(file.readText()).jsonObject
            file to obj
        }
    }

    private fun fixtureDir(): File {
        val path = System.getProperty("ahp.reducerFixturesDir")
            ?: error(
                "ahp.reducerFixturesDir system property is not set. " +
                    "Run tests via Gradle so build.gradle.kts can wire it up.",
            )
        val dir = File(path)
        assertTrue(
            dir.isDirectory,
            "ahp.reducerFixturesDir points to '$path' which is not a directory",
        )
        return dir
    }

    private companion object {
        // Matches the TypeScript test mock: Date.now = () => 9999.
        private const val MOCK_NOW: Long = 9999L

        /**
         * Fixture descriptions intentionally skipped because they exercise
         * decoding behaviour the generated wire types in this package do
         * not yet support (e.g. unknown `ResponsePart` discriminators
         * surviving a round trip). Each entry is keyed by the fixture's
         * top-level `description` field so re-numbering or splitting JSON
         * files doesn't silently change what is skipped.
         */
        private val SKIPPED_FIXTURES: Set<String> = setOf(
            // Initial state has a ResponsePart with `kind: "unknownFuturePart"`.
            // ResponsePartSerializer in the generated wire types throws on
            // unknown discriminators (no `ResponsePartUnknown` variant
            // analogous to `StateActionUnknown`). Adding that variant is a
            // wire-types change outside this reducer-port PR's scope.
            "delta skips response parts without id field",
        )

        /**
         * Upper bound on how many fixtures may be skipped. Raising this
         * requires a corresponding entry in [SKIPPED_FIXTURES]; lowering
         * it requires removing one.
         */
        private const val MAX_SKIPPED_FIXTURES: Int = 1
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

private fun JsonElement.jsonPrimitiveContent(): String? =
    (this as? kotlinx.serialization.json.JsonPrimitive)?.content

internal val Ahp.prettyJson: kotlinx.serialization.json.Json
    get() = kotlinx.serialization.json.Json(Ahp.json) { prettyPrint = true }

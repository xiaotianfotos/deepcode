package com.dsharnessmobile.shell

import org.junit.Assert.*
import org.junit.Test

class LegacyModelSyncProfileTest {
  private val legacy = "- insert:\n    - id: dsh-model-sync\n      name: '@aiwayds/dsh-model-sync'\n"

  @Test fun retiresFactoryEntryAndKeepsOtherPlugins() {
    val neighbor = "- insert:\n    - id: codex\n      name: relay-dsh-plugin-codex\n"
    for (flag in listOf("", "      disabled: true\n", "      disabled: false\n")) {
      val result = LegacyModelSyncProfile.migrate(legacy + flag + neighbor)
      assertEquals(neighbor, result)
      assertEquals(result, LegacyModelSyncProfile.migrate(result))
    }
  }

  @Test fun preservesExplicitCustomConfigurationAndGroupedInserts() {
    for (source in listOf(legacy + "      config: {}\n", legacy + "    - id: another\n      name: custom\n",
      legacy.replace("id: dsh-model-sync", "id: user-sync"), "# empty\n")) {
      assertEquals(source, LegacyModelSyncProfile.migrate(source))
    }
  }

  @Test fun preservesCommentsAndOtherSettingsByteForByte() {
    val neighbor = "- id: llm-pi-ai\n  config:\n    providers: {local: {models: [my-model]}}\n"
    val result = LegacyModelSyncProfile.migrate("# user note\n" + legacy + neighbor)
    assertTrue(result.startsWith("# user note\n"))
    assertTrue(result.endsWith(neighbor))
  }
}

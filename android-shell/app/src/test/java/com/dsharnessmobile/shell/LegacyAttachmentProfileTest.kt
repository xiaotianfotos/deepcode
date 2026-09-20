package com.dsharnessmobile.shell

import org.junit.Assert.*
import org.junit.Test

class LegacyAttachmentProfileTest {
  private val legacy = "- insert:\n    - id: attachment-formats\n      name: dsh-attachment-formats\n"
  @Test fun retiresFactoryInsertAndPreservesNeighbors() {
    val source = "# profile\n" + legacy + "\n- id: unrelated\n  disabled: false\n"
    val result = LegacyAttachmentProfile.migrate(source)
    assertEquals(source.replace("name: dsh-attachment-formats", "name: dsh-attachment-formats\n      disabled: true"), result)
    assertEquals(result, LegacyAttachmentProfile.migrate(result))
  }
  @Test fun preservesCustomConfigExplicitChoicesAndGroupedInserts() {
    for (source in listOf(legacy + "      config: {}\n", legacy + "      disabled: false\n", legacy + "    - id: neighbor\n      name: custom\n", legacy.replace("id: attachment-formats", "id: custom"), "# blank profile\n\n")) {
      assertEquals(source, LegacyAttachmentProfile.migrate(source))
    }
  }
}

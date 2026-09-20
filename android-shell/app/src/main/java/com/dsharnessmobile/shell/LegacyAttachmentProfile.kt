package com.dsharnessmobile.shell

/** Retire only the uncustomized factory insert; leave user plugin configuration intact. */
internal object LegacyAttachmentProfile {
  fun migrate(source: String): String {
    var changed = false
    val result = FactoryProfilePatch.topLevelBlocks(source).joinToString("") { block ->
    val meaningful = block.lineSequence().map { it.substringBefore('#').trim() }.filter { it.isNotEmpty() }.toList()
    if (meaningful == listOf("- insert:", "- id: attachment-formats", "name: dsh-attachment-formats")) {
      changed = true
      block.replace(Regex("(?m)^( +)name: dsh-attachment-formats[ \\t]*(?:#.*)?$")) {
        it.value + "\n" + it.groupValues[1] + "disabled: true"
      }
    } else block
    }
    return if (changed) result else source
  }
}

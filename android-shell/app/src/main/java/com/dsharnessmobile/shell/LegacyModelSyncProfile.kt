package com.dsharnessmobile.shell

/** Remove the retired factory mount without changing provider/model settings or custom inserts. */
internal object LegacyModelSyncProfile {
  fun migrate(source: String): String = FactoryProfilePatch.topLevelBlocks(source).joinToString("") { block ->
    val lines = block.lineSequence().map { it.substringBefore('#').trim() }
      .filter { it.isNotEmpty() && it != "disabled: true" && it != "disabled: false" }.toList()
    if (lines.size == 3 && lines[0] == "- insert:" && lines[1] == "- id: dsh-model-sync" &&
        lines[2].removePrefix("name: ").trim('\'', '"') == "@aiwayds/dsh-model-sync") {
      block.splitToSequence('\n').filter { it.isBlank() || it.trimStart().startsWith('#') }
        .joinToString("\n")
    } else block
  }
}

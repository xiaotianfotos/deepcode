package com.dsharnessmobile.shell

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Symlink target policy regression: the bundled archive carries absolute applet links
 * into the live runtime root (`files/usr/...`). Extraction into a staging directory must
 * still accept them (they are correct after the atomic swap), while Termux residue and
 * escaping targets stay rejected.
 */
class SnapshotExtractorTest {

  @Test
  fun acceptsTargetsInsideTheStageOrTheLiveRuntimeRootAndRejectsTheRest() {
    val root = Files.createTempDirectory("snapshot-extractor-policy-test").toFile()
    try {
      val runtimeRoot = File(root, "files").apply { mkdirs() }
      val dest = File(runtimeRoot, ".snapshot-stage").apply { mkdirs() }
      val linkParent = File(dest, "usr/bin").apply { mkdirs() }
      val destCanon = dest.canonicalPath
      val runtimeCanon = runtimeRoot.canonicalPath

      assertTrue(
        "relative link inside the stage",
        SnapshotExtractor.isLinkTargetAllowed("../libexec/busybox/vi", linkParent, destCanon, runtimeCanon),
      )
      assertTrue(
        "absolute applet link into the live runtime root must survive staging",
        SnapshotExtractor.isLinkTargetAllowed(
          File(runtimeRoot, "usr/libexec/busybox/vi").absolutePath, linkParent, destCanon, runtimeCanon,
        ),
      )
      assertTrue(
        "absolute link into the stage itself",
        SnapshotExtractor.isLinkTargetAllowed(File(dest, "usr/bin/node").absolutePath, linkParent, destCanon, runtimeCanon),
      )
      assertFalse(
        "absolute target outside the runtime root",
        SnapshotExtractor.isLinkTargetAllowed(File(root, "elsewhere/less").absolutePath, linkParent, destCanon, runtimeCanon),
      )
      assertFalse(
        "relative escape",
        SnapshotExtractor.isLinkTargetAllowed("../../../../../../etc/passwd", linkParent, destCanon, runtimeCanon),
      )
    } finally {
      SnapshotFs.deletePath(root)
    }
  }
}

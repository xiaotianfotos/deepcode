package com.dsharnessmobile.shell

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files

class WorkspacePathsTest {
  private val authority = "com.android.externalstorage.documents"

  @Test fun mapsPrimaryAndRemovableUnicodePaths() {
    val root = Files.createTempDirectory("dsh-volume-").toFile()
    try {
      val roots = mapOf("primary" to root, "ABCD-1234" to root)
      assertEquals(File(root, "Documents/我的 项目").canonicalFile, WorkspacePaths.resolve(authority, "primary:Documents/我的 项目", roots))
      assertEquals(File(root, "项目").canonicalFile, WorkspacePaths.resolve(authority, "abcd-1234:项目", roots))
      assertEquals(root.canonicalFile, WorkspacePaths.resolve(authority, "ABCD-1234:", roots))
    } finally { root.deleteRecursively() }
  }

  @Test fun rejectsProviderSpoofingTraversalAndAbsentVolumes() {
    val root = Files.createTempDirectory("dsh-volume-").toFile()
    try {
      val roots = mapOf("primary" to root)
      for ((provider, id) in listOf("cloud.example" to "primary:Docs", authority to "primary:../secret",
        authority to "primary:/etc", authority to "primary:Docs/./x", authority to "primary:Docs/\u0000",
        authority to "DEAD-BEEF:Docs", authority to "primary")) {
        try { WorkspacePaths.resolve(provider, id, roots); fail("Accepted invalid selection") }
        catch (_: IllegalArgumentException) {}
      }
    } finally { root.deleteRecursively() }
  }

  @Test fun rejectsSymlinkEscapeFromSelectedVolume() {
    val root = Files.createTempDirectory("dsh-volume-").toFile()
    val outside = Files.createTempDirectory("dsh-outside-").toFile()
    try {
      Files.createSymbolicLink(File(root, "escape").toPath(), outside.toPath())
      try { WorkspacePaths.resolve(authority, "primary:escape", mapOf("primary" to root)); fail("Escaped volume") }
      catch (_: IllegalArgumentException) {}
    } finally { root.deleteRecursively(); outside.deleteRecursively() }
  }

  @Test fun probePreservesExistingFilesAndRemovesItsOwnFile() {
    val root = Files.createTempDirectory("dsh-volume-").toFile()
    try {
      File(root, "existing.txt").writeText("keep")
      WorkspacePaths.probe(root)
      assertEquals(listOf("existing.txt"), root.list()!!.toList())
      assertEquals("keep", File(root, "existing.txt").readText())
      try { WorkspacePaths.probe(File(root, "missing")); fail("Accepted missing volume") }
      catch (_: java.io.IOException) {}
    } finally { root.deleteRecursively() }
  }
}

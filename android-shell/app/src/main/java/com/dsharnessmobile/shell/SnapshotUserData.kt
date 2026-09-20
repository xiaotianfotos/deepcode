package com.dsharnessmobile.shell

import java.io.File
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.attribute.BasicFileAttributes

/**
 * Recovers the user-owned subset of DSH_HOME from a backup left by a pre-transaction
 * refresh (versions up to 0.13.2 copied `.dsh` aside, extracted over the live tree and
 * copied it back; a kill in the middle left `.dsh-backup` behind).
 *
 * The current refresh no longer creates that backup — [SnapshotTransaction] never
 * touches user-owned paths — so this restore is a one-time migration. It is
 * deliberately additive: only missing entries, truncated regular files and the small
 * singleton files captured before extraction are written, so a stale backup can never
 * roll back data the user created after the interrupted refresh. Broken symbolic links
 * are logged and skipped, and the live source tree is never mutated to make a copy work.
 */
internal object SnapshotUserData {

  /** DSH_HOME paths that survive a factory snapshot replacement. */
  internal val preservedNames = listOf(
    "sessions", "storages", "attachments", "workspaces", "undo-snapshots", "llm-deepseek",
    ".credentials.yaml", "settings.yaml", ".anonymous-user-id", ".private-layout",
    "models-store.json", ".node-compile-cache",
  )

  /**
   * Small singletons that are restored wholesale. A leftover backup means the refresh
   * that could have overwritten them did not finish, and the backup copy predates that
   * extraction, so it is the authoritative content.
   */
  private val replacedSingletons = setOf(
    "settings.yaml", ".credentials.yaml", ".anonymous-user-id", ".private-layout", "models-store.json",
  )

  internal data class CopyResult(
    val copiedEntries: Int,
    val skippedExisting: Int,
    val skippedBrokenLinks: Int,
  )

  fun restoreLegacyBackup(
    backupRoot: File,
    destinationRoot: File,
    onBrokenLink: (File) -> Unit,
  ): CopyResult {
    if (!SnapshotFs.exists(backupRoot)) return CopyResult(0, 0, 0)
    SnapshotFs.createDirectories(destinationRoot)
    var copied = 0
    var skipped = 0
    var broken = 0
    for (name in preservedNames) {
      val source = File(backupRoot, name)
      if (!SnapshotFs.exists(source)) continue
      val destination = File(destinationRoot, name)
      val result = if (name in replacedSingletons) {
        replaceEntry(source, destination, onBrokenLink)
      } else {
        mergeMissing(source, destination, onBrokenLink)
      }
      copied += result.copiedEntries
      skipped += result.skippedExisting
      broken += result.skippedBrokenLinks
    }
    return CopyResult(copied, skipped, broken)
  }

  private fun replaceEntry(source: File, destination: File, onBrokenLink: (File) -> Unit): CopyResult {
    SnapshotFs.deletePath(destination)
    return mergeMissing(source, destination, onBrokenLink)
  }

  /** Copies only what the destination lacks: missing entries and truncated regular files. */
  private fun mergeMissing(source: File, destination: File, onBrokenLink: (File) -> Unit): CopyResult {
    val sourcePath = source.toPath()
    val attributes = Files.readAttributes(sourcePath, BasicFileAttributes::class.java, java.nio.file.LinkOption.NOFOLLOW_LINKS)
    return try {
      when {
        attributes.isSymbolicLink -> {
          if (!Files.exists(sourcePath)) {
            // Dangling link: disposable runtime residue, never recreated.
            onBrokenLink(source)
            CopyResult(0, 0, 1)
          } else if (SnapshotFs.exists(destination)) {
            CopyResult(0, 1, 0)
          } else {
            SnapshotFs.createDirectories(destination.parentFile ?: source.parentFile)
            Files.createSymbolicLink(destination.toPath(), Files.readSymbolicLink(sourcePath))
            CopyResult(1, 0, 0)
          }
        }
        attributes.isDirectory -> {
          SnapshotFs.createDirectories(destination)
          var copied = 0
          var skipped = 0
          var broken = 0
          Files.list(sourcePath).use { children ->
            children.forEach { child ->
              val result = mergeMissing(child.toFile(), File(destination, child.fileName.toString()), onBrokenLink)
              copied += result.copiedEntries
              skipped += result.skippedExisting
              broken += result.skippedBrokenLinks
            }
          }
          CopyResult(copied, skipped, broken)
        }
        attributes.isRegularFile -> {
          val existing = if (SnapshotFs.exists(destination)) destination.length() else -1L
          if (existing >= attributes.size()) {
            CopyResult(0, 1, 0)
          } else {
            SnapshotFs.createDirectories(destination.parentFile ?: source.parentFile)
            SnapshotFs.deletePath(destination)
            Files.copy(sourcePath, destination.toPath())
            CopyResult(1, 0, 0)
          }
        }
        else -> throw IllegalStateException("unsupported user-data entry: " + source.absolutePath)
      }
    } catch (e: NoSuchFileException) {
      if (!attributes.isSymbolicLink) throw e
      onBrokenLink(source)
      CopyResult(0, 0, 1)
    }
  }
}

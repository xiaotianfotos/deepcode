package com.dsharnessmobile.shell

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.provider.DocumentsContract
import java.io.File
import java.io.IOException

/** Native storage adapter: only OS-mounted local volumes become Node/Bash workspaces. */
internal object WorkspaceStorage {
  fun resolveWritable(context: Context, uri: Uri): String {
    val manager = context.getSystemService(StorageManager::class.java)
    val roots = mutableMapOf<String, File>()
    for (volume in manager.storageVolumes) {
      if (volume.state != Environment.MEDIA_MOUNTED) continue
      val key = if (volume.isPrimary) "primary" else volume.uuid ?: continue
      val root = if (Build.VERSION.SDK_INT >= 30) volume.directory else {
        if (volume.isPrimary) Environment.getExternalStorageDirectory() else {
          // Older APIs expose app-specific paths on each mounted volume. Match the
          // OS UUID, then use its volume root; never guess a path from a provider ID.
          context.getExternalFilesDirs(null).filterNotNull().mapNotNull { file ->
            file.absolutePath.substringBefore("/Android/data/", "").takeIf { it.isNotEmpty() }?.let(::File)
          }.firstOrNull { it.name.equals(key, ignoreCase = true) }
        }
      }
      if (root != null) roots[key] = root
    }
    val directory = WorkspacePaths.resolve(uri.authority, DocumentsContract.getTreeDocumentId(uri), roots)
    WorkspacePaths.probe(directory)
    return directory.absolutePath
  }
}

/** Pure path policy, independently tested without Android stubs. */
internal object WorkspacePaths {
  fun resolve(authority: String?, documentId: String, roots: Map<String, File>): File {
    require(authority == "com.android.externalstorage.documents") { "unsupported-storage" }
    val colon = documentId.indexOf(':')
    require(colon > 0) { "unsupported-storage" }
    val volume = documentId.substring(0, colon)
    val relative = documentId.substring(colon + 1)
    require(!relative.startsWith('/') && !relative.contains('\u0000') &&
      relative.split('/').none { it == "." || it == ".." }) { "invalid-storage-path" }
    val root = roots.entries.firstOrNull { it.key.equals(volume, ignoreCase = true) }?.value?.canonicalFile
      ?: throw IllegalArgumentException("storage-unavailable")
    val directory = File(root, relative).canonicalFile
    require(directory == root || directory.path.startsWith(root.path + File.separator)) { "invalid-storage-path" }
    return directory
  }

  fun probe(directory: File) {
    if (!directory.isDirectory || !directory.canRead()) throw IOException("storage-unavailable")
    // Exclusive disposable probe, confined to the folder just chosen by the user.
    val file = File.createTempFile(".dsh-access-", ".tmp", directory)
    try {
      val bytes = "DSH storage access".toByteArray(Charsets.UTF_8)
      file.writeBytes(bytes)
      if (!file.readBytes().contentEquals(bytes)) throw IOException("storage-not-writable")
    } finally {
      if (!file.delete() && file.exists()) throw IOException("storage-probe-cleanup-failed")
    }
  }
}

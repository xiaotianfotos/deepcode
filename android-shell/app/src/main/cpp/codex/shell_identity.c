// Codex chooses its login shell from passwd, not $SHELL. Android's passwd shell
// is /system/bin/sh, which cannot execute the relocated Termux binaries. Expose
// the app-owned shell launcher for this UID only; preserve every other field.
#define _GNU_SOURCE
#include <dlfcn.h>
#include <pwd.h>
#include <stdlib.h>
#include <unistd.h>
int getpwuid_r(uid_t uid, struct passwd *pwd, char *buf, size_t size,
               struct passwd **result) {
  typedef int (*lookup_fn)(uid_t, struct passwd *, char *, size_t, struct passwd **);
  lookup_fn lookup = (lookup_fn)dlsym(RTLD_NEXT, "getpwuid_r");
  if (!lookup) return 5;
  int status = lookup(uid, pwd, buf, size, result);
  const char *shell = getenv("DSH_CODEX_SHELL");
  if (status == 0 && result && *result && uid == getuid() && shell && shell[0] == '/')
    pwd->pw_shell = (char *)shell;
  return status;
}

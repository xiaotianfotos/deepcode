// Android compatibility only. Codex still owns execution policy and approvals.
#include <errno.h>
#include <limits.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <unistd.h>
int main(int argc,char **argv){
  pid_t parent=getppid();
  if(parent==1||prctl(PR_SET_PDEATHSIG,SIGKILL)||getppid()!=parent)return 125;
  char executable[PATH_MAX],prefix[PATH_MAX],library[PATH_MAX],preload[PATH_MAX];
#ifdef DSH_CODEX_SHELL
  const char *root=getenv("TERMUX__PREFIX");
  if(!root||root[0]!='/'||strlen(root)>PATH_MAX-64)return 126;
  snprintf(prefix,sizeof(prefix),"%s",root);
  snprintf(executable,sizeof(executable),"%s/bin/bash",prefix);
  snprintf(library,sizeof(library),"%s/lib",prefix);
  snprintf(preload,sizeof(preload),"%s/lib/libtermux-exec-ld-preload.so",prefix);
  setenv("LD_LIBRARY_PATH",library,1);setenv("LD_PRELOAD",preload,1);
  setenv("TERMUX_EXEC__SYSTEM_LINKER_EXEC__MODE","force",1);
  setenv("TERMUX_EXEC__EXECVE_CALL__INTERCEPT","1",1);
  char **args=calloc((size_t)argc+2,sizeof(char*));
  if(!args)return 126;
  args[0]="/system/bin/linker64";args[1]=executable;
  for(int i=1;i<argc;i++)args[i+1]=argv[i];
  execv(args[0],args);
#else
  const char *native=getenv("DSH_CODEX_NATIVE_DIR");
  if(!native||native[0]!='/'||strlen(native)>PATH_MAX-64)return 126;
  snprintf(library,sizeof(library),"%s",native);
  snprintf(executable,sizeof(executable),"%s/libdsh_codex.so",native);
  setenv("LD_LIBRARY_PATH",library,1);
  snprintf(preload,sizeof(preload),"%s/libdsh_codex_identity.so",native);
  setenv("LD_PRELOAD",preload,1);
  setenv("CODEX_SELF_EXE",executable,1);argv[0]=executable;
  execv(executable,argv);
#endif
  fprintf(stderr,"Codex Android launch failed: %s\n",strerror(errno));return 126;
}

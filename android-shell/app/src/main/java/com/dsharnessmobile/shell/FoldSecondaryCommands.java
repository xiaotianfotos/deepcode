package com.dsharnessmobile.shell;

/** Foreground lease for the existing secondary display; never swaps the default display. */
final class FoldSecondaryCommands {
  private static String path(int uid){if(uid<10000)throw new IllegalArgumentException("app UID required");return "/data/local/tmp/dsh-fold-secondary-"+uid+".lease";}
  private static void token(String token){if(!token.matches("[a-f0-9]{32}"))throw new IllegalArgumentException("invalid lease token");}
  private static String quote(String s){return "'"+s.replace("'","'\"'\"'")+"'";}
  private static final String WATCH="""
    lease="$1"; token="$2"; app_pid="$3"
    previous=""; missed=0
    while [ "$(sed -n '1p' "$lease" 2>/dev/null)" = "$token" ]; do
      stamp="$(stat -c %Y "$lease" 2>/dev/null)"
      if [ "$stamp" = "$previous" ]; then missed=$((missed+1)); else missed=0; previous="$stamp"; fi
      if [ "$missed" -ge 12 ] || [ ! -d "/proc/$app_pid" ]; then
        if [ "$(sed -n '1p' "$lease" 2>/dev/null)" = "$token" ]; then
          cmd display disable-display 1
          rm -f "$lease"
        fi
        break
      fi
      sleep 1
    done
    """;
  static String acquire(int uid,int pid,String leaseToken){
    token(leaseToken);if(pid<100)throw new IllegalArgumentException("invalid PID");
    return "lease="+quote(path(uid))+"; token="+quote(leaseToken)+"; app_pid="+pid+";\n"+"""
      umask 077
      if ! dumpsys device_state | grep -q 'mOverrideState=Optional.empty'; then echo DSH_FOLD_BUSY; exit 1; fi
      if cmd display get-displays --ids-only | grep -qx 1; then echo DSH_FOLD_BUSY; exit 1; fi
      (set -C; printf '%s\n' "$token" "$app_pid" > "$lease") 2>/dev/null || { echo DSH_FOLD_BUSY; exit 1; }
      cmd display enable-display 1
      if ! cmd display get-displays --ids-only | grep -qx 1; then rm -f "$lease"; echo DSH_FOLD_NOT_GRANTED; exit 1; fi
      """+"nohup sh -c "+quote(WATCH)+" sh \"$lease\" \"$token\" \"$app_pid\" </dev/null >/dev/null 2>&1 &\necho DSH_FOLD_GRANTED";
  }
  static String heartbeat(int uid,String leaseToken){token(leaseToken);return "lease="+quote(path(uid))+"; token="+quote(leaseToken)+";\n"+"""
    [ "$(sed -n '1p' "$lease" 2>/dev/null)" = "$token" ] || exit 1
    if ! cmd display get-displays --ids-only | grep -qx 1; then cmd display enable-display 1; fi
    cmd display get-displays --ids-only | grep -qx 1 || exit 1
    touch "$lease" && echo DSH_FOLD_ALIVE
    """;}
  static String release(int uid,String leaseToken){token(leaseToken);return "lease="+quote(path(uid))+"; token="+quote(leaseToken)+";\n"+"""
    if [ "$(sed -n '1p' "$lease" 2>/dev/null)" = "$token" ]; then
      cmd display disable-display 1
      [ "$(sed -n '1p' "$lease" 2>/dev/null)" = "$token" ] && rm -f "$lease"
    fi
    echo DSH_FOLD_RELEASED
    """;}
}

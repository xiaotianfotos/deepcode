package com.dsharnessmobile.shell;

/** Fixed, validated shell-side lease. The app never accepts a user-supplied command here. */
final class FoldDualCommands {
  private static String path(int uid){if(uid<10000)throw new IllegalArgumentException("app UID required");return "/data/local/tmp/dsh-fold-"+uid+".lease";}
  private static void token(String token){if(!token.matches("[a-f0-9]{32}"))throw new IllegalArgumentException("invalid lease token");}
  private static String quote(String s){return "'"+s.replace("'","'\"'\"'")+"'";}
  private static final String WATCH="""
    lease="$1"; token="$2"; app_pid="$3"
    previous=""; missed=0
    while [ "$(sed -n '1p' "$lease" 2>/dev/null)" = "$token" ]; do
      stamp="$(stat -c %Y "$lease" 2>/dev/null)"
      if [ "$stamp" = "$previous" ]; then missed=$((missed+1)); else missed=0; previous="$stamp"; fi
      if [ "$missed" -ge 12 ] || [ ! -d "/proc/$app_pid" ]; then
        owner="$(sed -n '3p' "$lease")"
        current="$(dumpsys device_state | sed -n '/^Request: /p')"
        if [ "$current" = "$owner" ] && [ "$(sed -n '1p' "$lease")" = "$token" ]; then cmd device_state state reset; fi
        [ "$(sed -n '1p' "$lease" 2>/dev/null)" = "$token" ] && rm -f "$lease"
        break
      fi
      sleep 1
    done
    """;
  static String acquire(int state,int uid,int pid,String leaseToken){
    token(leaseToken);if((state!=5&&state!=6)||pid<100)throw new IllegalArgumentException("invalid state/PID");
    return "lease="+quote(path(uid))+"; token="+quote(leaseToken)+"; app_pid="+pid+"; state="+state+";\n"+"""
      umask 077
      if ! dumpsys device_state | grep -q 'mOverrideState=Optional.empty'; then echo DSH_FOLD_BUSY; exit 1; fi
      testfile="$lease.$token.tmp"
      printf '%s\n' "$token" "$app_pid" > "$testfile" || exit 1
      cmd device_state state "$state" || { rm -f "$testfile"; exit 1; }
      owner="$(dumpsys device_state | sed -n '/^Request: /p')"
      case "$owner" in *"mRequestedState=$state,"*) ;; *) rm -f "$testfile"; echo DSH_FOLD_NOT_GRANTED; exit 1;; esac
      printf '%s\n' "$owner" >> "$testfile"
      mv "$testfile" "$lease" || { cmd device_state state reset; exit 1; }
      """+"nohup sh -c "+quote(WATCH)+" sh \"$lease\" \"$token\" \"$app_pid\" </dev/null >/dev/null 2>&1 &\necho DSH_FOLD_GRANTED";
  }
  static String heartbeat(int uid,String leaseToken){token(leaseToken);return "lease="+quote(path(uid))+"; token="+quote(leaseToken)+";\n"+"""
    [ "$(sed -n '1p' "$lease" 2>/dev/null)" = "$token" ] || exit 1
    [ "$(dumpsys device_state | sed -n '/^Request: /p')" = "$(sed -n '3p' "$lease")" ] || exit 1
    touch "$lease" && echo DSH_FOLD_ALIVE
    """;}
  static String release(int uid,String leaseToken){token(leaseToken);return "lease="+quote(path(uid))+"; token="+quote(leaseToken)+";\n"+"""
    if [ "$(sed -n '1p' "$lease" 2>/dev/null)" = "$token" ]; then
      owner="$(sed -n '3p' "$lease")"
      [ "$(dumpsys device_state | sed -n '/^Request: /p')" = "$owner" ] && cmd device_state state reset
      [ "$(sed -n '1p' "$lease" 2>/dev/null)" = "$token" ] && rm -f "$lease"
    fi
    echo DSH_FOLD_RELEASED
    """;}
}

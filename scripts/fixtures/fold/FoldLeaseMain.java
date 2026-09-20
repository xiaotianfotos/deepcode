package com.dsharnessmobile.shell;
/** Host-side generator for the same owner-checked lease commands used by the APK. */
public final class FoldLeaseMain {
 public static void main(String[] a){
  int uid=Integer.parseInt(a[1]),pid=Integer.parseInt(a[3]);String token=a[2];
  System.out.print(switch(a[0]){
   case "acquire" -> FoldDualCommands.acquire(5,uid,pid,token);
   case "heartbeat" -> FoldDualCommands.heartbeat(uid,token);
   case "release" -> FoldDualCommands.release(uid,token);
   default -> throw new IllegalArgumentException("Unknown action");
  });
 }
}

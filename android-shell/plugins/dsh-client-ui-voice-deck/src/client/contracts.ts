import type {ReactNode} from 'react'
export interface Source<T>{getSnapshot():T;subscribe(fn:()=>void):()=>void}
export interface Row{id:string;displayTitle:string;running:boolean;blank:boolean}
export interface List{ids:string[];byId:Record<string,Row>;current?:string;phase:string}
export interface Editor {state:Source<{draft:string;phase:string}>;focus(atEnd?:boolean):boolean;composing():boolean;deleteBackward():boolean;send():boolean;attach():()=>void}
export interface Voice{snapshot():{phase:string;text?:string};subscribe(fn:()=>void):()=>void;start():void;stop():void;cancel():void;retry():void;discard():void}
export interface VoiceService{for(id:string):Voice;enabled():boolean;leave(id:string):void;busy():boolean;held():{sessionId:string;text:string|null}[]}
export interface Gamepad{snapshot():{enabled:boolean;connected:boolean;name:string};subscribe(fn:()=>void):()=>void;bind(fn:(intent:Intent)=>void):()=>void;stopRepeat():void}
export type Intent='sidebar'|'previous'|'next'|'record'|'delete'|'send'
export interface Context {
  layout:{toggleSidebar():void;setWorkbenchActive?(enabled:boolean):void}
  /** Optional-service lifecycle (Cordis 4.0.2 registry mixin): the callback
   * loads only while every dep is provided and is unloaded/re-run whenever a
   * dep is withdrawn or replaced; child effect cleanups release the service. */
  inject(deps:string[],callback:(ctx:Context)=>void):unknown
  provide(name:string,value:unknown):void
  effect(fn:()=>()=>void,label:string):void
  sessions:{list:Source<List>;open(id:string):void;acquireStage(id:string):()=>void}
  slots:{inject(name:string,fn:()=>()=>void):()=>void;register(options:object,component:unknown):()=>void;entries(name:string):{store:unknown}[];resolveStore(store:unknown,binding:unknown):{actions:{setView(view:string):void;openView(view:string,focus:string):void}}}
  uiSession:{adapter:{resolve(id:string):unknown}}
  uiConversation:{binding(id:string):{activate(view:string):void}}
  conversation:{blocks:{storeFor(id:string):Source<{reason:string}|undefined>}}
  deckInput:{for(id:string):Editor}
  androidVoice:VoiceService
  gamepadInput:Gamepad
}
export interface SurfaceProps{sessionId:string;part:'chat'|'composer';blocked?:{reason:string};openView:(view:string,focus:string)=>void}
export type Surface=(props:SurfaceProps)=>ReactNode

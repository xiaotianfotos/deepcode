import {mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import markdown from '../../../codex-skills/say/SKILL.md'
import python from '../../../codex-skills/say/scripts/say.py'
const hash=value=>createHash('sha256').update(value).digest('hex')
/** Only update files we installed; do not replace a user's own say skill. */
export function installSaySkill(directory){
 const marker=join(directory,'.deepcode-managed.json'),files={'SKILL.md':markdown,'scripts/say.py':python}
 return {setEnabled(enabled){
  let owned={};try{owned=JSON.parse(readFileSync(marker,'utf8'))}catch{}
  for(const [name,value] of Object.entries(files)){
   const path=join(directory,name)
   if(existsSync(path)&&![hash(value),owned[name]].includes(hash(readFileSync(path))))return
  }
  if(!enabled){if(owned['SKILL.md']&&existsSync(join(directory,'SKILL.md')))unlinkSync(join(directory,'SKILL.md'));return}
  mkdirSync(join(directory,'scripts'),{recursive:true,mode:0o700})
  for(const [name,value] of Object.entries(files)){const path=join(directory,name);writeFileSync(path+'.tmp',value,{mode:0o600});renameSync(path+'.tmp',path);owned[name]=hash(value)}
  writeFileSync(marker,JSON.stringify(owned),{mode:0o600})
 }}
}

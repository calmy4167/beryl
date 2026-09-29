import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const packageJson = JSON.parse(readFileSync('package.json','utf8'))
const additions = {
  react: '^19.2.8',
  'react-dom': '^19.2.8',
  'react-router-dom': '^7.8.2',
  '@types/react': '^19.2.17',
  '@types/react-dom': '^19.2.3'
}
for (const [name,version] of Object.entries(additions)) packageJson.devDependencies[name]=version
writeFileSync('package.json',JSON.stringify(packageJson,null,2)+'\n')

const lock=JSON.parse(readFileSync('package-lock.json','utf8'))
const headRaw=spawnSync('git',['show','HEAD:package-lock.json'],{encoding:'utf8'}).stdout
if(!headRaw)throw new Error('Unable to read the React dependency lock snapshot from HEAD')
const head=JSON.parse(headRaw)
const keys=['node_modules/react','node_modules/react-dom','node_modules/react-router','node_modules/react-router-dom','node_modules/scheduler','node_modules/cookie','node_modules/set-cookie-parser','node_modules/@types/react','node_modules/@types/react-dom','node_modules/csstype']
for(const key of keys){
  const entry=head.packages[key]
  if(!entry)continue
  lock.packages[key]={...entry,dev:true}
}
for(const [name,version] of Object.entries(additions))lock.packages[''].devDependencies[name]=version
writeFileSync('package-lock.json',JSON.stringify(lock,null,2)+'\n')
console.log(`Restored ${Object.keys(additions).length} React reference packages as dev dependencies and locked ${keys.filter(k=>head.packages[k]).length} package entries`)

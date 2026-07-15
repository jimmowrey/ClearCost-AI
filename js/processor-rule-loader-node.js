import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PACK_FILES,validateManifest} from './processor-rule-loader.js';

const __dirname=dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROCESSORS_DIR=join(__dirname,'..','processors');

export class NodeProcessorRuleLoader{
  #cache=new Map();
  #processorsDir;

  constructor({processorsDir=DEFAULT_PROCESSORS_DIR}={}){
    this.#processorsDir=processorsDir;
  }

  async getInstalledPacks(){
    const index=JSON.parse(readFileSync(join(this.#processorsDir,'index.json'),'utf8'));
    if(!Array.isArray(index?.packs)) throw new Error('Processor index must contain a packs array');
    return [...index.packs].sort();
  }

  validateManifest(manifest){
    return validateManifest(manifest);
  }

  async loadRulePack(processorId){
    if(this.#cache.has(processorId)) return this.#cache.get(processorId);
    const pack={};
    for(const name of PACK_FILES){
      pack[name]=JSON.parse(readFileSync(join(this.#processorsDir,processorId,`${name}.json`),'utf8'));
    }
    const validation=this.validateManifest(pack.manifest||{});
    if(!validation.valid) throw new Error(`Invalid manifest for processor '${processorId}': ${validation.errors.join(', ')}`);
    this.#cache.set(processorId,pack);
    return pack;
  }

  clearCache(){
    this.#cache.clear();
  }
}

export default NodeProcessorRuleLoader;

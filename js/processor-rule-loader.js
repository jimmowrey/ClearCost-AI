import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname=dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROCESSORS_DIR=join(__dirname,'..','processors');
const PACK_FILES=['manifest','layout','sections','aliases','fees','behaviors'];
const MANIFEST_REQUIRED=['id','name','version'];

export class ProcessorRuleLoader{
  #cache=new Map();
  #processorsDir;

  constructor(processorsDir=DEFAULT_PROCESSORS_DIR){
    this.#processorsDir=processorsDir;
  }

  /** Returns array of installed processor pack IDs (directory names under processors/). */
  getInstalledPacks(){
    return readdirSync(this.#processorsDir,{withFileTypes:true})
      .filter(e=>e.isDirectory())
      .map(e=>e.name)
      .sort();
  }

  /**
   * Validates a manifest object.
   * @param {object} manifest
   * @returns {{valid:boolean, errors:string[]}}
   */
  validateManifest(manifest){
    const errors=[];
    if(!manifest||typeof manifest!=='object'){errors.push('manifest must be a non-null object');return {valid:false,errors};}
    for(const field of MANIFEST_REQUIRED){
      if(!manifest[field])errors.push(`Missing required field: ${field}`);
      else if(typeof manifest[field]!=='string')errors.push(`Field '${field}' must be a string`);
    }
    if(manifest.normalizationBase!==undefined&&(typeof manifest.normalizationBase!=='number'||manifest.normalizationBase<=0))
      errors.push('normalizationBase must be a positive number');
    if(manifest.confidenceThreshold!==undefined&&(typeof manifest.confidenceThreshold!=='number'||manifest.confidenceThreshold<0||manifest.confidenceThreshold>1))
      errors.push('confidenceThreshold must be a number between 0 and 1');
    return {valid:errors.length===0,errors};
  }

  /**
   * Loads and caches a processor rule pack by its ID.
   * Throws if the pack directory does not exist or the manifest is invalid.
   * @param {string} processorId
   * @returns {object} rule pack with keys: manifest, layout, sections, aliases, fees, behaviors
   */
  loadRulePack(processorId){
    if(this.#cache.has(processorId))return this.#cache.get(processorId);

    const packDir=join(this.#processorsDir,processorId);
    if(!existsSync(packDir))throw new Error(`Processor pack not found: ${processorId}`);

    const pack={};
    for(const name of PACK_FILES){
      const filePath=join(packDir,`${name}.json`);
      if(existsSync(filePath)){
        try{pack[name]=JSON.parse(readFileSync(filePath,'utf-8'));}
        catch(e){throw new Error(`Failed to parse ${name}.json for processor '${processorId}': ${e.message}`);}
      }else{
        pack[name]=null;
      }
    }

    const validation=this.validateManifest(pack.manifest||{});
    if(!validation.valid)throw new Error(`Invalid manifest for processor '${processorId}': ${validation.errors.join(', ')}`);

    this.#cache.set(processorId,pack);
    return pack;
  }

  /** Clears the rule pack cache. */
  clearCache(){this.#cache.clear();}
}

export default ProcessorRuleLoader;

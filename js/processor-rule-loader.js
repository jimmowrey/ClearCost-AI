const PACK_FILES=['manifest','layout','sections','aliases','fees','behaviors'];
const MANIFEST_REQUIRED=['id','name','version'];
const DEFAULT_INDEX_URL=new URL('../processors/index.json',import.meta.url);
const DEFAULT_BASE_URL=new URL('../processors/',import.meta.url);

function defaultFetch(...args){
  if(typeof fetch!=='function') throw new Error('fetch is required to load processor rule packs');
  return fetch(...args);
}

async function fetchJson(fetchImpl,url,label){
  const response=await fetchImpl(url);
  if(!response.ok) throw new Error(`Failed to load ${label}: ${response.status} ${response.statusText}`);
  try{return await response.json();}
  catch(error){throw new Error(`Failed to parse ${label}: ${error.message}`);}
}

export function validateManifest(manifest){
  const errors=[];
  if(!manifest||typeof manifest!=='object'){errors.push('manifest must be a non-null object');return {valid:false,errors};}
  for(const field of MANIFEST_REQUIRED){
    if(!manifest[field]) errors.push(`Missing required field: ${field}`);
    else if(typeof manifest[field]!=='string') errors.push(`Field '${field}' must be a string`);
  }
  if(manifest.normalizationBase!==undefined&&(typeof manifest.normalizationBase!=='number'||manifest.normalizationBase<=0)) errors.push('normalizationBase must be a positive number');
  if(manifest.confidenceThreshold!==undefined&&(typeof manifest.confidenceThreshold!=='number'||manifest.confidenceThreshold<0||manifest.confidenceThreshold>1)) errors.push('confidenceThreshold must be a number between 0 and 1');
  return {valid:errors.length===0,errors};
}

export class ProcessorRuleLoader{
  #cache=new Map();
  #packIdsPromise=null;
  #indexUrl;
  #baseUrl;
  #fetchImpl;

  constructor({indexUrl=DEFAULT_INDEX_URL,baseUrl=DEFAULT_BASE_URL,fetchImpl=defaultFetch}={}){
    this.#indexUrl=new URL(indexUrl,DEFAULT_INDEX_URL);
    this.#baseUrl=new URL(baseUrl,DEFAULT_BASE_URL);
    this.#fetchImpl=fetchImpl;
  }

  async getInstalledPacks(){
    if(!this.#packIdsPromise){
      this.#packIdsPromise=fetchJson(this.#fetchImpl,this.#indexUrl,'processor index').then(data=>{
        if(!Array.isArray(data?.packs)) throw new Error('Processor index must contain a packs array');
        return [...data.packs].sort();
      });
    }
    return this.#packIdsPromise;
  }

  validateManifest(manifest){
    return validateManifest(manifest);
  }

  async loadRulePack(processorId){
    if(this.#cache.has(processorId)) return this.#cache.get(processorId);
    const promise=(async()=>{
      const pack={};
      await Promise.all(PACK_FILES.map(async name=>{
        const fileUrl=new URL(`${processorId}/${name}.json`,this.#baseUrl);
        pack[name]=await fetchJson(this.#fetchImpl,fileUrl,`${processorId}/${name}.json`);
      }));
      const validation=this.validateManifest(pack.manifest||{});
      if(!validation.valid) throw new Error(`Invalid manifest for processor '${processorId}': ${validation.errors.join(', ')}`);
      return pack;
    })();
    this.#cache.set(processorId,promise);
    try{return await promise;}
    catch(error){this.#cache.delete(processorId);throw error;}
  }

  clearCache(){
    this.#cache.clear();
    this.#packIdsPromise=null;
  }
}

export {PACK_FILES,MANIFEST_REQUIRED,DEFAULT_INDEX_URL,DEFAULT_BASE_URL};
export default ProcessorRuleLoader;

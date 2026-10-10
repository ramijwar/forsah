// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { compressAdImage } from '../src/imageCompression';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('rejects non-images and oversized input before decoding',async()=>{
  await expect(compressAdImage(new File(['bad'],'file.svg',{type:'image/svg+xml'}))).rejects.toThrow();
  const huge=new File(['x'],'huge.jpg',{type:'image/jpeg'});Object.defineProperty(huge,'size',{value:31*1024*1024});
  await expect(compressAdImage(huge)).rejects.toThrow('30 MB');
});
it('resizes camera images, reduces JPEG quality if necessary and releases the source URL',async()=>{
  const revoke=vi.fn();
  vi.stubGlobal('URL',{createObjectURL:()=> 'blob:camera',revokeObjectURL:revoke});
  vi.stubGlobal('Image',class {naturalWidth=4032;naturalHeight=3024;src='';decode(){return Promise.resolve();}});
  const draw=vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({fillStyle:'',fillRect:vi.fn(),drawImage:draw} as unknown as CanvasRenderingContext2D);
  const sizes:number[][]=[];const qualities:(number|undefined)[]=[];
  vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(function(this:HTMLCanvasElement,callback,_type,quality){
    sizes.push([this.width,this.height]);qualities.push(quality as number);
    callback(new Blob([new Uint8Array(qualities.length===1?3*1024*1024:12000)],{type:'image/jpeg'}));
  });
  const result=await compressAdImage(new File(['camera'],'camera.png',{type:'image/png'}));
  expect(sizes).toEqual([[1920,1440],[1920,1440]]);expect(qualities).toEqual([0.85,0.7]);
  expect(result.size).toBe(12000);expect(result.type).toBe('image/jpeg');expect(revoke).toHaveBeenCalledWith('blob:camera');
});

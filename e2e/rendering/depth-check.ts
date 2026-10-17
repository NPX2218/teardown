// D1: REGRESSION GUARD for the 2026-10-17 depth mismatch (baseline a1dfc3b).
// Bundle for a browser with esbuild; see the repair plan for the run command.
import * as THREE from 'three';
import * as shaders from '../../components/flight/fx/shaders';
const results: {name:string; pass:boolean; detail:unknown}[] = [];
for (const logarithmicDepthBuffer of [true, false]) {
 const renderer = new THREE.WebGLRenderer({logarithmicDepthBuffer});
 renderer.setSize(32,32);
 const errors: string[] = [];
 renderer.debug.onShaderError = (gl, _program, vertex, fragment) => errors.push((gl.getShaderInfoLog(vertex)||'')+(gl.getShaderInfoLog(fragment)||''));
 const target = new THREE.WebGLRenderTarget(32,32);
 renderer.setRenderTarget(target);
 const camera = new THREE.PerspectiveCamera(50,1,5e-8,80);
 const geo = new THREE.PlaneGeometry(0.0002,0.0002);
 geo.setAttribute('aSeed',new THREE.Float32BufferAttribute([0.5,0.5,0.5,0.5],1));
 geo.setAttribute('aDir',new THREE.Float32BufferAttribute(new Array(12).fill(0),3));
 geo.setAttribute('aVel',new THREE.Float32BufferAttribute(new Array(12).fill(0),3));
 const texture = new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1); texture.needsUpdate=true;
 const uniforms: Record<string, THREE.IUniform<number | THREE.Color | THREE.DataTexture>> = Object.fromEntries(['uTime','uBrightness','uVacuum','uFlicker','uLength','uRadius','uSmoke','uSpread','uOrange','uReduced','uAmount','uOpacity','uDrift','uFire','uFlash','uAge','uSpin','uFade','uScale','uSeed'].map(name=>[name,{value:1}]));
 for (const name of ['uHot','uFlame','uVacTint','uCream','uColor']) uniforms[name]={value:new THREE.Color(1,0,0)};
 uniforms.uMap={value:texture}; uniforms.uTime={value:0}; uniforms.uFlicker={value:0};
 for (const [name,vertexShader] of Object.entries(shaders)) {
  if (!name.endsWith('Vertex')) continue;
  const fragmentShader = shaders[(name.replace('Vertex','Fragment')) as keyof typeof shaders];
  const scene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms});
  const mesh = new THREE.InstancedMesh(geo,material,1); mesh.position.z=-0.00022; mesh.frustumCulled=false;
  scene.add(mesh); const before=errors.length; renderer.render(scene,camera);
  results.push({name:`${name} log=${logarithmicDepthBuffer}`,pass:errors.length===before,detail:errors.slice(before)});
  material.dispose();
 }
 for (const effectInFront of [true,false]) {
  const scene = new THREE.Scene();
  const blockerMat = new THREE.MeshBasicMaterial({color:0x00ff00});
  const blocker = new THREE.Mesh(geo,blockerMat); blocker.position.z = effectInFront ? -0.0003 : -0.00022;
  const effectMat = new THREE.ShaderMaterial({vertexShader:shaders.plumeVertex,fragmentShader:shaders.plumeFragment,uniforms,transparent:true,depthWrite:false});
  const effect = new THREE.Mesh(geo,effectMat); effect.position.z=effectInFront ? -0.00022 : -0.0003;
  scene.add(blocker,effect); renderer.render(scene,camera);
  const pixel = new Uint8Array(4); renderer.readRenderTargetPixels(target,16,16,1,1,pixel);
  results.push({name:`occlusion front=${effectInFront} log=${logarithmicDepthBuffer}`,pass:effectInFront ? pixel[0]>200 && pixel[1]<10 : pixel[1]>200 && pixel[0]<10,detail:Array.from(pixel)});
  blockerMat.dispose(); effectMat.dispose();
 }
 renderer.dispose(); target.dispose(); geo.dispose(); texture.dispose();
}
const pre=document.createElement('pre'); pre.id='depth-results'; pre.textContent=JSON.stringify({passed:results.filter(x=>x.pass).length,total:results.length,results},null,2); document.body.replaceChildren(pre);

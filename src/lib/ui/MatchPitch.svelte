<script>
  import { onMount } from 'svelte';
  import { createFootballRenderer } from './footballCanvas.js';
  let { kits, view = 'broadcast', label = 'Live football match' } = $props();
  let canvas = $state(null);
  let renderer = $state.raw(null);
  let reducedMotion = $state(false);
  let latestFrame;
  onMount(() => {
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>{reducedMotion=preference.matches;};update();
    preference.addEventListener('change',update);
    renderer=createFootballRenderer(canvas);
    renderer.setOptions({kits,view,reducedMotion});
    if(latestFrame)renderer.draw(latestFrame);
    return ()=>{preference.removeEventListener('change',update);renderer?.destroy();};
  });
  $effect(()=>{const options={kits,view,reducedMotion};renderer?.setOptions(options);});
  export function draw(frame,now) {latestFrame=frame;renderer?.draw(frame,now);}
</script>

<div class="pitch-surface" role="img" aria-label={label}><canvas bind:this={canvas} aria-hidden="true">The live pitch shows player movement and the ball. Match commentary and the score are available alongside it.</canvas></div>

<style>
  .pitch-surface, canvas { display:block; width:100%; height:100%; position:absolute; inset:0; }
</style>

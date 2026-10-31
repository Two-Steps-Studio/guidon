"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./scroll-stage.module.css";

/** Marketing camera move. Browser scrolling stays native; content is never hidden. */
export function ScrollStage({children}:{children:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const root=ref.current;
    if(!root || !window.IntersectionObserver)return;
    const surface=root.querySelector<HTMLElement>('[data-stage-surface]')!;
    const tilt=root.querySelector<HTMLElement>('[data-stage-tilt]')!;
    const pointer=matchMedia('(hover: hover) and (pointer: fine)');
    const halo=root.querySelector<HTMLElement>('[data-stage-halo]')!;
    const fill=root.querySelector<HTMLElement>('[data-stage-fill]')!;
    const enabled=matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');
    let visible=false, keyboard=false, frame=0, pointerFrame=0, pointerX=0, pointerY=0;
    const resetPointer=()=>{cancelAnimationFrame(pointerFrame);pointerFrame=0;tilt.style.transform='';};
    const onPointer=(event:PointerEvent)=>{
      if(event.pointerType!=='mouse'||!pointer.matches||!enabled.matches||keyboard)return;
      const bounds=surface.getBoundingClientRect();
      pointerX=Math.max(-1,Math.min(1,(event.clientX-bounds.left)/bounds.width*2-1));
      pointerY=Math.max(-1,Math.min(1,(event.clientY-bounds.top)/bounds.height*2-1));
      if(!pointerFrame)pointerFrame=requestAnimationFrame(()=>{pointerFrame=0;tilt.style.transform=`perspective(1400px) rotateX(${-pointerY*4}deg) rotateY(${pointerX*6}deg)`;});
    };
    const settle=()=>{resetPointer();surface.style.transform='';halo.style.transform='';halo.style.opacity='';fill.style.transform='scaleX(1)';root.dataset.stageProgress='1';};
    const update=()=>{
      frame=0;
      if(!enabled.matches || keyboard || document.hidden){settle();return;}
      const progress=Math.max(0,Math.min(1,(innerHeight*.4-root.getBoundingClientRect().top)/innerHeight));
      const remaining=1-progress;
      root.dataset.stageProgress=progress.toFixed(3);
      surface.style.transform=progress===1?'':`perspective(1400px) translateY(${remaining*100}px) rotateX(${remaining*38}deg) scale(${.78+.22*progress})`;
      halo.style.transform=`scale(${.85+.15*progress})`;
      halo.style.opacity=String(.3+.7*progress);
      fill.style.transform=`scaleX(${progress})`;
    };
    const schedule=()=>{if(visible&&!frame)frame=requestAnimationFrame(update);};
    const onPreference=()=>{root.dataset.enhanced=String(enabled.matches&&!keyboard);if(enabled.matches&&!keyboard)schedule();else settle();};
    // Keep the stage's height when settling keyboard motion to avoid moving focus.
    const onKey=()=>{keyboard=true;cancelAnimationFrame(frame);frame=0;settle();};
    const onVisibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;settle();}else schedule();};
    root.dataset.enhanced=String(enabled.matches);
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)schedule();else{cancelAnimationFrame(frame);frame=0;resetPointer();} });
    observer.observe(root);
    window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
    document.addEventListener('keydown',onKey,true);document.addEventListener('visibilitychange',onVisibility);
    enabled.addEventListener('change',onPreference);
    surface.addEventListener('pointermove',onPointer);surface.addEventListener('pointerleave',resetPointer);pointer.addEventListener('change',resetPointer);
    return()=>{surface.removeEventListener('pointermove',onPointer);surface.removeEventListener('pointerleave',resetPointer);pointer.removeEventListener('change',resetPointer);observer.disconnect();cancelAnimationFrame(frame);settle();delete root.dataset.enhanced;window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);document.removeEventListener('keydown',onKey,true);document.removeEventListener('visibilitychange',onVisibility);enabled.removeEventListener('change',onPreference);};
  },[]);
  return <div ref={ref} data-scroll-stage className={styles.stage}>
    <div className={styles.viewport}>
      <div data-stage-halo aria-hidden className={styles.halo}/>
      <div data-stage-surface className={styles.surface}><div data-stage-tilt className={styles.tilt}>{children}</div></div>
      <div aria-hidden className={styles.track}><div data-stage-fill className={styles.fill}/></div>
    </div>
  </div>;
}

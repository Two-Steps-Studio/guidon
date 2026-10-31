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
    const halo=root.querySelector<HTMLElement>('[data-stage-halo]')!;
    const fill=root.querySelector<HTMLElement>('[data-stage-fill]')!;
    const enabled=matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');
    let visible=false, keyboard=false, frame=0;
    const settle=()=>{surface.style.transform='';halo.style.transform='';halo.style.opacity='';fill.style.transform='scaleX(1)';root.dataset.stageProgress='1';};
    const update=()=>{
      frame=0;
      if(!enabled.matches || keyboard || document.hidden){settle();return;}
      const progress=Math.max(0,Math.min(1,(innerHeight*.4-root.getBoundingClientRect().top)/innerHeight));
      const remaining=1-progress;
      root.dataset.stageProgress=progress.toFixed(3);
      surface.style.transform=progress===1?'':`perspective(1400px) translateY(${remaining*40}px) rotateX(${remaining*24}deg) scale(${.9+.1*progress})`;
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
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)schedule();else{cancelAnimationFrame(frame);frame=0;} });
    observer.observe(root);
    window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
    document.addEventListener('keydown',onKey,true);document.addEventListener('visibilitychange',onVisibility);
    enabled.addEventListener('change',onPreference);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);settle();delete root.dataset.enhanced;window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);document.removeEventListener('keydown',onKey,true);document.removeEventListener('visibilitychange',onVisibility);enabled.removeEventListener('change',onPreference);};
  },[]);
  return <div ref={ref} data-scroll-stage className={styles.stage}>
    <div className={styles.viewport}>
      <div data-stage-halo aria-hidden className={styles.halo}/>
      <div data-stage-surface className={styles.surface}>{children}</div>
      <div aria-hidden className={styles.track}><div data-stage-fill className={styles.fill}/></div>
    </div>
  </div>;
}


// Debounce utility to delay execution of a function
export function debounce<T extends (...a:any[])=>any>(fn:T, ms:number){
  let t:number|undefined;
  return (...args:Parameters<T>) => {
    if (t) clearTimeout(t);
    t = window.setTimeout(()=>fn(...args), ms);
  };
}

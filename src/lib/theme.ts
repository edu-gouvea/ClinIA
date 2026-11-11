/** Runs before hydration so a saved dark theme does not flash a light surface. */
export const themeBootstrap = `(function(){var preference;try{preference=localStorage.getItem('clinia.theme')}catch(e){}document.documentElement.dataset.theme=preference==='dark'||(preference!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'})()`;

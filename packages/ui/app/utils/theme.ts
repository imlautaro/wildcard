// Appearance preference (System, Light or Dark), stored per browser. The resolved
// theme lives on <html data-theme="light|dark">; tokens.css and every dark rule key
// off that attribute instead of `prefers-color-scheme`, so an explicit choice wins
// over the system setting. `themeScript` runs inline in <head> before the first
// paint (no flash) and keeps following the system while the preference is System.
export const themeStorageKey = 'wildcard-theme';
export const themePreferences = ['system', 'light', 'dark'] as const;
export type ThemePreference = typeof themePreferences[number];

export const themeColors = { light: '#f9f9f9', dark: '#131313' } as const;

// Plain ES5 so it runs as-is in <head>. It creates its own color-scheme and
// theme-color <meta> tags. Exposes window.__wildcardTheme() to reapply
// after a change; other tabs follow through the `storage` event.
export const themeScript = `(function(){
var k=${JSON.stringify(themeStorageKey)},d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: dark)');
function pref(){try{var v=localStorage.getItem(k);return v==='light'||v==='dark'?v:'system'}catch(e){return 'system'}}
function apply(){var p=pref(),t=p==='system'?(m.matches?'dark':'light'):p;d.setAttribute('data-theme',t);d.setAttribute('data-theme-preference',p);
meta('theme-color',t==='dark'?${JSON.stringify(themeColors.dark)}:${JSON.stringify(themeColors.light)});meta('color-scheme',t);}
function meta(n,v){var e=document.head.querySelector('meta[data-wildcard-theme][name="'+n+'"]');if(!e){e=document.createElement('meta');e.setAttribute('name',n);e.setAttribute('data-wildcard-theme','');document.head.appendChild(e)}e.setAttribute('content',v)}
apply();m.addEventListener('change',apply);window.addEventListener('storage',function(e){if(e.key===k||e.key===null)apply()});
window.__wildcardTheme=apply;})();`;

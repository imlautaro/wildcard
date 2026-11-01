// True while the chat list and the content pane sit side by side. Keep the query in step
// with the 860px breakpoint in assets/css/main.css that collapses the shell to one pane.
export function useWideLayout() {
  const query = window.matchMedia('(min-width: 861px)');
  const wide = ref(query.matches);
  const update = () => { wide.value = query.matches; };
  query.addEventListener('change', update);
  onScopeDispose(() => query.removeEventListener('change', update));
  return wide;
}

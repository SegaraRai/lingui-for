declare module "*.wasm?init&sync" {
  function initSync(): WebAssembly.Instance;

  export default initSync;
}

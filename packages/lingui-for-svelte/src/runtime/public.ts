export {
  getLinguiContext,
  setLinguiContext,
  type LinguiContext,
} from "./core/context.ts";

// `createLinguiAccessors` is not exported. It is intended for lazily retrieving the i18n context,
// which is only needed when setting up the context inside a component. In that case, users have
// direct control over the context and can use it directly without needing `createLinguiAccessors`.

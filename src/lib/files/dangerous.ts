// Client-safe re-export of the dangerous-file constants/predicate (see `./constants.ts` for the
// canonical, import-free implementation). Kept as a separate module so browser code can import
// `@/lib/files/dangerous` without ever pulling in anything server-only, even if `constants.ts`
// grows server-only imports in the future.
export {
  DANGEROUS_EXTENSIONS,
  DANGEROUS_MIME_TYPES,
  SAFE_INLINE_IMAGE_MIME_TYPES,
  isDangerousFile,
  getFileExtension,
} from './constants';
export type { DangerousFileCandidate } from './constants';

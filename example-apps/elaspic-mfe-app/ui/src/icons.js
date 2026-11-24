/**
 * Preload EUI icons into the component cache.
 *
 * EuiIcon loads SVGs via dynamic import(), which Vite/Rollup cannot resolve
 * inside @elastic/eui, so runtime fetches 404. Static imports +
 * appendIconComponentCache avoid that. See https://github.com/elastic/eui/issues/5463
 */
import { appendIconComponentCache } from '@elastic/eui/es/components/icon/icon';
import { icon as arrowLeft } from '@elastic/eui/es/components/icon/assets/arrow_left';
import { icon as image } from '@elastic/eui/es/components/icon/assets/image';
import { icon as lock } from '@elastic/eui/es/components/icon/assets/lock';
import { icon as logoElastic } from '@elastic/eui/es/components/icon/assets/logo_elastic';
import { icon as plusInCircle } from '@elastic/eui/es/components/icon/assets/plus_in_circle';
import { icon as search } from '@elastic/eui/es/components/icon/assets/search';
import { icon as trash } from '@elastic/eui/es/components/icon/assets/trash';
import { icon as users } from '@elastic/eui/es/components/icon/assets/users';
import { icon as warning } from '@elastic/eui/es/components/icon/assets/warning';

appendIconComponentCache({
  arrowLeft,
  image,
  lock,
  logoElastic,
  plusInCircle,
  search,
  trash,
  users,
  warning,
});

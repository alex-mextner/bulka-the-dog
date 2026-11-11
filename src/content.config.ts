import { conlocaPages, conlocaData } from '@conloca/astro-cms/node/content';

import { dataSchemas } from './schemas/data';

export const collections = {
  pages: conlocaPages(),
  ...conlocaData({ dataSchemas }),
};

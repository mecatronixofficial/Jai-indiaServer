// src/common/types/express.d.ts
import 'express';

import { Request } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    csrfToken?: () => string;
  }
}

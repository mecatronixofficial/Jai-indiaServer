import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { R2Service } from './r2.service';

@Global() // 👈 optional but very useful
@Module({
  imports: [ConfigModule],
  providers: [
    R2Service,
    {
      provide: 'R2_CONFIG',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        endpoint: config.get<string>('R2_ENDPOINT'),
        accessKey: config.get<string>('R2_ACCESS_KEY'),
        secretKey: config.get<string>('R2_SECRET_KEY'),
        bucket: config.get<string>('R2_BUCKET'),
      }),
    },
  ],
  exports: [R2Service],
})
export class R2Module {}

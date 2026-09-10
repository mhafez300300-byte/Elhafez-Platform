import { Controller, Get } from '@nestjs/common';
import { Public } from '@elhafez/platform-contracts';
@Controller('health')
export class HealthController {
  @Public() @Get() check() { return { status: 'ok', service: 'elhafez-platform-core', timestamp: new Date().toISOString() }; }
}

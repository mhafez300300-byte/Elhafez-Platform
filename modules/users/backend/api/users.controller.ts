import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { parseWithSchema } from '@elhafez/validation';
import { RequirePermission, type AccessPrincipal } from '@elhafez/platform-contracts';
import { UsersService } from '../application/users.service';

const createSchema = z.object({ email: z.string().email(), displayName: z.string().min(1).max(120), platformAdmin: z.boolean().optional() });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) });
type AuthRequest = { user: AccessPrincipal };
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}
  @Get() @RequirePermission('core.users.read') list() { return this.service.list(); }
  @Post() @RequirePermission('core.users.manage') create(@Body() body: unknown, @Req() req: AuthRequest) { return this.service.create(parseWithSchema(createSchema, body), req.user.userId, req.user.platformAdmin); }
  @Patch(':id/status') @RequirePermission('core.users.manage') setStatus(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) { const input = parseWithSchema(statusSchema, body); return this.service.setStatus(id, input.status, req.user.userId); }
}

import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { NotificationsService } from './backend/application/notifications.service';
import { NOTIFICATION_REPOSITORY, IN_APP_NOTIFICATION_PROVIDER } from './backend/application/notification.repository';
import { PrismaNotificationRepository } from './backend/infrastructure/prisma-notification.repository';
import { InAppNotificationProvider } from './backend/infrastructure/in-app.provider';
import { NotificationsController } from './backend/api/notifications.controller';
@Module({})
export class NotificationsModule { static register(imports:NonNullable<ModuleMetadata['imports']>):DynamicModule{return{module:NotificationsModule,imports,controllers:[NotificationsController],providers:[NotificationsService,{provide:NOTIFICATION_REPOSITORY,useClass:PrismaNotificationRepository},{provide:IN_APP_NOTIFICATION_PROVIDER,useClass:InAppNotificationProvider}],exports:[NotificationsService]};} }

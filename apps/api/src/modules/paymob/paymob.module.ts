import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionsModule } from '../sessions/sessions.module';
import { CommerceModule } from '../commerce/commerce.module';
import { PaymobController } from './paymob.controller';
import { PaymobService } from './paymob.service';

/**
 * Real Paymob checkout (CF-S4). Orchestration lives here (PaymobService +
 * controller), while order/enrollment persistence stays in CommerceService
 * (imported below) so the two webhook fulfillment guarantees are identical.
 */
@Module({
  imports: [
    ConfigModule,
    CommerceModule,
    // SessionsModule keeps AuthGuard's SessionsService resolvable in this
    // module's DI context (same CF-BUG-001 fix as Commerce/TeacherModule).
    SessionsModule,
  ],
  controllers: [PaymobController],
  providers: [PaymobService],
})
export class PaymobModule {}

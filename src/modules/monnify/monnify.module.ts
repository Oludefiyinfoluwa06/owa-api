import { Module } from '@nestjs/common';
import { MonnifyService } from './monnify.service';
import { MonnifyController } from './monnify.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [MonnifyController],
  providers: [MonnifyService],
  exports: [MonnifyService],
})
export class MonnifyModule {}

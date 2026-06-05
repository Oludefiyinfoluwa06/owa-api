import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { CloudinaryModule } from '../../common/cloudinary/cloudinary.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [CloudinaryModule, UsersModule],
  controllers: [DriversController],
  providers: [DriversService],
})
export class DriversModule {}

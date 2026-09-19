import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envConfig } from './config/env.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { MonnifyModule } from './modules/monnify/monnify.module';
import { TransactionModule } from './modules/transaction/transaction.module';
import { PaymentModule } from './modules/payment/payment.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';
import { TripsModule } from './modules/trips/trips.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [envConfig],
      envFilePath: '.env',
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('db.uri'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    WalletModule,
    MonnifyModule,
    TransactionModule,
    PaymentModule,
    DriversModule,
    CloudinaryModule,
    TripsModule,
    NotificationsModule,
    ActivityLogModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

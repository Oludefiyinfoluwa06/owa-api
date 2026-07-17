import { IsNotEmpty, IsString } from 'class-validator';
import { VehicleType } from '../../../modules/users/schemas/user.schema';

export class CreateDriverDto {
  @IsString()
  @IsNotEmpty()
  vehicleType: VehicleType;

  @IsString()
  @IsNotEmpty()
  plateNumber: string;
}

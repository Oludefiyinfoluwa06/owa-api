import { Controller } from '@nestjs/common';
import { MonnifyService } from './monnify.service';

@Controller('monnify')
export class MonnifyController {
  constructor(private readonly monnifyService: MonnifyService) {}
}

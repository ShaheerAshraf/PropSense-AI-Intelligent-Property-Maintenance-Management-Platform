import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [PropertiesModule],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}

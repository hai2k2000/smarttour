import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FilesModule } from '../files/files.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [DatabaseModule, FilesModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}

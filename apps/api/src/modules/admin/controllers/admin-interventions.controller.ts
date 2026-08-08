import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { AdminRoleGuard } from '../../auth/guards/admin-role.guard';
import { AdminInterventionsService } from '../services/admin-interventions.service';
import { ListInterventionsQueryDto } from '../dto/list-interventions-query.dto';
import { UpdateInterventionStatusDto } from '../dto/update-intervention-status.dto';

@Controller('api/v1/admin/interventions')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminInterventionsController {
  constructor(
    private readonly adminInterventionsService: AdminInterventionsService,
  ) {}

  @Get()
  listInterventions(@Query() query: ListInterventionsQueryDto) {
    return this.adminInterventionsService.listInterventions(query);
  }

  @Patch(':interventionId/status')
  async updateStatus(
    @Param('interventionId') interventionId: string,
    @Body() dto: UpdateInterventionStatusDto,
  ) {
    await this.adminInterventionsService.updateStatus(
      interventionId,
      dto.status,
    );
  }

  @Delete(':interventionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteIntervention(@Param('interventionId') interventionId: string) {
    await this.adminInterventionsService.deleteIntervention(interventionId);
  }
}

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AiAnalysisFeedbackDto } from './dto/ai-analysis-feedback.dto';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('maintenance-requests/:id/analyze')
  @Roles(UserRole.OWNER)
  analyzeText(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.aiService.analyzeMaintenanceRequest(user, id);
  }

  @Post('maintenance-requests/:id/attachments/:attachmentId/analyze')
  @Roles(UserRole.OWNER)
  analyzeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.aiService.analyzeMaintenanceImage(user, id, attachmentId);
  }

  @Post('maintenance-requests/:id/attachments/:attachmentId/analyze-combined')
  @Roles(UserRole.OWNER)
  analyzeCombined(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.aiService.analyzeCombined(user, id, attachmentId);
  }

  @Get('maintenance-requests/:id/analyses')
  @Roles(UserRole.OWNER)
  listAnalyses(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.aiService.listAnalyses(user, id);
  }

  @Post('analyses/:id/feedback')
  @Roles(UserRole.OWNER)
  feedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AiAnalysisFeedbackDto,
  ) {
    return this.aiService.submitFeedback(user, id, dto);
  }

  @Get('insights')
  @Roles(UserRole.OWNER)
  insights(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.getInsights(user);
  }

  @Get('performance')
  @Roles(UserRole.OWNER)
  performance(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.getPerformance(user);
  }
}

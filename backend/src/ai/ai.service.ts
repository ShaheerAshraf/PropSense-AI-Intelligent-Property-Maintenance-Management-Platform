import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  AiAnalysisSource,
  AiSafetyLevel,
  MaintenanceCategory,
  MaintenancePriority,
  NotificationType,
  TechnicianAvailability,
  UserRole,
  WorkOrderStatus,
} from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AiAnalysisFeedbackDto } from './dto/ai-analysis-feedback.dto';
import {
  parseAndValidateGeminiSmartAnalysis,
  type GeminiSmartAnalysisDto,
} from './dto/gemini-smart-analysis.dto';
import {
  SAFETY_DISCLAIMER,
  SMART_ANALYSIS_SCHEMA,
  buildSmartAnalysisPrompt,
} from './ai.prompts';

const GEMINI_MODEL = 'gemini-flash-latest';
const LOW_CONFIDENCE = 0.55;
const RECURRING_MONTHS = 4;
const RECURRING_THRESHOLD = 3;
const DUPLICATE_LOOKBACK = 20;

type OwnedRequest = {
  id: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  propertyId: string;
  unitId: string | null;
};

@Injectable()
export class AiService {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {
    const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    this.client = new GoogleGenAI({ apiKey });
    this.model =
      this.configService.get<string>('GEMINI_MODEL') ?? GEMINI_MODEL;
  }

  async analyzeMaintenanceRequest(
    user: AuthenticatedUser,
    maintenanceRequestId: string,
  ) {
    const request = await this.requireOwnedRequest(user, maintenanceRequestId);
    const analysis = await this.runSmartAnalysis(request, 'TEXT');
    return this.persistAnalysis(user, request, analysis, {
      source: AiAnalysisSource.TEXT,
    });
  }

  async analyzeMaintenanceImage(
    user: AuthenticatedUser,
    maintenanceRequestId: string,
    attachmentId: string,
  ) {
    const request = await this.requireOwnedRequest(user, maintenanceRequestId);
    const attachment = await this.requireAttachment(
      request.id,
      attachmentId,
    );
    const image = await this.supabase.downloadImage(attachment.fileUrl);
    const analysis = await this.runSmartAnalysis(request, 'IMAGE', image);
    return this.persistAnalysis(user, request, analysis, {
      source: AiAnalysisSource.IMAGE,
      attachmentId: attachment.id,
    });
  }

  async analyzeCombined(
    user: AuthenticatedUser,
    maintenanceRequestId: string,
    attachmentId: string,
  ) {
    const request = await this.requireOwnedRequest(user, maintenanceRequestId);
    const attachment = await this.requireAttachment(
      request.id,
      attachmentId,
    );
    const image = await this.supabase.downloadImage(attachment.fileUrl);
    const analysis = await this.runSmartAnalysis(request, 'TEXT_IMAGE', image);
    return this.persistAnalysis(user, request, analysis, {
      source: AiAnalysisSource.TEXT_IMAGE,
      attachmentId: attachment.id,
    });
  }

  async listAnalyses(user: AuthenticatedUser, maintenanceRequestId: string) {
    await this.requireOwnedRequest(user, maintenanceRequestId);
    return this.prisma.aIAnalysis.findMany({
      where: { maintenanceRequestId },
      include: {
        recommendedTechnician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            availability: true,
          },
        },
        attachment: {
          select: { id: true, fileName: true, kind: true },
        },
        feedbackBy: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async submitFeedback(
    user: AuthenticatedUser,
    analysisId: string,
    dto: AiAnalysisFeedbackDto,
  ) {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only owners can submit AI feedback');
    }

    const analysis = await this.prisma.aIAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        maintenanceRequest: {
          select: {
            id: true,
            property: { select: { ownerId: true } },
          },
        },
      },
    });
    if (!analysis) {
      throw new NotFoundException('AI analysis not found');
    }

    const owner = await this.prisma.owner.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!owner || analysis.maintenanceRequest.property.ownerId !== owner.id) {
      throw new NotFoundException('AI analysis not found');
    }

    const updated = await this.prisma.aIAnalysis.update({
      where: { id: analysisId },
      data: {
        ownerFinalPriority: dto.ownerFinalPriority,
        ownerAcceptedPriority: dto.ownerAcceptedPriority,
        feedbackUseful: dto.feedbackUseful,
        feedbackNote: dto.feedbackNote?.trim() || null,
        feedbackAt: new Date(),
        feedbackByUserId: user.id,
      },
    });

    await this.activity.record({
      userId: user.id,
      action: 'AI_FEEDBACK_SUBMITTED',
      entityType: 'MaintenanceRequest',
      entityId: analysis.maintenanceRequestId,
      description: `Owner feedback on AI recommendation (useful=${dto.feedbackUseful})`,
      newValues: {
        analysisId,
        ownerFinalPriority: dto.ownerFinalPriority,
        ownerAcceptedPriority: dto.ownerAcceptedPriority,
        feedbackUseful: dto.feedbackUseful,
      },
    });

    return updated;
  }

  async getInsights(user: AuthenticatedUser) {
    const ownerId = await this.requireOwnerId(user);

    const [
      categoryGroups,
      propertyFrequency,
      recurringUnits,
      highPriorityOpen,
      recentDuplicates,
    ] = await Promise.all([
      this.prisma.maintenanceRequest.groupBy({
        by: ['category'],
        where: { property: { ownerId } },
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
      }),
      this.prisma.$queryRaw<
        Array<{ property_id: string; property_name: string; count: number }>
      >`
        SELECT p.id AS property_id,
               p.name AS property_name,
               COUNT(mr.id)::int AS count
        FROM "Property" p
        LEFT JOIN "MaintenanceRequest" mr ON mr."propertyId" = p.id
        WHERE p."ownerId" = ${ownerId}
        GROUP BY p.id, p.name
        ORDER BY count DESC, p.name ASC
        LIMIT 5
      `,
      this.prisma.$queryRaw<
        Array<{
          unit_id: string;
          unit_number: string;
          property_name: string;
          category: string;
          count: number;
        }>
      >`
        SELECT u.id AS unit_id,
               u."unitNumber" AS unit_number,
               p.name AS property_name,
               mr.category::text AS category,
               COUNT(*)::int AS count
        FROM "MaintenanceRequest" mr
        JOIN "Unit" u ON u.id = mr."unitId"
        JOIN "Property" p ON p.id = mr."propertyId"
        WHERE p."ownerId" = ${ownerId}
          AND mr."createdAt" >= NOW() - INTERVAL '4 months'
        GROUP BY u.id, u."unitNumber", p.name, mr.category
        HAVING COUNT(*) >= ${RECURRING_THRESHOLD}
        ORDER BY count DESC
        LIMIT 10
      `,
      this.prisma.maintenanceRequest.count({
        where: {
          property: { ownerId },
          priority: {
            in: [MaintenancePriority.HIGH, MaintenancePriority.CRITICAL],
          },
          status: {
            notIn: ['CLOSED', 'CANCELLED', 'COMPLETED'],
          },
        },
      }),
      this.prisma.aIAnalysis.findMany({
        where: {
          possibleDuplicate: true,
          maintenanceRequest: { property: { ownerId } },
        },
        select: {
          id: true,
          maintenanceRequestId: true,
          relatedRequestIds: true,
          createdAt: true,
          maintenanceRequest: { select: { title: true, unitId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      mostCommonProblem: categoryGroups[0]
        ? {
            category: categoryGroups[0].category,
            count: categoryGroups[0]._count._all,
          }
        : null,
      highestMaintenanceFrequencyProperty: propertyFrequency[0]
        ? {
            propertyId: propertyFrequency[0].property_id,
            name: propertyFrequency[0].property_name,
            requestCount: propertyFrequency[0].count,
          }
        : null,
      potentialRecurringIssues: recurringUnits.map((row) => ({
        unitId: row.unit_id,
        unitNumber: row.unit_number,
        propertyName: row.property_name,
        category: row.category,
        count: row.count,
        windowMonths: RECURRING_MONTHS,
        insight: `Potential recurring maintenance issue: Unit ${row.unit_number} has ${row.count} ${row.category} requests within ${RECURRING_MONTHS} months`,
      })),
      highPriorityUnresolvedRequests: highPriorityOpen,
      recentPossibleDuplicates: recentDuplicates,
      categoryBreakdown: categoryGroups.map((g) => ({
        category: g.category,
        count: g._count._all,
      })),
    };
  }

  async getPerformance(user: AuthenticatedUser) {
    const ownerId = await this.requireOwnerId(user);
    const where = { maintenanceRequest: { property: { ownerId } } };

    const [total, avgConfidence, withFeedback, accepted, rejectedUseful] =
      await Promise.all([
        this.prisma.aIAnalysis.count({ where }),
        this.prisma.aIAnalysis.aggregate({
          where: { ...where, confidenceScore: { not: null } },
          _avg: { confidenceScore: true },
        }),
        this.prisma.aIAnalysis.count({
          where: { ...where, feedbackUseful: { not: null } },
        }),
        this.prisma.aIAnalysis.count({
          where: { ...where, ownerAcceptedPriority: true },
        }),
        this.prisma.aIAnalysis.groupBy({
          by: ['feedbackUseful'],
          where: { ...where, feedbackUseful: { not: null } },
          _count: { _all: true },
        }),
      ]);

    const usefulYes =
      rejectedUseful.find((r) => r.feedbackUseful === 'YES')?._count._all ?? 0;
    const usefulNo =
      rejectedUseful.find((r) => r.feedbackUseful === 'NO')?._count._all ?? 0;
    const feedbackTotal = usefulYes + usefulNo;
    const priorityDecided = await this.prisma.aIAnalysis.count({
      where: { ...where, ownerAcceptedPriority: { not: null } },
    });
    const rejectedPriority = await this.prisma.aIAnalysis.count({
      where: { ...where, ownerAcceptedPriority: false },
    });

    return {
      totalAiAnalyses: total,
      averageConfidence: avgConfidence._avg.confidenceScore,
      feedbackSubmitted: withFeedback,
      ownerAcceptedRecommendations: accepted,
      ownerRejectedRecommendations: rejectedPriority,
      aiPriorityAcceptanceRate:
        priorityDecided > 0
          ? Number(((accepted / priorityDecided) * 100).toFixed(1))
          : null,
      ownerMarkedUsefulRate:
        feedbackTotal > 0
          ? Number(((usefulYes / feedbackTotal) * 100).toFixed(1))
          : null,
      usefulYes,
      usefulNo,
      note: 'Acceptance rate compares AI priority recommendation vs owner-reported decision, not absolute ground-truth accuracy.',
    };
  }

  private async persistAnalysis(
    user: AuthenticatedUser,
    request: OwnedRequest,
    analysis: GeminiSmartAnalysisDto,
    opts: { source: AiAnalysisSource; attachmentId?: string },
  ) {
    const [duplicate, recurring, technician, costInsight] = await Promise.all([
      this.detectPossibleDuplicates(request),
      this.detectRecurringIssue(request, analysis.category),
      this.recommendTechnician(analysis.category),
      this.buildCostInsight(request.propertyId, analysis.category),
    ]);

    const humanReview =
      analysis.humanReviewRecommended ||
      analysis.confidenceScore < LOW_CONFIDENCE ||
      analysis.categoryConfidence < LOW_CONFIDENCE ||
      analysis.priorityConfidence < LOW_CONFIDENCE ||
      duplicate.possibleDuplicate;

    const summary = this.formatSummary(analysis);

    const saved = await this.prisma.aIAnalysis.create({
      data: {
        maintenanceRequestId: request.id,
        attachmentId: opts.attachmentId,
        source: opts.source,
        category: analysis.category,
        priority: analysis.priority,
        summary,
        possibleCause: analysis.possibleCause?.trim() || null,
        recommendedAction: analysis.recommendedAction?.trim() || null,
        visibleIssue: analysis.visibleIssue?.trim() || null,
        severity: analysis.severity ?? null,
        safetyWarning: analysis.safetyWarning?.trim() || null,
        safetyLevel: analysis.safetyLevel,
        safetyDisclaimer: SAFETY_DISCLAIMER,
        categoryConfidence: analysis.categoryConfidence,
        priorityConfidence: analysis.priorityConfidence,
        confidenceScore: analysis.confidenceScore,
        humanReviewRecommended: humanReview,
        possibleDuplicate: duplicate.possibleDuplicate,
        relatedRequestIds: duplicate.relatedRequestIds,
        recurringIssueDetected: recurring.detected,
        recurringInsight: recurring.insight,
        recommendedTechnicianId: technician?.technicianId ?? null,
        technicianRecommendReason: technician?.reason ?? null,
        typicalCostEstimate: costInsight.typicalCost,
        costCurrency: costInsight.currency,
        costInsightNote: costInsight.note,
        unusuallyExpensive: costInsight.unusuallyExpensive,
        model: this.model,
      },
      include: {
        recommendedTechnician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            availability: true,
          },
        },
      },
    });

    await this.activity.record({
      userId: user.id,
      action: 'AI_ANALYSIS_COMPLETED',
      entityType: 'MaintenanceRequest',
      entityId: request.id,
      description: `AI ${opts.source} analysis completed (safety=${analysis.safetyLevel})`,
      newValues: {
        analysisId: saved.id,
        source: opts.source,
        recommendedPriority: analysis.priority,
        recommendedCategory: analysis.category,
        humanReviewRecommended: humanReview,
        possibleDuplicate: duplicate.possibleDuplicate,
      },
    });

    await this.notifications.notify({
      userId: user.id,
      type: NotificationType.AI_ANALYSIS_COMPLETED,
      title: humanReview
        ? 'AI analysis ready — human review recommended'
        : 'AI analysis ready',
      message: `${opts.source} analysis completed for "${request.title}"`,
      entityType: 'AIAnalysis',
      entityId: saved.id,
    });

    return {
      ...saved,
      ownerPriorityUnchanged: request.priority,
      ownerCategoryUnchanged: request.category,
      recommendationNote:
        'AI recommendations are advisory only. Owner priority/category were not modified.',
    };
  }

  private formatSummary(analysis: GeminiSmartAnalysisDto) {
    const issue = analysis.summary.trim();
    const cause = analysis.possibleCause?.trim();
    const action = analysis.recommendedAction?.trim();
    return [
      `Issue: ${issue}`,
      cause ? `Likely cause: ${cause}` : null,
      action ? `Recommended action: ${action}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async detectPossibleDuplicates(request: OwnedRequest) {
    if (!request.unitId) {
      return { possibleDuplicate: false, relatedRequestIds: [] as string[] };
    }

    const prior = await this.prisma.maintenanceRequest.findMany({
      where: {
        unitId: request.unitId,
        id: { not: request.id },
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: DUPLICATE_LOOKBACK,
    });

    const tokens = this.tokenize(`${request.title} ${request.description}`);
    const related = prior
      .map((item) => {
        const other = this.tokenize(`${item.title} ${item.description}`);
        const overlap = tokens.filter((t) => other.includes(t)).length;
        const score =
          overlap / Math.max(tokens.length, 1) +
          (item.category === request.category ? 0.25 : 0);
        return { id: item.id, score };
      })
      .filter((item) => item.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => item.id);

    return {
      possibleDuplicate: related.length > 0,
      relatedRequestIds: related,
    };
  }

  private async detectRecurringIssue(
    request: OwnedRequest,
    category: MaintenanceCategory,
  ) {
    if (!request.unitId) {
      return { detected: false, insight: null as string | null };
    }

    const since = new Date();
    since.setMonth(since.getMonth() - RECURRING_MONTHS);

    const count = await this.prisma.maintenanceRequest.count({
      where: {
        unitId: request.unitId,
        category,
        createdAt: { gte: since },
      },
    });

    if (count < RECURRING_THRESHOLD) {
      return { detected: false, insight: null };
    }

    return {
      detected: true,
      insight: `Potential recurring maintenance issue: ${count} ${category} requests for this unit within ${RECURRING_MONTHS} months`,
    };
  }

  private async recommendTechnician(category: MaintenanceCategory) {
    const technicians = await this.prisma.technician.findMany({
      where: {
        isActive: true,
        skills: { some: { skill: category } },
      },
      include: {
        skills: true,
        workOrders: {
          where: {
            status: {
              in: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS],
            },
          },
          select: { id: true },
        },
      },
    });

    if (technicians.length === 0) {
      return null;
    }

    const ranked = technicians
      .map((tech) => {
        const workload = tech.workOrders.length;
        const availabilityScore =
          tech.availability === TechnicianAvailability.AVAILABLE
            ? 3
            : tech.availability === TechnicianAvailability.BUSY
              ? 1
              : 0;
        const skillScore = tech.skills.some((s) => s.skill === category)
          ? 2
          : 0;
        const score = availabilityScore + skillScore - workload;
        return { tech, workload, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best || best.score <= 0) {
      return null;
    }

    return {
      technicianId: best.tech.id,
      reason: [
        `${category} specialization`,
        `Currently ${best.tech.availability.toLowerCase()}`,
        `${best.workload} active assignment(s)`,
      ].join(' + '),
    };
  }

  private async buildCostInsight(
    propertyId: string,
    category: MaintenanceCategory,
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{ avg_amount: number | null; sample_size: number }>
    >`
      SELECT AVG(mc.amount)::float AS avg_amount,
             COUNT(*)::int AS sample_size
      FROM "MaintenanceCost" mc
      JOIN "MaintenanceRequest" mr ON mr.id = mc."maintenanceRequestId"
      WHERE mr."propertyId" = ${propertyId}
        AND mr.category = ${category}::"MaintenanceCategory"
        AND mc.status = 'APPROVED'
    `;

    const avg = rows[0]?.avg_amount ?? null;
    const sample = rows[0]?.sample_size ?? 0;

    if (!avg || sample < 2) {
      return {
        typicalCost: null as number | null,
        currency: 'EUR',
        note:
          sample === 0
            ? 'Not enough approved expense history for a cost insight.'
            : 'Limited expense history; treat typical cost as provisional.',
        unusuallyExpensive: false,
      };
    }

    return {
      typicalCost: Number(avg.toFixed(2)),
      currency: 'EUR',
      note: `Typical approved ${category} repair cost based on ${sample} expenses: €${avg.toFixed(2)}. Advisory only — not an automatic financial decision.`,
      unusuallyExpensive: false,
    };
  }

  private tokenize(text: string) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3);
  }

  private async runSmartAnalysis(
    request: OwnedRequest,
    mode: 'TEXT' | 'IMAGE' | 'TEXT_IMAGE',
    image?: { buffer: Buffer; contentType: string },
  ) {
    const prompt = buildSmartAnalysisPrompt({
      mode,
      title: request.title,
      description: request.description,
      category: request.category,
      priority: request.priority,
    });

    const inlineImage = image
      ? {
          mimeType: this.normalizeMimeType(image.contentType),
          data: image.buffer.toString('base64'),
        }
      : undefined;

    const parsed = await this.generateJson(
      prompt,
      SMART_ANALYSIS_SCHEMA,
      inlineImage,
    );

    try {
      const analysis = parseAndValidateGeminiSmartAnalysis(parsed);
      if (
        analysis.safetyLevel === AiSafetyLevel.URGENT &&
        !analysis.safetyWarning?.trim()
      ) {
        analysis.safetyWarning =
          'Urgent automated safety flag — verify hazards before proceeding.';
      }
      return analysis;
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private async generateJson(
    prompt: string,
    schema: unknown,
    inlineImage?: { mimeType: string; data: string },
  ): Promise<unknown> {
    let rawText: string | undefined;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents: inlineImage
            ? [
                {
                  role: 'user',
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType: inlineImage.mimeType,
                        data: inlineImage.data,
                      },
                    },
                  ],
                },
              ]
            : prompt,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
          },
        });
        rawText = response.text;
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error as Error;
        const message = lastError.message || '';
        const retryable =
          message.includes('"code":503') ||
          message.includes('"code":429') ||
          message.includes('UNAVAILABLE') ||
          message.includes('RESOURCE_EXHAUSTED');
        if (!retryable || attempt === 3) {
          throw new InternalServerErrorException(
            `Gemini request failed: ${message}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
    }

    if (lastError) {
      throw new InternalServerErrorException(
        `Gemini request failed: ${lastError.message}`,
      );
    }

    if (!rawText) {
      throw new InternalServerErrorException('Gemini returned an empty response');
    }

    try {
      return JSON.parse(rawText);
    } catch {
      throw new BadRequestException('Gemini response was not valid JSON');
    }
  }

  private async requireAttachment(
    maintenanceRequestId: string,
    attachmentId: string,
  ) {
    const attachment = await this.prisma.maintenanceAttachment.findFirst({
      where: { id: attachmentId, maintenanceRequestId },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found for this request');
    }
    return attachment;
  }

  private async requireOwnedRequest(
    user: AuthenticatedUser,
    maintenanceRequestId: string,
  ): Promise<OwnedRequest> {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException(
        'Only property owners can trigger AI analysis',
      );
    }

    const owner = await this.prisma.owner.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!owner) {
      throw new ForbiddenException('Owner profile required');
    }

    const request = await this.prisma.maintenanceRequest.findFirst({
      where: {
        id: maintenanceRequestId,
        property: { ownerId: owner.id },
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        priority: true,
        propertyId: true,
        unitId: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    return request;
  }

  private async requireOwnerId(user: AuthenticatedUser) {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Owner access required');
    }
    const owner = await this.prisma.owner.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!owner) throw new ForbiddenException('Owner profile required');
    return owner.id;
  }

  private normalizeMimeType(contentType: string): string {
    if (contentType === 'image/jpg') return 'image/jpeg';
    if (
      contentType === 'image/jpeg' ||
      contentType === 'image/png' ||
      contentType === 'image/webp'
    ) {
      return contentType;
    }
    return 'image/jpeg';
  }
}

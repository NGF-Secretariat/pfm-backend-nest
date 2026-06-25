import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrafficService {
  constructor(private prisma: PrismaService) {}

  async logVisit(data: { visitorId: string; section: string; page: string }) {
    try {
      const log = await this.prisma.trafficLog.create({
        data: {
          visitorId: data.visitorId,
          section: data.section,
          page: data.page,
        },
      });
      return { success: true, data: log };
    } catch (error) {
      console.error('Error logging visit:', error);
      return { success: false, message: 'Failed to log traffic' };
    }
  }

  async getStats() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Fetch logs from the last 30 days
      const logs = await this.prisma.trafficLog.findMany({
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      // Fetch all unique visitors count ever
      const totalUniqueResult = await this.prisma.trafficLog.groupBy({
        by: ['visitorId'],
      });
      const totalUniqueVisitors = totalUniqueResult.length;

      // Aggregations
      const dailyMap = new Map<string, { views: number; visitors: Set<string> }>();
      const sectionMap = new Map<string, number>();
      const pageMap = new Map<string, number>();

      logs.forEach(log => {
        // Daily
        const dateStr = log.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
        if (!dailyMap.has(dateStr)) {
          dailyMap.set(dateStr, { views: 0, visitors: new Set<string>() });
        }
        const daily = dailyMap.get(dateStr)!;
        daily.views++;
        daily.visitors.add(log.visitorId);

        // Sections
        sectionMap.set(log.section, (sectionMap.get(log.section) || 0) + 1);

        // Pages
        pageMap.set(log.page, (pageMap.get(log.page) || 0) + 1);
      });

      const trafficPerDay = Array.from(dailyMap.entries()).map(([date, data]) => ({
        date,
        views: data.views,
        visitors: data.visitors.size,
      }));

      const sectionsVisited = Array.from(sectionMap.entries()).map(([section, count]) => ({
        section,
        count,
      })).sort((a, b) => b.count - a.count);

      const pagesVisited = Array.from(pageMap.entries()).map(([page, count]) => ({
        page,
        count,
      })).sort((a, b) => b.count - a.count);

      const totalPageViews = logs.length;
      
      // Get today's stats
      const todayStr = new Date().toISOString().split('T')[0];
      const todayData = dailyMap.get(todayStr) || { views: 0, visitors: new Set() };

      return {
        success: true,
        data: {
          totalPageViews,
          totalUniqueVisitors,
          todayPageViews: todayData.views,
          todayUniqueVisitors: todayData.visitors.size,
          trafficPerDay,
          sectionsVisited,
          pagesVisited,
        },
      };
    } catch (error) {
      console.error('Error fetching traffic stats:', error);
      return { success: false, message: 'Failed to fetch traffic stats' };
    }
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { AnomalyDetector, Anomaly } from '@/services/traccar/AnomalyDetector';
import {
  filterByWorkHours,
  calculateDistanceFromPositions,
  isWorkDay,
} from '@/services/traccar/WorkHoursFilter';
import { TRACCAR_URL, TRACCAR_AUTH } from '@/services/traccar/traccarConfig';
import { requireTraccarAccess } from '@/services/traccar/traccarProxy';

interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  attributes: Record<string, any>;
}

interface DailyBreakdown {
  date: string;
  km: number;
  reimbursement: number;
  anomalies: Anomaly[];
}

interface DeviceMonthlyReport {
  deviceId: string;
  deviceName: string;
  employeeName: string;
  department: string;
  ratePerKm: number;
  daysTracked: number;
  totalKm: number;
  totalReimbursement: number;
  anomalyCount: number;
  offlineDays: number;
  averageDailyKm: number;
  dailyBreakdown: DailyBreakdown[];
}

/**
 * Get all dates in a month as YYYY-MM-DD strings.
 */
function getDatesInMonth(yearMonth: string): string[] {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: string[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dates.push(dateStr);
  }

  return dates;
}

/**
 * Fetch route positions for a device on a specific date.
 */
async function fetchDayPositions(deviceId: number, date: string): Promise<any[]> {
  const from = `${date}T00:00:00.000Z`;
  const to = `${date}T23:59:59.999Z`;

  const url = new URL(`${TRACCAR_URL}/api/reports/route`);
  url.searchParams.set('deviceId', String(deviceId));
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Basic ${TRACCAR_AUTH}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) return [];
  return response.json();
}

/**
 * Fetch all Traccar devices, optionally filtered by uniqueId.
 */
async function fetchDevices(deviceUniqueId?: string): Promise<TraccarDevice[]> {
  let url = `${TRACCAR_URL}/api/devices`;
  if (deviceUniqueId) {
    url += `?uniqueId=${encodeURIComponent(deviceUniqueId)}`;
  }

  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${TRACCAR_AUTH}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) return [];
  return response.json();
}

/**
 * GET /api/traccar/monthly-report?month=2026-07&deviceId=od05at8841-a3f2c1
 * 
 * Generate a monthly reconciliation report for reimbursement.
 * - month: YYYY-MM format (required)
 * - deviceId: Traccar uniqueId (optional, all devices if omitted)
 */
export async function GET(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'read');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const deviceIdParam = searchParams.get('deviceId');

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'Missing or invalid param: month (expected YYYY-MM format)' },
        { status: 400 }
      );
    }

    // Get the dates to process (limit to today if current month)
    const allDates = getDatesInMonth(month);
    const today = new Date().toISOString().split('T')[0];
    const datesToProcess = allDates.filter((d) => d <= today);

    // Fetch devices
    const devices = await fetchDevices(deviceIdParam || undefined);

    if (devices.length === 0) {
      return NextResponse.json({
        month,
        reports: [],
        message: deviceIdParam ? `Device "${deviceIdParam}" not found` : 'No devices found',
      });
    }

    const anomalyDetector = new AnomalyDetector();
    const reports: DeviceMonthlyReport[] = [];

    for (const device of devices) {
      const ratePerKm = device.attributes?.ratePerKm || 0;
      const employeeName = device.attributes?.employeeName || device.name || '';
      const department = device.attributes?.department || '';

      const dailyBreakdown: DailyBreakdown[] = [];
      let totalKm = 0;
      let daysTracked = 0;
      let offlineDays = 0;
      let totalAnomalies = 0;

      for (const date of datesToProcess) {
        // Skip Sundays for reporting (not work days)
        if (!isWorkDay(date)) continue;

        const positions = await fetchDayPositions(device.id, date);

        // Filter to work hours only
        const workHoursPositions = filterByWorkHours(positions);
        const dayKm = calculateDistanceFromPositions(workHoursPositions);
        const dayReimbursement = Math.round(dayKm * ratePerKm);

        // Run anomaly detection
        const anomalies = anomalyDetector.detectAnomaliesFromPositions(positions, date);

        if (positions.length > 0) {
          daysTracked++;
        } else {
          offlineDays++;
        }

        totalKm += dayKm;
        totalAnomalies += anomalies.length;

        dailyBreakdown.push({
          date,
          km: Math.round(dayKm * 10) / 10,
          reimbursement: dayReimbursement,
          anomalies,
        });
      }

      const totalReimbursement = Math.round(totalKm * ratePerKm);
      const averageDailyKm = daysTracked > 0 ? Math.round((totalKm / daysTracked) * 10) / 10 : 0;

      reports.push({
        deviceId: device.uniqueId,
        deviceName: device.name,
        employeeName,
        department,
        ratePerKm,
        daysTracked,
        totalKm: Math.round(totalKm * 10) / 10,
        totalReimbursement,
        anomalyCount: totalAnomalies,
        offlineDays,
        averageDailyKm,
        dailyBreakdown,
      });
    }

    return NextResponse.json({
      month,
      generatedAt: new Date().toISOString(),
      deviceCount: reports.length,
      totalReimbursement: reports.reduce((sum, r) => sum + r.totalReimbursement, 0),
      reports,
    });
  } catch (error: any) {
    console.error('[Monthly Report API] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to generate monthly report', details: error.message },
      { status: 500 }
    );
  }
}

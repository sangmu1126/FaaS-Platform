import { useState, useEffect, useRef } from 'react';
import Sidebar from '../dashboard/components/Sidebar';
import Header from '../dashboard/components/Header';
import { functionApi } from '../../services/functionApi';
import { logApi } from '../../services/logApi';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';

interface MetricData {
    time: string;
    invocations: number;
    avgDuration: number;
}

interface FunctionMetric {
    name: string;
    invocations: number;
    avgDuration: number;
    successRate: number;
}

interface PoolStatus {
    name: string;
    count: number;
    color: string;
}

export default function MetricsPage() {
    const [timeSeriesData, setTimeSeriesData] = useState<MetricData[]>([]);
    const [functionMetrics, setFunctionMetrics] = useState<FunctionMetric[]>([]);
    const [poolStatus, setPoolStatus] = useState<PoolStatus[]>([]);
    const [systemStatus, setSystemStatus] = useState<any>(null);
    const [prometheusData, setPrometheusData] = useState<{ totalRequests: number; avgDuration: number; errorRate: number }>({
        totalRequests: 0,
        avgDuration: 0,
        errorRate: 0
    });
    const [totalStats, setTotalStats] = useState({
        totalInvocations: 0,
        avgResponseTime: 0,
        successRate: 100,
        activeWorkers: 0
    });
    const prevMetricsRef = useRef({ totalRequests: 0, accumulatedDuration: 0 });

    // Parse Prometheus text format
    const parsePrometheusMetrics = (text: string) => {
        const lines = text.split('\n');
        let totalCount = 0;
        let totalSum = 0;
        let errorCount = 0;

        lines.forEach(line => {
            if (line.startsWith('#') || !line.trim()) return;

            // Parse function_invocations_total
            if (line.includes('function_invocations_total')) {
                const match = line.match(/function_invocations_total\{[^}]*\}\s+(\d+)/); // Counter is integer usually, but prom client output is float-like often.
                // Actually prom-client output format: function_invocations_total{...} 5
                // The regex \s+(\d+) might miss if it is 5.0? Prom-client usually outputs integers for counters if inc(1).
                // Let's use flexible regex.
                const valMatch = line.match(/\}\s+([\d.]+)/);
                if (valMatch) {
                    totalCount += parseFloat(valMatch[1]);
                }

                // Check for ERROR status in label
                // label format: {functionId="...",status="ERROR"}
                if (line.includes('status="ERROR"')) {
                    if (valMatch) errorCount += parseFloat(valMatch[1]);
                }
            }

            // Parse function_duration_seconds_sum
            if (line.includes('function_duration_seconds_sum')) {
                const match = line.match(/function_duration_seconds_sum\{[^}]*\}\s+([\d.]+)/);
                if (match) {
                    totalSum += parseFloat(match[1]);
                }
            }
        });

        // Use totalCount from invocations metric
        // If metrics are missing (e.g. fresh start), defaults are 0.

        const avgMs = totalCount > 0 ? (totalSum / totalCount) * 1000 : 0;
        // Error Rate
        const errRate = totalCount > 0 ? ((totalCount - errorCount) / totalCount) * 100 : 100;

        return {
            totalRequests: totalCount,
            avgDuration: Math.round(avgMs),
            errorRate: Math.round(errRate * 10) / 10
        };
    };

    // Fetch data
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch dashboard stats (includes Prometheus-based metrics and byFunction breakdown)
                let dashboardStats: any = null;
                try {
                    dashboardStats = await functionApi.getDashboardStats();
                    if (dashboardStats) {
                        setTotalStats(prev => ({
                            ...prev,
                            totalInvocations: dashboardStats.totalExecutions || 0,
                            avgResponseTime: dashboardStats.avgResponseTime || 0,
                            successRate: dashboardStats.successRate || 100
                        }));
                        setPrometheusData({
                            totalRequests: dashboardStats.totalExecutions || 0,
                            avgDuration: dashboardStats.avgResponseTime || 0,
                            errorRate: dashboardStats.successRate || 100
                        });
                    }
                } catch (statsErr) {
                    console.warn('Dashboard stats not available, fetching Prometheus directly');
                    // Fallback to direct Prometheus fetch
                    const promRes = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'}/metrics/prometheus`);
                    if (promRes.ok) {
                        const promText = await promRes.text();
                        const parsed = parsePrometheusMetrics(promText);
                        setPrometheusData(parsed);
                        setTotalStats(prev => ({
                            ...prev,
                            avgResponseTime: parsed.avgDuration || prev.avgResponseTime,
                            successRate: parsed.errorRate || prev.successRate
                        }));
                    }
                }

                // Get functions for display
                const functions = await functionApi.getFunctions();

                // Use byFunction data from dashboard stats if available
                const byFunctionMap = new Map<string, any>();
                if (dashboardStats?.byFunction && Array.isArray(dashboardStats.byFunction)) {
                    dashboardStats.byFunction.forEach((f: any) => {
                        byFunctionMap.set(f.functionId, f);
                    });
                }

                // Build function metrics with real data
                const metrics: FunctionMetric[] = functions.map((fn: any) => {
                    const fid = fn.functionId || fn.id;
                    const fnMetric = byFunctionMap.get(fid);
                    // Use local_stats.calls from function list as fallback for invocations
                    const localInvocations = fn.local_stats?.calls || fn.invocations || 0;
                    return {
                        name: fn.name || fid || 'Unknown',
                        invocations: fnMetric?.invocations ?? localInvocations,
                        avgDuration: fnMetric?.avgDuration ?? 0,
                        successRate: fnMetric?.successRate ?? 100
                    };
                });
                setFunctionMetrics(metrics.sort((a, b) => b.invocations - a.invocations));

                // Calculate totals from function metrics
                const total = metrics.reduce((acc, fn) => acc + fn.invocations, 0);
                setTotalStats(prev => ({
                    ...prev,
                    totalInvocations: dashboardStats?.totalExecutions || total,
                }));

                // Real-time Time Series Accumulation obtained from latest fetch
                const now = new Date();
                const timeLabel = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                // Use latest parsed data if available (from local scope if we refactored, but here we use state which might be slightly delayed 
                // but acceptable for 5s interval, or better: use values we just fetched if possible)
                // Since this runs in fetchData, we might not have 'parsed' variable visible here if it was inside a try block block.
                // Let's rely on the fact that if we successfully fetched prometheus, we updated state. 
                // However, state update isn't immediate.
                // Better to just push the current point?
                // Actually, let's keep it simple: Add point if we have data.

                setTimeSeriesData(prevSeries => {
                    const latestMetrics = {
                        totalRequests: dashboardStats?.totalExecutions || prometheusData.totalRequests || 0,
                        avgDuration: dashboardStats?.avgResponseTime || prometheusData.avgDuration || 0
                    };

                    const prev = prevMetricsRef.current;
                    let deltaRequests = 0;

                    // Only calculate delta if we have a previous value (not first load)
                    if (prev.totalRequests > 0) {
                        deltaRequests = Math.max(0, latestMetrics.totalRequests - prev.totalRequests);
                    }

                    // Update Ref
                    if (latestMetrics.totalRequests > 0) {
                        prevMetricsRef.current = {
                            totalRequests: latestMetrics.totalRequests,
                            accumulatedDuration: 0
                        };
                    }

                    const newPoint = {
                        time: timeLabel,
                        invocations: deltaRequests,
                        avgDuration: latestMetrics.avgDuration
                    };
                    const updated = [...prevSeries, newPoint];
                    return updated.length > 12 ? updated.slice(updated.length - 12) : updated;
                });

                // Calculate Runtime Distribution from Functions
                const distribution = functions.reduce((acc: any, fn: any) => {
                    // Extract language name (e.g. "python:3.9" -> "python")
                    const runtime = (fn.runtime || 'unknown').split(':')[0];
                    acc[runtime] = (acc[runtime] || 0) + 1;
                    return acc;
                }, {});

                const pools = [
                    { name: 'Python', count: distribution['python'] || 0, color: '#3B82F6' },
                    { name: 'Node.js', count: distribution['nodejs'] || distribution['node'] || 0, color: '#10B981' },
                    { name: 'C++', count: distribution['cpp'] || 0, color: '#F59E0B' },
                    { name: 'Go', count: distribution['go'] || 0, color: '#06B6D4' },
                    { name: 'Others', count: Object.keys(distribution).filter(k => !['python', 'nodejs', 'node', 'cpp', 'go'].includes(k)).reduce((sum, k) => sum + distribution[k], 0), color: '#8B5CF6' }
                ];
                setPoolStatus(pools);
                setTotalStats(prev => ({
                    ...prev,
                    activeWorkers: functions.length // Total Functions count
                }));
            } catch (e) {
                console.error('Failed to fetch metrics', e);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [prometheusData.avgDuration, prometheusData.totalRequests]);

    const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#06B6D4', '#8B5CF6'];

    return (
        <div className="flex h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
            <Sidebar systemStatus={null} onSystemStatusClick={() => { }} />

            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />

                <main className="flex-1 overflow-y-auto">
                    <div className="max-w-7xl mx-auto px-6 py-8">
                        {/* Page Header */}
                        <div className="mb-8">
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">📊 Metrics Dashboard</h1>
                            <p className="text-gray-600">실시간 시스템 모니터링 및 성능 분석</p>
                        </div>

                        {/* Stats Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-purple-100 shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl flex items-center justify-center">
                                        <i className="ri-bar-chart-box-line text-2xl text-purple-600"></i>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">{totalStats.totalInvocations.toLocaleString()}</div>
                                        <div className="text-sm text-gray-600">총 호출 수</div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-blue-100 shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center">
                                        <i className="ri-timer-line text-2xl text-blue-600"></i>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">{totalStats.avgResponseTime}ms</div>
                                        <div className="text-sm text-gray-600">평균 응답 시간</div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-green-100 shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-green-200 rounded-xl flex items-center justify-center">
                                        <i className="ri-check-double-line text-2xl text-green-600"></i>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">{totalStats.successRate}%</div>
                                        <div className="text-sm text-gray-600">성공률</div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-amber-100 shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-amber-100 to-amber-200 rounded-xl flex items-center justify-center">
                                        <i className="ri-server-line text-2xl text-amber-600"></i>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">{totalStats.activeWorkers}</div>
                                        <div className="text-sm text-gray-600">등록된 함수</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Charts Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                            {/* Invocations Chart */}
                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <i className="ri-line-chart-line text-blue-600"></i>
                                    호출 추이 (5초당 건수)
                                </h3>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={timeSeriesData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                            <XAxis dataKey="time" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                            <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: 'rgba(255,255,255,0.95)',
                                                    borderRadius: '12px',
                                                    border: '1px solid #E5E7EB'
                                                }}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="invocations"
                                                stroke="#3B82F6"
                                                strokeWidth={2}
                                                dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                                                activeDot={{ r: 6, fill: '#2563EB' }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Response Time Chart */}
                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <i className="ri-speed-line text-green-600"></i>
                                    응답 시간 (ms)
                                </h3>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={timeSeriesData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                            <XAxis dataKey="time" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                            <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: 'rgba(255,255,255,0.95)',
                                                    borderRadius: '12px',
                                                    border: '1px solid #E5E7EB'
                                                }}
                                            />
                                            <Bar
                                                dataKey="avgDuration"
                                                fill="#10B981"
                                                radius={[4, 4, 0, 0]}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Worker Pools Pie Chart */}
                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <i className="ri-pie-chart-line text-purple-600"></i>
                                    함수 런타임 분포
                                </h3>
                                <div className="h-48">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={poolStatus}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={40}
                                                outerRadius={70}
                                                paddingAngle={5}
                                                dataKey="count"
                                            >
                                                {poolStatus.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap justify-center gap-3 mt-4">
                                    {poolStatus.map((pool) => (
                                        <div key={pool.name} className="flex items-center gap-2">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: pool.color }}
                                            ></div>
                                            <span className="text-sm text-gray-600">{pool.name}: {pool.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Functions Table */}
                            <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <i className="ri-trophy-line text-amber-600"></i>
                                    Top 호출 함수
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-200">
                                                <th className="text-left py-3 text-sm font-semibold text-gray-700">함수명</th>
                                                <th className="text-right py-3 text-sm font-semibold text-gray-700">호출 수</th>
                                                <th className="text-right py-3 text-sm font-semibold text-gray-700">평균 응답</th>
                                                <th className="text-right py-3 text-sm font-semibold text-gray-700">성공률</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {functionMetrics.slice(0, 5).map((fn, idx) => (
                                                <tr key={fn.name} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-700' : 'bg-gray-300'
                                                                }`}>
                                                                {idx + 1}
                                                            </span>
                                                            <span className="font-medium text-gray-900">{fn.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 text-right text-gray-700">{fn.invocations.toLocaleString()}</td>
                                                    <td className="py-3 text-right text-gray-700">{Math.round(fn.avgDuration) > 0 ? `${Math.round(fn.avgDuration)}ms` : '-'}</td>
                                                    <td className="py-3 text-right">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${fn.successRate >= 99 ? 'bg-green-100 text-green-700' :
                                                            fn.successRate >= 95 ? 'bg-yellow-100 text-yellow-700' :
                                                                'bg-red-100 text-red-700'
                                                            }`}>
                                                            {fn.successRate.toFixed(1)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {functionMetrics.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="py-8 text-center text-gray-500">
                                                        아직 호출된 함수가 없습니다.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>


                    </div>
                </main>
            </div>
        </div>
    );
}

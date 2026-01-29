import { useState, useEffect, useRef } from 'react';
import Sidebar from '../dashboard/components/Sidebar';
import Header from '../dashboard/components/Header';
import { functionApi } from '../../services/functionApi';
// logApi import removed - not currently used
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
    // Prometheus data is currently fetched via dashboard/stats API
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
    // debugInfo removed - no longer needed
    const prevMetricsRef = useRef({ totalRequests: 0, accumulatedDuration: 0 });

    // Terminal State
    const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
    const [isTestRunning, setIsTestRunning] = useState(false);
    const [testMode, setTestMode] = useState<'capacity' | 'stress'>('capacity');
    const [showInfoModal, setShowInfoModal] = useState(false);
    const terminalRef = useRef<HTMLDivElement>(null);

    // Load Test Handler
    const handleStartLoadTest = async () => {
        setIsTestRunning(true);
        setTerminalLogs(['$ Initializing Virtual Users...', '$ Connecting to Load Generator...']);

        try {
            const token = localStorage.getItem('api_key') || 'test-api-key';
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/debug/loadtest`, {
                method: 'POST',
                headers: {
                    'x-api-key': token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ mode: testMode })
            });

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const text = decoder.decode(value);
                    const lines = text.split('\n').filter(Boolean);

                    setTerminalLogs(prev => {
                        const newLogs = [...prev, ...lines];
                        return newLogs.slice(-50); // Keep last 50 lines
                    });

                    // Scroll to bottom
                    if (terminalRef.current) {
                        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                    }
                }
            }
        } catch (error) {
            setTerminalLogs(prev => [...prev, '❌ Connection Failed: ' + String(error)]);
        } finally {
            setIsTestRunning(false);
        }
    };

    // Stop Load Test Handler
    const handleStopLoadTest = async () => {
        try {
            const token = localStorage.getItem('api_key') || 'test-api-key';
            await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/loadtest/stop`, {
                method: 'POST',
                headers: { 'x-api-key': token }
            });
            setTerminalLogs(prev => [...prev, '⛔ Load Test STOPPED by user']);
            setIsTestRunning(false);
        } catch (error) {
            setTerminalLogs(prev => [...prev, '❌ Failed to stop: ' + String(error)]);
        }
    };

    // Parse Prometheus text format

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
                // Parse format: function_invocations_total{...} 5
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
                const timeLabel = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                // Use latest parsed data if available (from local scope if we refactored, but here we use state which might be slightly delayed 
                // but acceptable for 5s interval, or better: use values we just fetched if possible)
                // Since this runs in fetchData, we might not have 'parsed' variable visible here if it was inside a try block block.
                // Let's rely on the fact that if we successfully fetched prometheus, we updated state. 
                // However, state update isn't immediate.
                // Better to just push the current point?
                // Actually, let's keep it simple: Add point if we have data.

                // Calculate Real-time Delta for Throughput Chart
                const latestTotalRequests = dashboardStats?.totalExecutions || 0;
                const latestAvgDuration = dashboardStats?.avgResponseTime || 0;
                const currentTotalDuration = latestTotalRequests * latestAvgDuration;

                const prev = prevMetricsRef.current;
                let deltaRequests = 0;
                let windowedAvgDuration = 0;



                // Only calculate delta if we have a previous value (not first load)
                if (prev.totalRequests > 0) {
                    deltaRequests = Math.max(0, latestTotalRequests - prev.totalRequests);

                    const deltaDuration = Math.max(0, currentTotalDuration - prev.accumulatedDuration);

                    if (deltaRequests > 0) {
                        windowedAvgDuration = Math.round(deltaDuration / deltaRequests);
                    }
                }

                // Update Ref for next iteration
                if (latestTotalRequests > 0) {
                    prevMetricsRef.current = {
                        totalRequests: latestTotalRequests,
                        accumulatedDuration: currentTotalDuration
                    };
                }

                const newPoint = {
                    time: timeLabel,
                    invocations: deltaRequests, // Throughput (Requests per 5s)
                    avgDuration: windowedAvgDuration // Real-time Avg (Windowed)
                };

                setTimeSeriesData(prevSeries => {
                    const updated = [...prevSeries, newPoint];
                    return updated.length > 60 ? updated.slice(updated.length - 60) : updated;
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
    }, []);

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
                            <p className="text-gray-600">Real-time system monitoring and performance analysis</p>
                        </div>

                        {/* Stats Overview */}
                        {/* Stats Overview */}
                        {/* Stats Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-purple-100 shadow-sm group hover:border-purple-300 transition-colors relative" title="Includes data from deleted functions">
                                <div className="absolute top-2 right-2 text-purple-200">
                                    <i className="ri-history-line"></i>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl flex items-center justify-center">
                                        <i className="ri-bar-chart-box-line text-2xl text-purple-600"></i>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">{totalStats.totalInvocations.toLocaleString()}</div>
                                        <div className="text-sm text-gray-600 font-medium">Total Invocations</div>
                                        <div className="text-xs text-purple-400 font-mono">(Cumulative)</div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-blue-100 shadow-sm group hover:border-blue-300 transition-colors relative" title="Includes data from deleted functions">
                                <div className="absolute top-2 right-2 text-blue-200">
                                    <i className="ri-history-line"></i>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center">
                                        <i className="ri-timer-line text-2xl text-blue-600"></i>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">{totalStats.avgResponseTime}ms</div>
                                        <div className="text-sm text-gray-600 font-medium">Avg Response Time</div>
                                        <div className="text-xs text-blue-400 font-mono">(Global)</div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-green-100 shadow-sm group hover:border-green-300 transition-colors relative" title="Includes data from deleted functions">
                                <div className="absolute top-2 right-2 text-green-200">
                                    <i className="ri-history-line"></i>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-green-200 rounded-xl flex items-center justify-center">
                                        <i className="ri-check-double-line text-2xl text-green-600"></i>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">{totalStats.successRate}%</div>
                                        <div className="text-sm text-gray-600 font-medium">Success Rate</div>
                                        <div className="text-xs text-green-400 font-mono">(Global)</div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-amber-100 shadow-sm group hover:border-amber-300 transition-colors relative" title="Currently deployed functions">
                                <div className="absolute top-2 right-2 text-amber-200">
                                    <i className="ri-flashlight-line"></i>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-amber-100 to-amber-200 rounded-xl flex items-center justify-center">
                                        <i className="ri-server-line text-2xl text-amber-600"></i>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">{totalStats.activeWorkers}</div>
                                        <div className="text-sm text-gray-600 font-medium">Active Functions</div>
                                        <div className="text-xs text-amber-400 font-mono">(Live)</div>
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
                                    Invocation Trend (per 5 seconds)
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
                                    Response Time (ms)
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
                                    Function Runtime Distribution
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
                                    Top Invoked Functions
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-200">
                                                <th className="text-left py-3 text-sm font-semibold text-gray-700">Function</th>
                                                <th className="text-right py-3 text-sm font-semibold text-gray-700">Invocations</th>
                                                <th className="text-right py-3 text-sm font-semibold text-gray-700">Avg Response</th>
                                                <th className="text-right py-3 text-sm font-semibold text-gray-700">Success Rate</th>
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
                                                        No functions have been invoked yet.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>


                        {/* Live Load Test Terminal */}
                        <div className="mt-8 bg-[#1E1E1E] rounded-2xl overflow-hidden shadow-xl border border-gray-700">
                            {/* Panel Header & Controls */}
                            <div className="bg-[#2D2D2D] px-6 py-4 border-b border-gray-700">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                        <span className="ml-3 text-sm font-mono text-gray-400">root@faas-load-generator:~</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowInfoModal(true)}
                                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors"
                                            title="Load Test Info"
                                        >
                                            <i className="ri-information-line text-lg"></i>
                                        </button>
                                        {isTestRunning && (
                                            <button
                                                onClick={handleStopLoadTest}
                                                className="px-4 py-1.5 rounded-lg text-xs font-bold font-mono bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg animate-pulse"
                                            >
                                                ⏹ STOP TEST
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Dual Mode Controls */}
                                <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between bg-[#1E1E1E] p-3 rounded-lg border border-gray-800">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setTestMode('capacity')}
                                            disabled={isTestRunning}
                                            className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${testMode === 'capacity'
                                                ? 'bg-blue-600 text-white shadow-lg'
                                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                }`}
                                        >
                                            ⚡ CAPACITY PLANNING
                                            <span className="block text-[10px] font-normal opacity-70 mt-0.5">Max Throughput (Auto-Deploy)</span>
                                        </button>
                                        <button
                                            onClick={() => setTestMode('stress')}
                                            disabled={isTestRunning}
                                            className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${testMode === 'stress'
                                                ? 'bg-orange-600 text-white shadow-lg'
                                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                }`}
                                        >
                                            🏋️ RESILIENCY TESTING
                                            <span className="block text-[10px] font-normal opacity-70 mt-0.5">Real-world Stress (Targeted)</span>
                                        </button>
                                    </div>

                                    <div className="flex gap-3 items-center">
                                        <button
                                            onClick={handleStartLoadTest}
                                            disabled={isTestRunning}
                                            className={`px-6 py-2 rounded-md text-sm font-bold font-mono transition-all flex items-center gap-2 ${isTestRunning
                                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                                : 'bg-green-600 text-white hover:bg-green-500 hover:shadow-green-500/20 shadow-lg'
                                                }`}
                                        >
                                            {isTestRunning ? 'RUNNING...' : '▶ START TRAFFIC'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Terminal Output */}
                            <div
                                ref={terminalRef}
                                className="h-64 overflow-y-auto p-6 font-mono text-sm leading-6"
                                style={{ scrollBehavior: 'smooth' }}
                            >
                                {terminalLogs.length === 0 ? (
                                    <div className="text-gray-500 opacity-50 select-none flex flex-col items-center justify-center h-full gap-2">
                                        <div className="text-xl">Waiting for command...</div>
                                        <div className="text-xs">Select a mode and click START to begin load simulation.</div>
                                    </div>
                                ) : (
                                    terminalLogs.map((log, i) => (
                                        <div key={i} className={`${log.includes('Error') || log.includes('Failed') ? 'text-red-400' :
                                            log.includes('Success') || log.includes('✅') ? 'text-green-400' :
                                                log.includes('Starting') ? 'text-blue-400' :
                                                    'text-gray-300'
                                            }`}>
                                            {log}
                                        </div>
                                    ))
                                )}
                                {isTestRunning && (
                                    <div className="animate-pulse text-green-500">_</div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
            {/* Load Test Info Modal */}
            {showInfoModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                                    <i className="ri-speed-line text-xl text-blue-600"></i>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Load Testing Modes</h3>
                                    <p className="text-xs text-gray-500">Understanding performance validation strategies</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowInfoModal(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <i className="ri-close-line text-xl"></i>
                            </button>
                        </div>
                        <div className="p-6 grid gap-6">
                            {/* Capacity Planning */}
                            <div className="flex gap-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
                                <div className="mt-1">
                                    <i className="ri-flashlight-fill text-2xl text-blue-600"></i>
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-gray-900 mb-1">Capacity Planning</h4>
                                    <p className="text-sm text-gray-600 mb-2">
                                        Designed to measure the <strong>Maximum Ingress Throughput</strong> of the Gateway and Infrastructure.
                                    </p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside bg-white p-3 rounded-lg border border-blue-100">
                                        <li><strong>Function:</strong> Lightweight <code>Hello World</code> (Python)</li>
                                        <li><strong>Goal:</strong> Verify Peak RPS (Requests Per Second) acceptance.</li>
                                        <li><strong>Use Case:</strong> Architectural validation & Gateway benchmarking.</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Resiliency Testing */}
                            <div className="flex gap-4 p-4 rounded-xl bg-orange-50 border border-orange-100">
                                <div className="mt-1">
                                    <i className="ri-fire-fill text-2xl text-orange-600"></i>
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-gray-900 mb-1">Resiliency Testing</h4>
                                    <p className="text-sm text-gray-600 mb-2">
                                        Designed to stress-test <strong>Worker Stability</strong> and auto-scaling mechanisms under heavy load.
                                    </p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside bg-white p-3 rounded-lg border border-orange-100">
                                        <li><strong>Function:</strong> CPU-intensive <code>Factorial Calculation</code> (Python)</li>
                                        <li><strong>Goal:</strong> Verify system stability, timeouts, and resource isolation.</li>
                                        <li><strong>Use Case:</strong> Application-level stress testing.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setShowInfoModal(false)}
                                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { functionApi } from '../../services/functionApi';
import { logApi } from '../../services/logApi';

interface FunctionItem {
  id: string;
  name: string;
  language: string;
  status: 'active' | 'inactive' | 'deploying';
  lastDeployed: string;
  invocations: number;
  avgDuration: number;
  memory: number;
  warmPool: number;
}

interface LogEntry {
  id: string;
  time: string;
  type: 'warm' | 'tuner' | 'pool';
  message: string;
  icon: string;
}

export default function DashboardPage() {
  const [showLogModal, setShowLogModal] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const [functions, setFunctions] = useState<FunctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Real Data
  useEffect(() => {
    async function loadData() {
      try {
        const data = await functionApi.getFunctions();

        const sortedData = data.sort((a: any, b: any) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        );

        const transformedWithMetrics = sortedData.map((d: any) => {
          return {
            id: d.functionId,
            name: d.name,
            language: d.runtime,
            status: 'active' as 'active' | 'inactive' | 'deploying',
            lastDeployed: d.uploadedAt ? new Date(d.uploadedAt).toLocaleString() : '-',
            invocations: d.invocations || 0, // Real data from DynamoDB
            avgDuration: d.avgDuration || 0, // Real data from DynamoDB
            memory: d.memoryMb || 128,
            warmPool: 0
          };
        });

        setFunctions(transformedWithMetrics);
      } catch (e) {
        console.error("Failed to fetch functions", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    // Poll every 5s for updates
    const poll = setInterval(loadData, 5000);
    return () => clearInterval(poll);
  }, []);

  // Fetch Real Logs
  useEffect(() => {
    async function fetchLogs() {
      try {
        const rawLogs = await logApi.getLogs();
        const logData = Array.isArray(rawLogs) ? rawLogs : (rawLogs as any).logs || [];

        // Transform to frontend format
        const transformed: LogEntry[] = logData.map((log: any) => ({
          id: log.id || Math.random().toString(),
          time: new Date(log.timestamp).toLocaleTimeString('ko-KR', { hour12: false }),
          type: log.level === 'WARN' ? 'pool' : log.level === 'INFO' ? 'warm' : 'tuner', // Simple mapping
          message: `${log.message} ${log.ip ? `(${log.ip})` : ''}`,
          icon: log.level === 'WARN' ? '⚠️' : log.level === 'ERROR' ? '❌' : 'ℹ️'
        })).slice(0, 50); // Limit to recent 50

        setLogs(transformed);
      } catch (e) {
        console.error("Failed to fetch logs", e);
      }
    }

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const getLanguageIcon = (language: string) => {
    const icons: Record<string, string> = {
      'Python': 'ri-python-line',
      'python': 'ri-python-line',
      'Node.js': 'ri-nodejs-line',
      'nodejs': 'ri-nodejs-line',
      'C++': 'ri-terminal-box-line',
      'cpp': 'ri-terminal-box-line',
      'Go': 'ri-code-s-slash-line',
      'go': 'ri-code-s-slash-line'
    };
    return icons[language] || 'ri-code-line';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'active': 'bg-green-50 text-green-600 border-green-200',
      'inactive': 'bg-gray-50 text-gray-600 border-gray-200',
      'deploying': 'bg-blue-50 text-blue-600 border-blue-200'
    };
    return colors[status] || 'bg-gray-50 text-gray-600';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      'active': '실행 중',
      'inactive': '중지됨',
      'deploying': '배포 중'
    };
    return texts[status] || status;
  };

  // Cost Efficiency Calculation (AWS Lambda Pricing)
  // Rate: ~$0.0000166667 per GB-second (~$0.00001667 per MB-ms / 1000)
  const costEfficiency = useMemo(() => {
    if (functions.length === 0) {
      return { originalCost: 0, optimizedCost: 0, savings: 0, score: 0 };
    }

    const RATE_PER_GB_SECOND = 0.0000166667;

    let originalCost = 0;
    let optimizedCost = 0;

    functions.forEach(fn => {
      const invocations = fn.invocations || 0;
      const durationSec = (fn.avgDuration || 0) / 1000; // ms to seconds
      const allocatedGb = (fn.memory || 128) / 1024; // MB to GB
      const actualGb = Math.max(0.032, allocatedGb * 0.25); // Assume 25% actual usage (min 32MB)

      originalCost += invocations * allocatedGb * durationSec * RATE_PER_GB_SECOND;
      optimizedCost += invocations * actualGb * durationSec * RATE_PER_GB_SECOND;
    });

    const savings = Math.max(0, originalCost - optimizedCost);
    const score = originalCost > 0 ? Math.min(100, Math.round((savings / originalCost) * 100 + 75)) : 0;

    return { originalCost, optimizedCost, savings, score };
  }, [functions]);

  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [showRawStatus, setShowRawStatus] = useState(false);

  // Fetch System Status (Lifted from Sidebar)
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'}/system/status`);
        if (res.ok) {
          const data = await res.json();
          setSystemStatus(data);
          // Always update heartbeat time when data is fetched
          setLastHeartbeat(new Date().toLocaleTimeString('ko-KR'));
        }
      } catch (e) {
        console.error("Failed to fetch system status");
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const checkHeartbeat = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'}/system/status`);
      if (res.ok) {
        const data = await res.json();
        setSystemStatus(data);
        setLastHeartbeat(new Date().toLocaleTimeString('ko-KR'));
        setShowRawStatus(true);
      }
    } catch (e) {
      alert("Failed to confirm heartbeat");
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <Sidebar
        systemStatus={systemStatus}
        onSystemStatusClick={() => setShowPoolModal(true)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onSearch={setSearchQuery} />

        <main className="flex-1 overflow-y-auto relative">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-purple-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl flex items-center justify-center">
                    <i className="ri-function-line text-2xl text-purple-600"></i>
                  </div>
                  <span className="text-xs text-gray-500">전체</span>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">{functions.filter(f => f.status === 'active').length}</div>
                <div className="text-sm text-gray-600">활성 함수</div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-purple-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl flex items-center justify-center">
                    <i className="ri-flashlight-line text-2xl text-purple-600"></i>
                  </div>
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <i className="ri-arrow-up-line"></i>
                    12%
                  </span>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {functions.reduce((acc, curr) => acc + curr.invocations, 0).toLocaleString()}
                </div>
                <div className="text-sm text-gray-600">총 실행 횟수</div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-blue-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center">
                    <i className="ri-time-line text-2xl text-blue-600"></i>
                  </div>
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <i className="ri-arrow-down-line"></i>
                    8%
                  </span>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {functions.length > 0
                    ? Math.round(functions.reduce((acc, curr) => acc + curr.avgDuration, 0) / functions.length)
                    : 0}ms
                </div>
                <div className="text-sm text-gray-600">평균 응답 시간</div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-green-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-green-200 rounded-xl flex items-center justify-center">
                    <i className="ri-money-dollar-circle-line text-2xl text-green-600"></i>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-full">
                    <span className="text-xs font-bold text-green-700">{costEfficiency.score}</span>
                    <span className="text-xs text-green-600">점</span>
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">${costEfficiency.optimizedCost.toFixed(2)}</div>
                <div className="text-sm text-green-600 font-semibold flex items-center gap-1">
                  <i className="ri-arrow-down-line"></i>
                  Saved ${costEfficiency.savings.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-1">Cost Efficiency</div>
              </div>
            </div>

            {/* Functions Table */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-500">함수 목록을 불러오는 중...</p>
                </div>
              ) : functions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <i className="ri-function-line text-3xl text-gray-400"></i>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">배포된 함수가 없습니다</h3>
                  <p className="text-gray-500 mb-6 max-w-sm">
                    아직 배포된 함수가 없습니다. 새로운 함수를 배포하여 Serverless 환경을 경험해보세요.
                  </p>
                  <Link to="/deploy" className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center gap-2">
                    <i className="ri-rocket-line"></i>
                    함수 배포하기
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">함수명</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">상태</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">언어</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">메모리</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">마지막 배포</th>
                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">작업</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {functions
                        .filter(func => func.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((func) => (
                          <tr key={func.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                              <Link
                                to={`/function/${func.id}`}
                                className="flex items-center gap-3 cursor-pointer group"
                              >
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                                  <i className="ri-function-line text-white"></i>
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                    {func.name}
                                  </div>
                                  <div className="text-xs text-gray-500">{func.id.substring(0, 8)}...</div>
                                </div>
                              </Link>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(func.status)}`}>
                                {func.status === 'deploying' && (
                                  <i className="ri-loader-4-line animate-spin"></i>
                                )}
                                {getStatusText(func.status)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <i className={`${getLanguageIcon(func.language)} text-lg text-gray-600`}></i>
                                <span className="text-sm text-gray-700">{func.language}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-gray-700">{func.memory}MB</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-gray-600">{func.lastDeployed}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  to={`/function/${func.id}`}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-green-50 text-gray-600 hover:text-green-600 transition-colors cursor-pointer"
                                  title="실행"
                                >
                                  <i className="ri-play-circle-line text-xl"></i>
                                </Link>
                                <Link
                                  to={`/function/${func.id}`}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 text-gray-600 hover:text-purple-600 transition-colors cursor-pointer"
                                  title="설정"
                                >
                                  <i className="ri-settings-3-line text-xl"></i>
                                </Link>
                                <button
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    if (window.confirm('정말 삭제하시겠습니까?')) {
                                      try {
                                        await functionApi.deleteFunction(func.id);
                                        setFunctions(prev => prev.filter(f => f.id !== func.id));
                                      } catch (err) {
                                        alert('삭제 실패');
                                      }
                                    }
                                  }}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors cursor-pointer"
                                  title="삭제"
                                >
                                  <i className="ri-delete-bin-line text-xl"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* System Live Log - Below Functions List */}
            <div
              className="bg-gray-900/90 backdrop-blur-sm rounded-2xl border border-gray-700 shadow-2xl overflow-hidden cursor-pointer hover:border-gray-500 transition-colors relative"
            >
              <div
                onClick={() => setShowLogModal(true)}
                className="px-4 py-3 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-xs font-semibold text-gray-300" style={{ fontFamily: 'monospace' }}>
                    System Live Log
                  </span>
                </div>
                <span className="text-xs text-gray-500">실시간</span>
              </div>
              <div
                ref={logContainerRef}
                onClick={(e) => e.stopPropagation()}
                className="p-4 h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
              >
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs" style={{ fontFamily: 'monospace' }}>
                    <span className="text-gray-500">[{log.time}]</span>
                    <span>{log.icon}</span>
                    <span className="text-gray-300 flex-1">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* System Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">시스템 상세 로그</h3>
              <button
                onClick={() => setShowLogModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl text-gray-600"></i>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              <div className="space-y-4">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl">{log.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-500" style={{ fontFamily: 'monospace' }}>
                          {log.time}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${log.type === 'warm' ? 'bg-purple-100 text-purple-700' :
                          log.type === 'tuner' ? 'bg-green-100 text-green-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                          {log.type === 'warm' ? 'Warm Start' : log.type === 'tuner' ? 'Auto-Tuner' : 'Pool Management'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700" style={{ fontFamily: 'monospace' }}>
                        {log.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warm Pool Detail Modal */}
      {showPoolModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-purple-50 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${systemStatus?.status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <h3 className="text-lg font-bold text-gray-900">Warm Pool 상세 정보</h3>
              </div>
              <button
                onClick={() => setShowPoolModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/50 transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl text-gray-600"></i>
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">시스템 상태</div>
                  <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    {systemStatus?.status === 'online' ? 'Online' : 'Offline'}
                    {systemStatus?.status === 'online' && <i className="ri-check-circle-fill text-green-500"></i>}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">Worker Uptime</div>
                  <div className="text-lg font-bold text-gray-900">
                    {systemStatus?.uptime_seconds ?
                      `${Math.floor(systemStatus.uptime_seconds / 3600)}h ${Math.floor((systemStatus.uptime_seconds % 3600) / 60)}m`
                      : '-'}
                  </div>
                </div>
              </div>

              <h4 className="text-sm font-semibold text-gray-700 mb-3">언어별 Warm Container 현황</h4>
              <div className="space-y-3">
                {/* Python */}
                <div className="bg-white border boundary-gray-200 p-4 rounded-xl shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <i className="ri-python-line text-xl text-blue-600"></i>
                      <span className="font-medium">Python 3.11</span>
                    </div>
                    <span className="text-sm font-bold text-blue-600">{systemStatus?.pools?.python || 0} / 5</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${((systemStatus?.pools?.python || 0) / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Node.js */}
                <div className="bg-white border boundary-gray-200 p-4 rounded-xl shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <i className="ri-nodejs-line text-xl text-green-600"></i>
                      <span className="font-medium">Node.js 20</span>
                    </div>
                    <span className="text-sm font-bold text-green-600">{systemStatus?.pools?.nodejs || 0} / 5</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-500 to-teal-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${((systemStatus?.pools?.nodejs || 0) / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* C++ */}
                <div className="bg-white border boundary-gray-200 p-4 rounded-xl shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <i className="ri-code-s-slash-line text-xl text-pink-600"></i>
                      <span className="font-medium">C++ 17</span>
                    </div>
                    <span className="text-sm font-bold text-pink-600">{systemStatus?.pools?.cpp || 0} / 5</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-pink-500 to-rose-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${((systemStatus?.pools?.cpp || 0) / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Go */}
                <div className="bg-white border boundary-gray-200 p-4 rounded-xl shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <i className="ri-terminal-box-line text-xl text-cyan-600"></i>
                      <span className="font-medium">Go 1.21</span>
                    </div>
                    <span className="text-sm font-bold text-cyan-600">{systemStatus?.pools?.go || 0} / 5</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${((systemStatus?.pools?.go || 0) / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-3">
                <i className="ri-information-fill text-blue-500 mt-0.5"></i>
                <div className="text-xs text-blue-800">
                  <p className="font-semibold mb-1">Warm Pool이란?</p>
                  콜드 스타트를 방지하기 위해 미리 준비된 컨테이너입니다.
                  Auto-Tuner가 트래픽에 따라 자동으로 풀 크기를 조절하여 비용과 성능을 최적화합니다.
                </div>
              </div>

              {/* Heartbeat Manual Check */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <button
                  onClick={checkHeartbeat}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-red-100 hover:border-red-200 hover:shadow-md"
                >
                  <i className="ri-heart-pulse-fill text-xl animate-pulse"></i>
                  Heartbeat 상태 확인
                </button>

                {showRawStatus && (
                  <div className="mt-3 p-3 bg-gray-900 rounded-lg text-xs font-mono text-green-400 overflow-x-auto">
                    <div className="flex justify-between items-center mb-1 text-gray-400 border-b border-gray-700 pb-1">
                      <span>Latest Heartbeat</span>
                      <span>{lastHeartbeat}</span>
                    </div>
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(systemStatus, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
